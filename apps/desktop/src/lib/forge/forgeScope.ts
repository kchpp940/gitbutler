import { hashCode } from "@gitbutler/ui/utils/string";

export type ForgeProvider = "github" | "gitlab";

export interface ForgeScope {
	readonly projectId: string;
	readonly provider: ForgeProvider;
	readonly owner: string;
	readonly repo: string;
	readonly tokenId: string;
}

export function createTokenId(token: string | undefined): string {
	if (!token) return "no-token";
	return `t_${hashCode(token)}`;
}

export function createScopeId(scope: ForgeScope): string {
	return `${scope.projectId}:${scope.provider}:${scope.owner}/${scope.repo}:${scope.tokenId}`;
}

export function scopedListId(scope: ForgeScope): string {
	return `${scope.provider}:${scope.owner}:${scope.repo}:${scope.tokenId}:LIST`;
}

export function scopedItemId(scope: ForgeScope, itemId: string): string {
	return `${scope.provider}:${scope.owner}:${scope.repo}:${scope.tokenId}:${itemId}`;
}

export function scopesEqual(a: ForgeScope | undefined, b: ForgeScope | undefined): boolean {
	if (!a || !b) return false;
	return (
		a.projectId === b.projectId &&
		a.provider === b.provider &&
		a.owner === b.owner &&
		a.repo === b.repo &&
		a.tokenId === b.tokenId
	);
}
