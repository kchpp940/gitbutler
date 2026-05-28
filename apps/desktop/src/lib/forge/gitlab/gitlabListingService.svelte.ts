import { gitlab } from "$lib/forge/gitlab/gitlabClient.svelte";
import { mrToInstance } from "$lib/forge/gitlab/types";
import { createSelectByIds } from "$lib/state/customSelectors";
import { invalidatesList, providesList, ReduxTag } from "$lib/state/tags";
import { toSerializable } from "@gitbutler/shared/network/types";
import { isDefined } from "@gitbutler/ui/utils/typeguards";
import { createEntityAdapter, type EntityState } from "@reduxjs/toolkit";
import type { QueryActionCreatorResult } from "@reduxjs/toolkit/query";
import type { ForgeListingService } from "$lib/forge/interface/forgeListingService";
import type { PullRequest } from "$lib/forge/interface/types";
import type { QueryExtensions, ReactiveQuery } from "$lib/state/butlerModule";
import type { AppDispatch, GitLabApi } from "$lib/state/clientState.svelte";

export class GitLabListingService implements ForgeListingService {
	private api: ReturnType<typeof injectEndpoints>;
	readonly scopeId: string;
	private subscriptionHandles = new Map<string, QueryActionCreatorResult<any>>();

	constructor(
		gitLabApi: GitLabApi,
		private readonly dispatch: AppDispatch,
		private readonly getState: () => any,
		scopeId: string,
	) {
		this.api = injectEndpoints(gitLabApi);
		this.scopeId = scopeId;
	}

	private ensureSubscription(
		queryArg: { projectId: string; scopeId: string },
		pollingInterval?: number,
	): void {
		const cacheKey = `${queryArg.projectId}:${queryArg.scopeId}`;
		if (!this.subscriptionHandles.has(cacheKey)) {
			const result = this.dispatch(
				this.api.endpoints.listPrs.initiate(queryArg, {
					subscribe: true,
					subscriptionOptions: pollingInterval ? { pollingInterval } : undefined,
				}),
			);
			this.subscriptionHandles.set(cacheKey, result);
		}
	}

	list(projectId: string, pollingInterval?: number): ReactiveQuery<PullRequest[], QueryExtensions> {
		const queryArg = { projectId, scopeId: this.scopeId };
		this.ensureSubscription(queryArg, pollingInterval);
		const cacheKey = `${projectId}:${this.scopeId}`;

		const selector = this.api.endpoints.listPrs.select(queryArg);
		const storeResult = $derived(selector(this.getState()));
		const output = $derived.by(() => {
			let data = storeResult.data;
			if (data) data = prSelectors.selectAll(data);
			return {
				...storeResult,
				data,
				refetch: async () => {
					const handle = this.subscriptionHandles.get(cacheKey);
					await handle?.refetch();
				},
			};
		});

		return {
			get result() {
				return output;
			},
			get response() {
				return output.data;
			},
		};
	}

	getByBranch(projectId: string, branchName: string) {
		const queryArg = { projectId, scopeId: this.scopeId };
		this.ensureSubscription(queryArg);

		const selector = this.api.endpoints.listPrs.select(queryArg);
		const storeResult = $derived(selector(this.getState()));
		const output = $derived.by(() => {
			const data = storeResult.data
				? prSelectors.selectById(storeResult.data, branchName)
				: undefined;
			return { ...storeResult, data };
		});

		return {
			get result() {
				return output;
			},
			get response() {
				return output.data;
			},
		};
	}

	filterByBranch(projectId: string, branchName: string[]) {
		return this.api.endpoints.listPrs.useQueryState(
			{ projectId, scopeId: this.scopeId },
			{
				transform: (result) => prSelectors.selectByIds(result, branchName),
			},
		);
	}

	async fetchByBranch(projectId: string, branchNames: string[]) {
		const results = await Promise.all(
			branchNames.map((branch) =>
				this.api.endpoints.listPrsByBranch.fetch({
					projectId,
					scopeId: this.scopeId,
					branchName: branch,
				}),
			),
		);
		return results.filter(isDefined) ?? [];
	}

	async refresh(_projectId: string): Promise<void> {
		this.dispatch(
			this.api.util.invalidateTags([invalidatesList(ReduxTag.PullRequests, this.scopeId)]),
		);
	}

	dispose(): void {
		for (const [, handle] of this.subscriptionHandles) {
			handle.unsubscribe();
		}
		this.subscriptionHandles.clear();
		this.dispatch(
			this.api.util.invalidateTags([invalidatesList(ReduxTag.PullRequests, this.scopeId)]),
		);
	}
}

function injectEndpoints(api: GitLabApi) {
	return api.injectEndpoints({
		endpoints: (build) => ({
			listPrs: build.query<
				EntityState<PullRequest, string>,
				{ projectId: string; scopeId: string }
			>({
				queryFn: async (_, query) => {
					try {
						const { api, upstreamProjectId, forkProjectId } = gitlab(query.extra);
						const upstreamMrs = await api.MergeRequests.all({
							projectId: upstreamProjectId,
							state: "opened",
						});
						const forkMrs = await api.MergeRequests.all({
							projectId: forkProjectId,
							state: "opened",
						});

						return {
							data: prAdapter.addMany(
								prAdapter.getInitialState(),
								[...upstreamMrs, ...forkMrs].map((mr) => mrToInstance(mr)),
							),
						};
					} catch (e: unknown) {
						return { error: toSerializable(e) };
					}
				},
				providesTags: (_result, _error, { scopeId }) => [providesList(ReduxTag.PullRequests, scopeId)],
			}),
			listPrsByBranch: build.query<
				PullRequest | null,
				{ projectId: string; scopeId: string; branchName: string }
			>({
				queryFn: async ({ branchName }, query) => {
					try {
						const { api, upstreamProjectId, forkProjectId } = gitlab(query.extra);
						const upstreamMrs = await api.MergeRequests.all({
							projectId: upstreamProjectId,
							sourceBranch: branchName,
							state: "opened",
						});
						const forkMrs = await api.MergeRequests.all({
							projectId: forkProjectId,
							sourceBranch: branchName,
							state: "opened",
						});

						const allMrs = [...upstreamMrs, ...forkMrs];
						if (allMrs.length === 0) {
							return { data: null };
						}

						if (allMrs.length > 1) {
							return { error: new Error(`Multiple merge requests found for branch ${branchName}`) };
						}

						const mrData = allMrs[0]!;
						const mr = mrToInstance(mrData);

						return {
							data: mr,
						};
					} catch (e: unknown) {
						return { error: toSerializable(e) };
					}
				},
			}),
		}),
	});
}

const prAdapter = createEntityAdapter<PullRequest, string>({
	selectId: (pr) => pr.sourceBranch,
});

const prSelectors = { ...prAdapter.getSelectors(), selectByIds: createSelectByIds<PullRequest>() };
