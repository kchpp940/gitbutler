import { injectOptional } from "@gitbutler/core/context";
import type { QueryActionCreatorResult } from "@reduxjs/toolkit/query";
import { createSubscriber } from "svelte/reactivity";
import { gitlab } from "$lib/forge/gitlab/gitlabClient.svelte";
import { detailedMrToInstance, mrToInstance } from "$lib/forge/gitlab/types";
import { invalidatesScopedItem, providesScopedItem, ReduxTag, invalidatesScopedList } from "$lib/state/tags";
import { sleep } from "$lib/utils/sleep";
import { toSerializable } from "@gitbutler/shared/network/types";
import { writable } from "svelte/store";
import type { ForgePrService } from "$lib/forge/interface/forgePrService";
import type {
	CreatePullRequestArgs,
	DetailedPullRequest,
	MergeMethod,
	PullRequest,
} from "$lib/forge/interface/types";
import { getPollingInterval } from "$lib/forge/shared/progressivePolling";
import {
	FORGE_SCOPE_SERVICE,
	type ScopedSubscription,
} from "$lib/forge/forgeScopeService.svelte";
import type { BackendApi } from "$lib/state/backendApi";
import type { QueryExtensions, QueryOptions, ReactiveQuery } from "$lib/state/butlerModule";
import type { GitLabApi } from "$lib/state/clientState.svelte";
import type { PostHogWrapper } from "$lib/telemetry/posthog";

export class GitLabPrService implements ForgePrService {
	readonly unit = { name: "Merge request", abbr: "MR", symbol: "!" };
	loading = writable(false);
	private api: ReturnType<typeof injectEndpoints>;
	private backendApi: ReturnType<typeof injectBackendEndpoints>;

	constructor(
		gitlabApi: GitLabApi,
		backendApi: BackendApi,
		private posthog?: PostHogWrapper,
		private readonly scopeId?: string,
	) {
		this.api = injectEndpoints(gitlabApi, scopeId);
		this.backendApi = injectBackendEndpoints(backendApi, scopeId);
	}

	async createPr({
		title,
		body,
		draft,
		baseBranchName,
		upstreamName,
	}: CreatePullRequestArgs): Promise<PullRequest> {
		this.loading.set(true);

		const request = async () => {
			return await this.api.endpoints.createPr.mutate({
				head: upstreamName,
				base: baseBranchName,
				title,
				body,
				draft,
			});
		};

		let attempts = 0;
		let lastError: any;

		// Use retries since request can fail right after branch push.
		while (attempts < 4) {
			try {
				const response = await request();
				this.posthog?.capture("Gitlab MR Successful");
				return response;
			} catch (err: any) {
				lastError = err;
				attempts++;
				await sleep(500);
			} finally {
				this.loading.set(false);
			}
		}
		this.posthog?.capture("Gitlab MR Failure");

		throw lastError;
	}

	async fetch(number: number) {
		const result = this.api.endpoints.getPr.fetch({ number });
		return await result;
	}

	get(number: number): ReactiveQuery<DetailedPullRequest, QueryExtensions> {
		const forgeScopeService = injectOptional(FORGE_SCOPE_SERVICE, undefined);
		const pollingInterval = 60000;

		let query: QueryActionCreatorResult<any> | undefined;

		const subscription: ScopedSubscription = {
			scopeId: this.scopeId ?? "",
			key: `pr:${number}`,
			stop: () => {
				query?.unsubscribe();
			},
			cancel: () => {
				query?.abort();
			},
		};

		if (forgeScopeService) {
			forgeScopeService.registerScopedSubscription(subscription);
		}

		const reactiveQuery = this.api.endpoints.getPr.useQuery({ number }, {
			subscriptionOptions: { pollingInterval },
		});

		const subscribe = createSubscriber(() => {
			query = this.api.endpoints.getPr.subscribe({ number }, {
				subscriptionOptions: { pollingInterval },
			});
			return () => {
				query?.unsubscribe();
			};
		});

		return {
			get result() {
				subscribe();
				return reactiveQuery.result;
			},
			get response() {
				subscribe();
				return reactiveQuery.response;
			},
		};
	}

	async merge(method: MergeMethod, number: number) {
		await this.api.endpoints.mergePr.mutate({ method, number });
	}

	async reopen(number: number) {
		await this.api.endpoints.updatePr.mutate({
			number,
			update: { state: "open" },
		});
	}

	async update(
		number: number,
		update: { description?: string; state?: "open" | "closed"; targetBase?: string },
	) {
		await this.api.endpoints.updatePr.mutate({ number, update });
	}

	async setDraft(projectId: string, reviewId: number, draft: boolean) {
		await this.backendApi.endpoints.setDraftMR.mutate({ projectId, reviewId, draft });
	}
}

function injectBackendEndpoints(api: BackendApi, scopeId?: string) {
	return api.injectEndpoints({
		endpoints: (build) => ({
			setAutoMergeMR: build.mutation<
				void,
				{ projectId: string; reviewId: number; enable: boolean }
			>({
				extraOptions: { command: "set_review_auto_merge" },
				query: (args) => args,
				invalidatesTags: (_res, _err, { reviewId }) => [
					invalidatesScopedItem(ReduxTag.GitlabMRs, scopeId ?? "", reviewId),
				],
			}),
			setDraftMR: build.mutation<void, { projectId: string; reviewId: number; draft: boolean }>({
				extraOptions: { command: "set_review_draftiness" },
				query: (args) => args,
				invalidatesTags: (_res, _err, { reviewId }) => [
					invalidatesScopedItem(ReduxTag.GitlabMRs, scopeId ?? "", reviewId),
				],
			}),
		}),
	});
}

function injectEndpoints(api: GitLabApi, scopeId?: string) {
	return api.injectEndpoints({
		endpoints: (build) => ({
			getPr: build.query<DetailedPullRequest, { number: number }>({
				queryFn: async (args, query) => {
					try {
						const { api, upstreamProjectId } = gitlab(query.extra);
						const mr = await api.MergeRequests.show(upstreamProjectId, args.number);
						const sourceProject = await api.Projects.show(mr.source_project_id);
						const repositorySshUrl = sourceProject.ssh_url_to_repo;
						const repositoryHttpsUrl = sourceProject.http_url_to_repo;
						const data = {
							...detailedMrToInstance(mr),
							repositoryHttpsUrl,
							repositorySshUrl,
						};
						return { data };
					} catch (e: unknown) {
						return { error: toSerializable(e) };
					}
				},
				providesTags: (_result, _error, args) => providesScopedItem(ReduxTag.GitlabMRs, scopeId ?? "", args.number),
			}),
			createPr: build.mutation<
				PullRequest,
				{ head: string; base: string; title: string; body: string; draft: boolean }
			>({
				queryFn: async ({ head, base, title, body, draft }, query) => {
					try {
						const { api, upstreamProjectId, forkProjectId } = gitlab(query.extra);
						const upstreamProject = await api.Projects.show(upstreamProjectId);

						// GitLab uses title prefix to mark drafts: "Draft:", "[Draft]", or "(Draft)"
						const finalTitle = draft ? `Draft: ${title}` : title;

						const mr = await api.MergeRequests.create(forkProjectId, head, base, finalTitle, {
							description: body,
							targetProjectId: upstreamProject.id,
							removeSourceBranch: true,
						});
						return { data: mrToInstance(mr) };
					} catch (e: unknown) {
						return { error: toSerializable(e) };
					}
				},
				invalidatesTags: (result) => [invalidatesScopedItem(ReduxTag.GitlabMRs, scopeId ?? "", result?.number)],
			}),
			mergePr: build.mutation<undefined, { number: number; method: MergeMethod }>({
				queryFn: async ({ number, method }, query) => {
					try {
						const { api, upstreamProjectId } = gitlab(query.extra);

						// Note: GitLab's rebase is not supported here as it requires a two-step async process.
						// See: https://github.com/gitbutlerapp/gitbutler/pull/11611

						// For 'merge' and 'squash' methods, use the merge API directly
						await api.MergeRequests.merge(upstreamProjectId, number, {
							squash: method === "squash",
							shouldRemoveSourceBranch: true,
						});
						return { data: undefined };
					} catch (e: unknown) {
						return { error: toSerializable(e) };
					}
				},
				invalidatesTags: [invalidatesScopedList(ReduxTag.GitlabMRs, scopeId ?? "")],
			}),
			updatePr: build.mutation<
				void,
				{
					number: number;
					update: {
						targetBase?: string;
						description?: string;
						state?: "open" | "closed";
					};
				}
			>({
				queryFn: async ({ number, update }, query) => {
					try {
						const { api, upstreamProjectId } = gitlab(query.extra);
						await api.MergeRequests.edit(upstreamProjectId, number, {
							targetBranch: update.targetBase,
							description: update.description,
						});
						return { data: undefined };
					} catch (e: unknown) {
						return { error: toSerializable(e) };
					}
				},
				invalidatesTags: [invalidatesScopedList(ReduxTag.GitlabMRs, scopeId ?? "")],
			}),
		}),
	});
}
