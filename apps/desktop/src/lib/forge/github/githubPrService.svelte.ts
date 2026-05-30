import { injectOptional } from "@gitbutler/core/context";
import type { QueryActionCreatorResult } from "@reduxjs/toolkit/query";
import { createSubscriber } from "svelte/reactivity";
import { ghQuery } from "$lib/forge/github/ghQuery";
import {
	ghResponseToInstance,
	parseGitHubDetailedPullRequest,
	type CreatePrResult,
	type DetailedGitHubPullRequestWithPermissions,
	type GitHubRepoPermissions,
} from "$lib/forge/github/types";
import {
	MergeMethod,
	type CreatePullRequestArgs,
	type DetailedPullRequest,
	type PullRequest,
} from "$lib/forge/interface/types";
import { getPollingInterval, eventualConsistencyCheck } from "$lib/forge/shared/progressivePolling";
import {
	FORGE_SCOPE_SERVICE,
	type ScopedSubscription,
} from "$lib/forge/forgeScopeService.svelte";
import {
	invalidatesScopedItem,
	invalidatesScopedList,
	providesScopedItem,
	ReduxTag,
} from "$lib/state/tags";
import { sleep } from "$lib/utils/sleep";
import { writable } from "svelte/store";
import type { ForgePrService } from "$lib/forge/interface/forgePrService";
import type { BackendApi } from "$lib/state/backendApi";
import type { QueryExtensions, QueryOptions, ReactiveQuery } from "$lib/state/butlerModule";
import type { AppDispatch, GitHubApi } from "$lib/state/clientState.svelte";
import type { PostHogWrapper } from "$lib/telemetry/posthog";

export class GitHubPrService implements ForgePrService {
	readonly unit = { name: "Pull request", abbr: "PR", symbol: "#" };
	loading = writable(false);
	private api: ReturnType<typeof injectEndpoints>;
	private backendApi: ReturnType<typeof injectBackendEndpoints>;

	constructor(
		githubApi: GitHubApi,
		backendApi: BackendApi,
		private posthog?: PostHogWrapper,
		private readonly scopeId?: string,
	) {
		this.api = injectEndpoints(githubApi, scopeId);
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
			return ghResponseToInstance(
				await this.api.endpoints.createPr.mutate({
					head: upstreamName,
					base: baseBranchName,
					title,
					body,
					draft,
				}),
			);
		};

		let attempts = 0;
		let lastError: any;
		let pr: PullRequest | undefined;

		// Use retries since request can fail right after branch push.
		while (attempts < 4) {
			try {
				pr = await request();
				this.posthog?.capture("PR Successful");
				return pr;
			} catch (err: any) {
				lastError = err;
				attempts++;
				await sleep(500);
			} finally {
				this.loading.set(false);
			}
		}
		this.posthog?.capture("PR Failure");
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
		await this.backendApi.endpoints.setDraft.mutate({ projectId, reviewId, draft });
	}
}

async function fetchRepoPermissions(
	owner: string,
	repo: string,
	extra: unknown,
): Promise<GitHubRepoPermissions | undefined> {
	try {
		const repoResponse = await ghQuery(
			{
				domain: "repos",
				action: "get",
				parameters: { owner, repo },
				extra: extra,
			},
			extra,
			"required",
		);

		if (repoResponse.error) {
			throw repoResponse.error;
		}

		return repoResponse.data.permissions;
	} catch (err) {
		console.error(`Exception fetching repository permissions for ${owner}/${repo}:`, err);
		return undefined;
	}
}

function injectBackendEndpoints(api: BackendApi, scopeId?: string) {
	return api.injectEndpoints({
		endpoints: (build) => ({
			setAutoMerge: build.mutation<void, { projectId: string; reviewId: number; enable: boolean }>({
				extraOptions: { command: "set_review_auto_merge" },
				query: (args) => args,
				invalidatesTags: (_res, _err, { reviewId }) => [
					invalidatesScopedItem(ReduxTag.PullRequests, scopeId ?? "", reviewId),
				],
			}),
			setDraft: build.mutation<void, { projectId: string; reviewId: number; draft: boolean }>({
				extraOptions: { command: "set_review_draftiness" },
				query: (args) => args,
				invalidatesTags: (_res, _err, { reviewId }) => [
					invalidatesScopedItem(ReduxTag.PullRequests, scopeId ?? "", reviewId),
				],
			}),
		}),
	});
}

function injectEndpoints(api: GitHubApi, scopeId?: string) {
	return api.injectEndpoints({
		endpoints: (build) => ({
			getPr: build.query<DetailedPullRequest, { number: number }>({
				queryFn: async (args, api) => {
					async function getPrByNumber() {
						return await ghQuery({
							domain: "pulls",
							action: "get",
							parameters: { pull_number: args.number },
							extra: api.extra,
						});
					}

					const prResponse = await eventualConsistencyCheck(getPrByNumber, (response) => {
						if (response.error) {
							return true;
						}
						return response.data?.updated_at !== undefined;
					});

					if (prResponse.error) {
						return { error: prResponse.error };
					}

					const prData = prResponse.data;
					const owner = prData.base?.repo?.owner?.login;
					const repo = prData.base?.repo?.name;

					const permissions =
						owner && repo ? await fetchRepoPermissions(owner, repo, api.extra) : undefined;

					const combinedData: DetailedGitHubPullRequestWithPermissions = {
						...prData,
						permissions,
					};

					const finalResult = parseGitHubDetailedPullRequest({ data: combinedData });

					if (finalResult.error) {
						return { error: finalResult.error };
					}

					return { data: finalResult.data };
				},
				providesTags: (_result, _error, args) =>
					providesScopedItem(ReduxTag.PullRequests, scopeId ?? "", args.number),
			}),
			createPr: build.mutation<
				CreatePrResult,
				{ head: string; base: string; title: string; body: string; draft: boolean }
			>({
				queryFn: async ({ head, base, title, body, draft }, api) =>
					await ghQuery({
						domain: "pulls",
						action: "create",
						parameters: { head, base, title, body, draft },
						extra: api.extra,
					}),
				invalidatesTags: (result) => [
					invalidatesScopedItem(ReduxTag.PullRequests, scopeId ?? "", result?.number),
				],
			}),
			mergePr: build.mutation<void, { number: number; method: MergeMethod }>({
				queryFn: async ({ number, method: method }, api) => {
					const result = await ghQuery({
						domain: "pulls",
						action: "merge",
						parameters: { pull_number: number, merge_method: method },
						extra: api.extra,
					});

					if (result.error) {
						return { error: result.error };
					}

					return { data: undefined };
				},
				invalidatesTags: [invalidatesScopedList(ReduxTag.PullRequests, scopeId ?? "")],
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
				queryFn: async ({ number, update }, api) => {
					const result = await ghQuery({
						domain: "pulls",
						action: "update",
						parameters: {
							pull_number: number,
							base: update.targetBase,
							body: update.description,
							state: update.state,
						},
						extra: api.extra,
					});
					if (result.error) {
						return { error: result.error };
					}
					return { data: undefined };
				},
				invalidatesTags: [invalidatesScopedList(ReduxTag.PullRequests, scopeId ?? "")],
			}),
		}),
	});
}
