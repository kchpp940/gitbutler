import { computeForgeScopeId, type ForgeScope, type ForgeScopeId } from "$lib/forge/forgeScope";
import { AZURE_DOMAIN } from "$lib/forge/azure/azure";
import { BITBUCKET_DOMAIN } from "$lib/forge/bitbucket/bitbucket";
import { GITHUB_DOMAIN } from "$lib/forge/github/github";
import { GITLAB_DOMAIN, GITLAB_SUB_DOMAIN } from "$lib/forge/gitlab/gitlab";
import type { ForgeName } from "$lib/forge/interface/forge";
import type { ForgeProvider } from "$lib/baseBranch/baseBranch";
import type { RepoInfo } from "$lib/git/gitUrl";

export type ForgeScopeInput = {
	repo: RepoInfo | undefined;
	pushRepo: RepoInfo | undefined;
	baseBranch: string | undefined;
	forgeProvider: ForgeProvider | undefined;
	forgeOverride: ForgeName | undefined;
	githubAccountKey: string | undefined;
	gitlabAccountKey: string | undefined;
	githubAuthenticated: boolean;
	gitlabAuthenticated: boolean;
};

export function computeForgeScope(input: ForgeScopeInput): ForgeScope | undefined {
	const { repo, baseBranch } = input;
	if (!repo || !baseBranch) return undefined;

	const forgeName = determineForgeType(repo, input.forgeProvider);
	const effectiveForge =
		forgeName === "default" && input.forgeOverride ? input.forgeOverride : forgeName;

	const isGitHub = effectiveForge === "github";
	const isGitLab = effectiveForge === "gitlab";

	const accountKey = isGitHub
		? input.githubAccountKey ?? "anonymous"
		: isGitLab
			? input.gitlabAccountKey ?? "anonymous"
			: "none";

	const authenticated = isGitHub
		? input.githubAuthenticated
		: isGitLab
			? input.gitlabAuthenticated
			: false;

	return {
		id: computeForgeScopeId(effectiveForge, repo, accountKey),
		forgeName: effectiveForge,
		repo,
		pushRepo: input.pushRepo,
		baseBranch,
		accountKey,
		authenticated,
	};
}

function determineForgeType(
	repo: RepoInfo,
	detectedForgeProvider: ForgeProvider | undefined,
): ForgeName {
	if (detectedForgeProvider) {
		return detectedForgeProvider;
	}
	const domain = repo.domain;

	if (domain.includes(GITHUB_DOMAIN)) {
		return "github";
	}
	if (
		domain === GITLAB_DOMAIN ||
		domain.startsWith(GITLAB_SUB_DOMAIN + ".") ||
		domain.startsWith("xy" + GITLAB_SUB_DOMAIN + ".")
	) {
		return "gitlab";
	}
	if (domain.includes(BITBUCKET_DOMAIN)) {
		return "bitbucket";
	}
	if (domain.includes(AZURE_DOMAIN)) {
		return "azure";
	}

	return "default";
}

export function scopeIdChanged(
	prev: ForgeScopeId | undefined,
	next: ForgeScope | undefined,
): boolean {
	return next !== undefined && prev !== next.id;
}
