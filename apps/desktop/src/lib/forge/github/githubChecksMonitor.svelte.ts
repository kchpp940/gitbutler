import { ghQuery } from "$lib/forge/github/ghQuery";
import { type ChecksResult } from "$lib/forge/github/types";
import { eventualConsistencyCheck } from "$lib/forge/shared/progressivePolling";
import { providesItem, ReduxTag } from "$lib/state/tags";
import type { ChecksService } from "$lib/forge/interface/forgeChecksMonitor";
import type { ChecksStatus } from "$lib/forge/interface/types";
import type { QueryExtensions, ReactiveQuery } from "$lib/state/butlerModule";
import type { QueryActionCreatorResult, QueryOptions } from "@reduxjs/toolkit/query";
import type { GitHubApi, AppDispatch } from "$lib/state/clientState.svelte";

export class GitHubChecksMonitor implements ChecksService {
	private api: ReturnType<typeof injectEndpoints>;
	readonly scopeId: string;
	private subscriptionHandles = new Map<string, QueryActionCreatorResult<any>>();

	constructor(
		gitHubApi: GitHubApi,
		private readonly dispatch: AppDispatch,
		private readonly getState: () => any,
		scopeId: string,
	) {
		this.api = injectEndpoints(gitHubApi);
		this.scopeId = scopeId;
	}

	private ensureSubscription(
		queryArg: { scopeId: string; ref: string },
		pollingInterval?: number,
	): void {
		const cacheKey = `${queryArg.scopeId}:${queryArg.ref}`;
		if (!this.subscriptionHandles.has(cacheKey)) {
			const result = this.dispatch(
				this.api.endpoints.listChecks.initiate(queryArg, {
					subscribe: true,
					subscriptionOptions: pollingInterval ? { pollingInterval } : undefined,
				}),
			);
			this.subscriptionHandles.set(cacheKey, result);
		}
	}

	get(branchName: string, options?: QueryOptions): ReactiveQuery<ChecksStatus | null, QueryExtensions> {
		const queryArg = { scopeId: this.scopeId, ref: branchName };
		const pollingInterval = (options?.subscriptionOptions as { pollingInterval?: number } | undefined)?.pollingInterval;
		this.ensureSubscription(queryArg, pollingInterval);
		const cacheKey = `${this.scopeId}:${branchName}`;

		const selector = this.api.endpoints.listChecks.select(queryArg);
		const storeResult = $derived(selector(this.getState()));
		const output = $derived.by(() => {
			const data = storeResult.data ? parseChecks(storeResult.data) : null;
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

	async fetch(branchName: string, options?: QueryOptions) {
		return await this.api.endpoints.listChecks.fetch(
			{ scopeId: this.scopeId, ref: branchName },
			{
				transform: (result) => parseChecks(result),
				forceRefetch: options?.forceRefetch,
			},
		);
	}

	dispose(): void {
		for (const [, handle] of this.subscriptionHandles) {
			handle.unsubscribe();
		}
		this.subscriptionHandles.clear();
	}
}

function hasChecks(data: ChecksResult): boolean {
	return data.check_runs.length > 0;
}

function parseChecks(data: ChecksResult): ChecksStatus | null {
	if (!hasChecks(data)) return null;

	const checkRuns = data.check_runs;

	const starts = checkRuns
		.map((run) => run.started_at)
		.filter((startedAt) => startedAt !== null) as string[];
	const startTimes = starts.map((startedAt) => new Date(startedAt));

	const failedChecks = checkRuns.filter((c) => c.conclusion === "failure");
	const failed = failedChecks.length;
	const actionRequired = checkRuns.filter((c) => c.conclusion === "action_required").length;

	const firstStart = new Date(Math.min(...startTimes.map((date) => date.getTime())));
	const completed = failed !== 0 || checkRuns.every((check) => !!check.completed_at);

	const success = failed === 0 && completed && actionRequired === 0;

	return {
		startedAt: firstStart.toISOString(),
		success,
		completed,
		failedChecks: failedChecks.map((check) => check.name),
	};
}

function injectEndpoints(api: GitHubApi) {
	return api.injectEndpoints({
		endpoints: (build) => ({
			listChecks: build.query<ChecksResult, { scopeId: string; ref: string }>({
				queryFn: async ({ ref }, api) => {
					async function listChecksForRef() {
						return await ghQuery({
							domain: "checks",
							action: "listForRef",
							extra: api.extra,
							parameters: {
								ref,
								per_page: 100,
							},
						});
					}

					return eventualConsistencyCheck(listChecksForRef, (response) => {
						if (response.error) {
							return true;
						}
						return hasChecks(response.data);
					});
				},
				providesTags: (_result, _error, { scopeId, ref }) => [
					...providesItem(ReduxTag.Checks, ref, scopeId),
				],
			}),
		}),
	});
}
