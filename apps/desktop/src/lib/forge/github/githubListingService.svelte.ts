import { ghQuery } from "$lib/forge/github/ghQuery";
import { ghResponseToInstance } from "$lib/forge/github/types";
import {
	mapForgeReviewToPullRequest,
	type ForgeReview,
	type PullRequest,
} from "$lib/forge/interface/types";
import { createSelectByIds } from "$lib/state/customSelectors";
import { invalidatesList, providesList, ReduxTag } from "$lib/state/tags";
import { isDefined } from "@gitbutler/ui/utils/typeguards";
import { createEntityAdapter, type EntityState } from "@reduxjs/toolkit";
import type { QueryActionCreatorResult } from "@reduxjs/toolkit/query";
import type { ForgeListingService } from "$lib/forge/interface/forgeListingService";
import type { QueryExtensions, ReactiveQuery } from "$lib/state/butlerModule";
import type { BackendApi } from "$lib/state/backendApi";
import type { AppDispatch, GitHubApi } from "$lib/state/clientState.svelte";

export class GitHubListingService implements ForgeListingService {
	private api: ReturnType<typeof injectEndpoints>;
	private backendApi: ReturnType<typeof injectBackendEndpoints>;
	readonly scopeId: string;
	private subscriptionHandles = new Map<string, QueryActionCreatorResult<any>>();

	constructor(
		gitHubApi: GitHubApi,
		backendApi: BackendApi,
		private readonly dispatch: AppDispatch,
		private readonly getState: () => any,
		scopeId: string,
	) {
		this.api = injectEndpoints(gitHubApi);
		this.backendApi = injectBackendEndpoints(backendApi);
		this.scopeId = scopeId;
	}

	private ensureSubscription(
		queryArg: { projectId: string; scopeId: string },
		pollingInterval?: number,
	): void {
		const cacheKey = `${queryArg.projectId}:${queryArg.scopeId}`;
		if (!this.subscriptionHandles.has(cacheKey)) {
			const result = this.dispatch(
				this.backendApi.endpoints.listPrs.initiate(queryArg, {
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

		const selector = this.backendApi.endpoints.listPrs.select(queryArg);
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

		const selector = this.backendApi.endpoints.listPrs.select(queryArg);
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
		return this.backendApi.endpoints.listPrs.useQueryState(
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
			this.backendApi.util.invalidateTags([invalidatesList(ReduxTag.PullRequests, this.scopeId)]),
		);
	}

	dispose(): void {
		for (const [, handle] of this.subscriptionHandles) {
			handle.unsubscribe();
		}
		this.subscriptionHandles.clear();
		this.dispatch(
			this.backendApi.util.invalidateTags([invalidatesList(ReduxTag.PullRequests, this.scopeId)]),
		);
	}
}

function injectBackendEndpoints(api: BackendApi) {
	return api.injectEndpoints({
		endpoints: (build) => ({
			listPrs: build.query<
				EntityState<PullRequest, string>,
				{ projectId: string; scopeId: string }
			>({
				extraOptions: {
					command: "list_reviews",
				},
				query: ({ projectId }) => ({ projectId }),
				transformResponse: (response: ForgeReview[]) => {
					const prs = response.map((pr) => mapForgeReviewToPullRequest(pr));
					return prAdapter.addMany(prAdapter.getInitialState(), prs);
				},
				providesTags: (_result, _error, { scopeId }) => [providesList(ReduxTag.PullRequests, scopeId)],
			}),
		}),
	});
}

function injectEndpoints(api: GitHubApi) {
	return api.injectEndpoints({
		endpoints: (build) => ({
			listPrsByBranch: build.query<
				PullRequest | null,
				{ projectId: string; scopeId: string; branchName: string }
			>({
				queryFn: async ({ branchName }, api) => {
					const result = await ghQuery<"pulls", "list", "required">(
						async (octokit, repository) => ({
							data: await octokit.paginate(octokit.rest.pulls.list, {
								...repository,
								head: `${repository.owner}:${branchName}`,
							}),
						}),
						api.extra,
						"required",
					);

					if (result.error) {
						return { error: result.error };
					}

					if (result.data.length === 0) {
						return { data: null };
					}

					if (result.data.length > 1) {
						return { error: new Error(`Multiple pull requests found for branch ${branchName}`) };
					}

					const prData = result.data[0]!;

					const pr = ghResponseToInstance(prData);
					return { data: pr };
				},
			}),
		}),
	});
}

const prAdapter = createEntityAdapter<PullRequest, string>({
	selectId: (pr) => pr.sourceBranch,
});

const prSelectors = { ...prAdapter.getSelectors(), selectByIds: createSelectByIds<PullRequest>() };
