import type { DiffSpec, InsertSide, RelativeTo } from "@gitbutler/but-sdk";

export const STACK_COMMANDS = {
	MOVE_COMMITS: "stack:moveCommits",
	MOVE_BRANCH: "stack:moveBranch",
	TEAR_OFF_BRANCH: "stack:tearOffBranch",
	UPDATE_STACK_ORDER: "stack:updateStackOrder",
	MOVE_CHANGES_BETWEEN_COMMITS: "stack:moveChangesBetweenCommits",
	UNCOMMIT_CHANGES: "stack:uncommitChanges",
	UNCOMMIT: "stack:uncommit",
	DISCARD_CHANGES: "stack:discardChanges",
	AMEND_COMMIT: "stack:amendCommit",
	CREATE_COMMIT: "stack:createCommit",
	CREATE_STACK: "stack:createStack",
	SQUASH_COMMITS: "stack:squashCommits",
	UNAPPLY_STACK: "stack:unapplyStack",
	CREATE_BRANCH: "stack:createBranch",
	UPDATE_BRANCH_NAME: "stack:updateBranchName",
	REMOVE_BRANCH: "stack:removeBranch",
	INTEGRATE_UPSTREAM_COMMITS: "stack:integrateUpstreamCommits",
	INTEGRATE_BRANCH_WITH_STEPS: "stack:integrateBranchWithSteps",
	CREATE_VIRTUAL_BRANCH_FROM_BRANCH: "stack:createVirtualBranchFromBranch",
	DELETE_LOCAL_BRANCH: "stack:deleteLocalBranch",
	PUSH_STACK: "stack:pushStack",
	UPDATE_COMMIT_MESSAGE: "stack:updateCommitMessage",
	STASH_INTO_BRANCH: "stack:stashIntoBranch",
	UPDATE_BRANCH_PR_NUMBER: "stack:updateBranchPrNumber",
	ABSORB: "stack:absorb",
	INSERT_BLANK_COMMIT: "stack:insertBlankCommit",
} as const;

export type StackCommandType = (typeof STACK_COMMANDS)[keyof typeof STACK_COMMANDS];

export interface BaseStackCommand {
	type: StackCommandType;
	projectId: string;
	meta?: {
		description?: string;
		skipNotification?: boolean;
		skipTimeline?: boolean;
		optimisticUpdate?: boolean;
	};
}

export interface MoveCommitsCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.MOVE_COMMITS;
	subjectCommitIds: string[];
	relativeTo: RelativeTo;
	side: InsertSide;
	sourceStackId: string;
	targetStackId?: string;
}

export interface MoveBranchCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.MOVE_BRANCH;
	subjectBranch: string;
	targetBranch: string;
	sourceStackId: string;
	targetStackId: string;
}

export interface TearOffBranchCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.TEAR_OFF_BRANCH;
	sourceStackId: string;
	subjectBranchName: string;
}

export interface UpdateStackOrderCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.UPDATE_STACK_ORDER;
	stacks: Array<{ id: string; order: number }>;
}

export interface MoveChangesBetweenCommitsCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.MOVE_CHANGES_BETWEEN_COMMITS;
	changes: DiffSpec[];
	sourceCommitId: string;
	sourceStackId: string;
	destinationCommitId: string;
	destinationStackId: string;
	dryRun?: boolean;
}

export interface UncommitChangesCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.UNCOMMIT_CHANGES;
	changes: DiffSpec[];
	commitId: string;
	stackId: string;
	assignTo?: string;
	dryRun?: boolean;
}

export interface UncommitCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.UNCOMMIT;
	stackId: string;
	commitIds: string[];
}

export interface DiscardChangesCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.DISCARD_CHANGES;
	worktreeChanges: DiffSpec[];
}

export interface AmendCommitCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.AMEND_COMMIT;
	stackId: string;
	commitId: string;
	worktreeChanges: DiffSpec[];
	dryRun?: boolean;
}

export interface CreateCommitCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.CREATE_COMMIT;
	stackId: string;
	stackBranchName: string;
	parentId?: string;
	message: string;
	worktreeChanges?: Array<{ path: string; hunks?: Array<{ oldStart: number; oldLines: number; newStart: number; newLines: number }> }>;
	dryRun?: boolean;
}

export interface CreateStackCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.CREATE_STACK;
	branch?: { name?: string };
}

export interface SquashCommitsCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.SQUASH_COMMITS;
	stackId: string;
	sourceCommitIds: string[];
	targetCommitId: string;
}

export interface UnapplyStackCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.UNAPPLY_STACK;
	stackId: string;
}

export interface CreateBranchCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.CREATE_BRANCH;
	stackId: string;
	name?: string;
	parentCommitId?: string;
}

export interface UpdateBranchNameCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.UPDATE_BRANCH_NAME;
	projectId: string;
	laneId: string;
	branchName: string;
	newName: string;
}

export interface RemoveBranchCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.REMOVE_BRANCH;
	stackId: string;
	branchName: string;
}

export interface IntegrateUpstreamCommitsCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.INTEGRATE_UPSTREAM_COMMITS;
	stackId: string;
	seriesName: string;
	integrationStrategy?: import("$lib/stacks/stackEndpoints").SeriesIntegrationStrategy;
}

export interface IntegrateBranchWithStepsCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.INTEGRATE_BRANCH_WITH_STEPS;
	stackId: string;
	branchName: string;
	steps: unknown[];
}

export interface CreateVirtualBranchFromBranchCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.CREATE_VIRTUAL_BRANCH_FROM_BRANCH;
	stackId: string;
	sourceBranchName: string;
}

export interface DeleteLocalBranchCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.DELETE_LOCAL_BRANCH;
	branchName: string;
	remote?: string;
}

export interface PushStackCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.PUSH_STACK;
	stackId: string;
	withForce: boolean;
	skipForcePushProtection?: boolean;
	branch?: string;
	runHooks?: boolean;
	pushOpts?: Array<string>;
}

export interface UpdateCommitMessageCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.UPDATE_COMMIT_MESSAGE;
	commitId: string;
	message: string;
}

export interface StashIntoBranchCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.STASH_INTO_BRANCH;
	stackId: string;
	branchName: string;
	message?: string;
}

export interface UpdateBranchPrNumberCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.UPDATE_BRANCH_PR_NUMBER;
	stackId: string;
	branchName: string;
	prNumber: number | null;
}

export interface AbsorbCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.ABSORB;
	stackId: string;
	message?: string;
	target?: { type: "commit"; commitId: string } | { type: "newest" };
}

export interface InsertBlankCommitCommand extends BaseStackCommand {
	type: typeof STACK_COMMANDS.INSERT_BLANK_COMMIT;
	stackId: string;
	branchName: string;
	targetCommitId: string;
	insertAfter?: boolean;
}

export type StackCommand =
	| MoveCommitsCommand
	| MoveBranchCommand
	| TearOffBranchCommand
	| UpdateStackOrderCommand
	| MoveChangesBetweenCommitsCommand
	| UncommitChangesCommand
	| UncommitCommand
	| DiscardChangesCommand
	| AmendCommitCommand
	| CreateCommitCommand
	| CreateStackCommand
	| SquashCommitsCommand
	| UnapplyStackCommand
	| CreateBranchCommand
	| UpdateBranchNameCommand
	| RemoveBranchCommand
	| IntegrateUpstreamCommitsCommand
	| IntegrateBranchWithStepsCommand
	| CreateVirtualBranchFromBranchCommand
	| DeleteLocalBranchCommand
	| PushStackCommand
	| UpdateCommitMessageCommand
	| StashIntoBranchCommand
	| UpdateBranchPrNumberCommand
	| AbsorbCommand
	| InsertBlankCommitCommand;

export interface CommandNotification {
	success?: {
		title?: string;
		message?: string;
	};
	error?: {
		title: string;
		message?: string;
	};
	warning?: {
		title: string;
		message: string;
	};
}

export interface CommandTimelineEntry {
	id: string;
	command: StackCommand;
	status: "pending" | "executing" | "success" | "error" | "rolled_back";
	timestamp: number;
	duration?: number;
	result?: unknown;
	error?: unknown;
	rollbackResult?: unknown;
}

export interface CommandResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: unknown;
	notification?: CommandNotification;
	rolledBack?: boolean;
}
