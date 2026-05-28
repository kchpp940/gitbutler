// TODO: Refactor this enum into an object conataining invalidation rules.
export enum ReduxTag {
	HeadMetadata = "HeadMetadata",
	HeadSha = "HeadSha",
	Diff = "Diff",
	Stacks = "Stacks",
	StackDetails = "StackDetails",
	WorktreeChanges = "WorktreeChanges",
	CommitChanges = "CommitChanges",
	/**
	 * Use stack id when invalidating this tag since invalidating just one
	 * branch in a stack is rarely what you want, and unapplied branches
	 * should not require much invalidation.
	 */
	BranchChanges = "BranchChanges",
	ForgeUser = "ForgeUser",
	GitHubUserList = "GitHubUserList",
	GitLabUserList = "GitLabUserList",
	PullRequests = "PullRequests",
	GitlabMRs = "GitlabMRs",
	Checks = "Checks",
	RepoInfo = "RepoInfo",
	BaseBranchData = "BaseBranchData",
	ForgeProvider = "ForgeProvider",
	UpstreamIntegrationStatus = "UpstreamIntegrationStatus",
	BranchListing = "BranchListing",
	BranchDetails = "BranchDetails",
	SnapshotDiff = "SnapshotDiff",
	WorkspaceRules = "WorkspaceRules",
	Project = "Project",
	ProjectGerrit = "ProjectGerrit",
	InitalEditListing = "InitialEditListing",
	EditChangesSinceInitial = "EditChangesSinceInitial",
	AuthorInfo = "AuthorInfo",
	IntegrationSteps = "IntegrationSteps",
	GitConfigProperty = "GitConfigProperty",
	GitButlerConfig = "GitButlerConfig",
	IrcConnectionState = "IrcConnectionState",
	IrcChannels = "IrcChannels",
	IrcMessages = "IrcMessages",
	IrcUsers = "IrcUsers",
	User = "User",
	UserProfile = "UserProfile",
}

type Tag<T extends string | number> = {
	type: ReduxTag;
	id?: T;
};

const LIST = "LIST";

function scopedListId(scope: string | undefined): string {
	return scope ? `${scope}:${LIST}` : LIST;
}

// We always want to provide either, just the list or the list and the item.
// This means that we can either invalidate all of them, or an individual item.

export function providesList(tag: ReduxTag, scope?: string): Tag<string> {
	return { type: tag, id: scopedListId(scope) };
}

export function providesItem<T extends string | number>(
	tag: ReduxTag,
	id: T,
	scope?: string,
): [Tag<T | string>, Tag<string>] {
	return [
		{ type: tag, id },
		{ type: tag, id: scopedListId(scope) },
	];
}

export function providesType(tag: ReduxTag): Tag<ReduxTag> {
	return { type: tag };
}

export function providesItems<T extends string | number>(
	tag: ReduxTag,
	ids: T[],
	scope?: string,
): Tag<T | string>[] {
	const itemTags = ids.map((id) => ({ type: tag, id }));
	return [...itemTags, { type: tag, id: scopedListId(scope) }];
}

export function invalidatesList(tag: ReduxTag, scope?: string): Tag<string> {
	return { type: tag, id: scopedListId(scope) };
}

export function invalidatesItem<
	T extends string | number | undefined,
	OutTag = Tag<T extends undefined ? string : T>,
>(tag: ReduxTag, id: T, scope?: string): OutTag {
	if (id === undefined) {
		return { type: tag, id: scopedListId(scope) } as OutTag;
	}
	return { type: tag, id } as OutTag;
}

export function invalidatesType(tag: ReduxTag): Tag<ReduxTag> {
	return { type: tag };
}

export function forgeScopeTag(
	provider: string,
	owner: string,
	repo: string,
	tokenId: string,
): string {
	return `${provider}:${owner}:${repo}:${tokenId}`;
}
