import type { ForgeName } from "$lib/forge/interface/forge";
import type { RepoInfo } from "$lib/git/gitUrl";

export type ForgeScopeId = string;

export interface ForgeScope {
	readonly id: ForgeScopeId;
	readonly forgeName: ForgeName;
	readonly repo: RepoInfo;
	readonly pushRepo?: RepoInfo;
	readonly baseBranch: string;
	readonly accountKey: string;
	readonly authenticated: boolean;
}

const SCOPE_SEP = "/";

export function computeForgeScopeId(
	forgeName: ForgeName,
	repo: RepoInfo,
	accountKey: string,
): ForgeScopeId {
	return `${forgeName}${SCOPE_SEP}${repo.domain}${SCOPE_SEP}${repo.owner}${SCOPE_SEP}${repo.name}${SCOPE_SEP}${accountKey}`;
}
