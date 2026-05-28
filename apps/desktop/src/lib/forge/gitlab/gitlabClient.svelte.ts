import { Gitlab } from "@gitbeaker/rest";
import { InjectionToken } from "@gitbutler/core/context";
import { hashCode } from "@gitbutler/ui/utils/string";
import type { GitLabProjectId } from "$lib/forge/gitlab/gitlab";
import type { ApiClient } from "$lib/forge/interface/apiClient";

type GitlabInstance = InstanceType<typeof Gitlab<false>>;

export const GITLAB_CLIENT = new InjectionToken<GitLabClient>("GitLabClient");

export class GitLabClient implements ApiClient {
	private _api: GitlabInstance | undefined;
	private _instanceUrl: string | undefined;
	private _accessToken: string | undefined;
	private _forkProjectId: string | undefined;
	private _upstreamProjectId: string | undefined;
	private subscriptions: (() => void)[] = [];

	constructor() {}

	get api(): GitlabInstance | undefined {
		return this._api;
	}

	get forkProjectId(): string | undefined {
		return this._forkProjectId;
	}

	get upstreamProjectId(): string | undefined {
		return this._upstreamProjectId;
	}

	get accessToken(): string | undefined {
		return this._accessToken;
	}

	get tokenId(): string {
		if (!this._accessToken) return "no-token";
		return `gl_${hashCode(this._accessToken)}`;
	}

	onReset(fn: () => void) {
		this.subscriptions.push(fn);
		return () => (this.subscriptions = this.subscriptions.filter((cb) => cb !== fn));
	}

	set(
		instanceUrl: string | undefined,
		accessToken: string,
		forkProjectId: GitLabProjectId,
		upstreamProjectId: GitLabProjectId,
	) {
		const unchanged =
			instanceUrl === this._instanceUrl &&
			accessToken === this._accessToken &&
			forkProjectId === this._forkProjectId &&
			upstreamProjectId === this._upstreamProjectId;

		if (unchanged) {
			return;
		}

		this._instanceUrl = instanceUrl;
		this._accessToken = accessToken;
		this._forkProjectId = forkProjectId;
		this._upstreamProjectId = upstreamProjectId;
		this._api = new Gitlab({
			host: instanceUrl,
			token: accessToken,
		});
		this.subscriptions.every((cb) => cb());
	}
}

export function gitlab(extra: unknown): {
	api: GitlabInstance;
	forkProjectId: string;
	upstreamProjectId: string;
} {
	if (!hasGitLab(extra)) throw new Error("No GitLab client!");
	if (!extra.gitLabClient.api) throw new Error("Failed to find GitLab client");
	if (!extra.gitLabClient.forkProjectId) throw new Error("Failed to find fork project ID");
	if (!extra.gitLabClient.upstreamProjectId) throw new Error("Failed to find upstream project ID");

	// Equivalent to using the readable's `get` function
	return {
		api: extra.gitLabClient.api!,
		forkProjectId: extra.gitLabClient.forkProjectId,
		upstreamProjectId: extra.gitLabClient.upstreamProjectId,
	};
}

function hasGitLab(extra: unknown): extra is {
	gitLabClient: GitLabClient;
} {
	return (
		!!extra &&
		typeof extra === "object" &&
		extra !== null &&
		"gitLabClient" in extra &&
		extra.gitLabClient instanceof GitLabClient
	);
}
