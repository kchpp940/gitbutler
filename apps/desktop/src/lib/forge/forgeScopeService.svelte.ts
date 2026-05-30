import { computeForgeScope, type ForgeScopeInput } from "$lib/forge/forgeScopeResolver";
import type { ForgeScope, ForgeScopeId } from "$lib/forge/forgeScope";
import { InjectionToken } from "@gitbutler/core/context";
import type { DefaultForgeFactory } from "$lib/forge/forgeFactory.svelte";
import type { BackendApi } from "$lib/state/backendApi";
import type { AppDispatch } from "$lib/state/clientState.svelte";
import {
	invalidatesScope,
	providesScopedItem,
	providesScopedList,
	ReduxTag,
} from "$lib/state/tags";
import type { Code } from "@gitbutler/but-sdk";

export const FORGE_SCOPE_SERVICE = new InjectionToken<ForgeScopeService>("ForgeScopeService");

const SCOPE_CACHE_TAGS: ReduxTag[] = [
	ReduxTag.PullRequests,
	ReduxTag.Checks,
	ReduxTag.GitlabMRs,
	ReduxTag.ForgeUser,
	ReduxTag.RepoInfo,
];

export interface ScopedSubscription {
	readonly scopeId: string;
	readonly key: string;
	stop(): void;
	cancel(): void;
}

export class ForgeScopeService {
	private _scope = $state<ForgeScope | undefined>(undefined);
	private _previousScopeId: ForgeScopeId | undefined = undefined;
	private _isLoading = $state(false);
	private _error = $state<{ code?: Code; message: string } | undefined>(undefined);
	private _subscriptions = new Map<string, ScopedSubscription>();

	constructor(
		private readonly forgeFactory: DefaultForgeFactory,
		private readonly backendApi: BackendApi,
		private readonly dispatch: AppDispatch,
	) {}

	get scope(): ForgeScope | undefined {
		return this._scope;
	}

	get scopeId(): ForgeScopeId | undefined {
		return this._scope?.id;
	}

	get isLoading(): boolean {
		return this._isLoading;
	}

	get error(): { code?: Code; message: string } | undefined {
		return this._error;
	}

	updateScope(input: ForgeScopeInput & { forgeIsLoading?: boolean; githubError?: { code?: Code; message: string } | undefined }) {
		const newScope = computeForgeScope(input);
		this._isLoading = input.forgeIsLoading ?? false;
		this._error = input.githubError;

		if (newScope && newScope.id !== this._previousScopeId) {
			this.transitionScope(newScope);
		} else if (!newScope && this._previousScopeId) {
			this.clearScope();
		}
	}

	registerScopedSubscription(subscription: ScopedSubscription): () => void {
		this._subscriptions.set(subscription.key, subscription);
		return () => {
			this._subscriptions.delete(subscription.key);
		};
	}

	private transitionScope(newScope: ForgeScope) {
		if (this._previousScopeId) {
			this.teardownOldScope(this._previousScopeId);
		}

		this._previousScopeId = newScope.id;
		this._scope = newScope;
		this.forgeFactory.setScope(newScope, this._isLoading, this._error);
	}

	private clearScope() {
		if (this._previousScopeId) {
			this.teardownOldScope(this._previousScopeId);
		}
		this._previousScopeId = undefined;
		this._scope = undefined;
	}

	private teardownOldScope(oldScopeId: ForgeScopeId) {
		for (const sub of this._subscriptions.values()) {
			if (sub.scopeId === oldScopeId) {
				sub.cancel();
				sub.stop();
			}
		}

		for (const [key, sub] of this._subscriptions) {
			if (sub.scopeId === oldScopeId) {
				this._subscriptions.delete(key);
			}
		}

		this.dispatch(
			this.backendApi.util.invalidateTags(
				invalidatesScope(oldScopeId, SCOPE_CACHE_TAGS),
			),
		);
	}

	refreshPrs() {
		if (this._scope) {
			this.dispatch(
				this.backendApi.util.invalidateTags([
					providesScopedList(ReduxTag.PullRequests, this._scope.id),
				]),
			);
		}
	}

	refreshChecks(branchName: string) {
		if (this._scope) {
			this.dispatch(
				this.backendApi.util.invalidateTags(
					providesScopedItem(ReduxTag.Checks, this._scope.id, branchName),
				),
			);
		}
	}
}
