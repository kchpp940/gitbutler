import { injectOptional } from "@gitbutler/core/context";
import { FORGE_SCOPE_SERVICE, type ScopedSubscription } from "$lib/forge/forgeScopeService.svelte";
import { ghQuery } from "$lib/forge/github/ghQuery";
import { type ChecksResult } from "$lib/forge/github/types";
import { eventualConsistencyCheck, getPollingInterval } from "$lib/forge/shared/progressivePolling";
import { providesScopedItem, ReduxTag } from "$lib/state/tags";
import type { ChecksService } from "$lib/forge/interface/forgeChecksMonitor";
import type { ChecksStatus } from "$lib/forge/interface/types";
import type { QueryOptions } from "$lib/state/butlerModule";
import type { GitHubApi } from "$lib/state/clientState.svelte";

export class GitHubChecksMonitor implements ChecksService {
	private api: ReturnType<typeof injectEndpoints>;

	constructor(
		gitHubApi: GitHubApi,
		private readonly scopeId?: string,
	) {
		this.api = injectEndpoints(gitHubApi, scopeId);
	}

	get(branch: string) {
		const forgeScopeService = injectOptional(FORGE_SCOPE_SERVICE, undefined);

		const pollingInterval = getPollingInterval(0, false) || 30000;
		const endpoint = this.api.endpoints.listChecks;
		const queryArg = { ref: branch };

		const query = endpoint.subscribe(queryArg, {
			subscriptionOptions: { pollingInterval },
		});

		const stateQuery = endpoint.useQueryState(queryArg, {
			transform: (result) => parseChecks(result),
		});

		const subscription: ScopedSubscription = {
			scopeId: this.scopeId ?? "",
			key: `checks:${branch}`,
			stop: () => query.unsubscribe(),
			cancel: () => {
				if ("abort" in query && typeof query.abort === "function") {
					query.abort();
				}
			},
		};

		if (forgeScopeService) {
			forgeScopeService.registerScopedSubscription(subscription);
		}

		async function refetch() {
			await query.refetch();
		}

		return {
			get result() {
				return {
					...stateQuery.result,
					refetch,
				};
			},
			get response() {
				return stateQuery.response;
			},
		};
	}

	async fetch(branchName: string, options?: QueryOptions) {
		return await this.api.endpoints.listChecks.fetch(
			{ ref: branchName },
			{
				transform: (result) => parseChecks(result),
				...options,
			},
		);
	}
}

function hasChecks(data: ChecksResult): boolean {
	return data.check_runs.length > 0;
}

function parseChecks(data: ChecksResult): ChecksStatus | null {
	// Fetch with retries since checks might not be available _right_ after
	// the pull request has been created.

	// If there are no checks then there is no status to report
	if (!hasChecks(data)) return null;

	const checkRuns = data.check_runs;

	// Establish when the first check started running, useful for showing
	// how long something has been running.
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

function injectEndpoints(api: GitHubApi, scopeId?: string) {
	return api.injectEndpoints({
		endpoints: (build) => ({
			listChecks: build.query<ChecksResult, { ref: string }>({
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
				providesTags: (_result, _error, args) => [
					...providesScopedItem(ReduxTag.Checks, scopeId ?? "", args.ref),
				],
			}),
		}),
	});
}
