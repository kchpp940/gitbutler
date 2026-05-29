import { changesToDiffSpec } from "$lib/commits/utils";
import {
	FileChangeDropData,
	FolderChangeDropData,
	HunkDropDataV3,
	type ChangeDropData,
} from "$lib/dragging/draggables";
import { HookFailedError, HOOKS_SERVICE } from "$lib/git/hooksService";
import { toCommitMovePlacement } from "$lib/stacks/commitMovePlacement";
import { STACK_COMMAND_EXECUTOR } from "$lib/stacks/commandExecutorFactory";
import { STACK_COMMANDS } from "$lib/stacks/stackCommands";
import type {
	MoveChangesBetweenCommitsCommand,
	AmendCommitCommand,
	UncommitChangesCommand,
	SquashCommitsCommand,
	MoveCommitsCommand,
} from "$lib/stacks/stackCommands";
import { UI_STATE } from "$lib/state/uiState.svelte";
import { inject } from "@gitbutler/core/context";
import { untrack } from "svelte";
import type { DropResult } from "$lib/dragging/dropResult";
import type { DropzoneHandler } from "$lib/dragging/handler";
import type { CreateCommitOutcome } from "$lib/stacks/stackEndpoints";
import type { RejectionReason } from "@gitbutler/but-sdk";

/** Details about a commit belonging to a drop zone. */
export type DzCommitData = {
	id: string;
	isRemote: boolean;
	isIntegrated: boolean;
	hasConflicts: boolean;
};

/** Details about a commit that can be dropped into a drop zone. */
export class CommitDropData {
	/** All commits being dragged (for multi-select). Defaults to just `[commit]`. */
	readonly allCommits: DzCommitData[];

	constructor(
		readonly stackId: string,
		readonly commit: DzCommitData,
		readonly isHeadCommit: boolean,
		readonly branchName?: string,
		allCommits?: DzCommitData[],
	) {
		this.allCommits = allCommits && allCommits.length > 0 ? allCommits : [commit];
	}

	get isMultiCommit(): boolean {
		return this.allCommits.length > 1;
	}
}

/** Handler that can move commits between stacks. */
export class MoveCommitDzHandler implements DropzoneHandler {
	private readonly uiState = inject(UI_STATE);
	private readonly commandExecutor = inject(STACK_COMMAND_EXECUTOR);

	constructor(
		private stackId: string,
		private projectId: string,
		private targetBranchName: string,
	) {}

	accepts(data: unknown): boolean {
		return (
			data instanceof CommitDropData &&
			data.stackId !== this.stackId &&
			!data.allCommits.some((c) => c.hasConflicts)
		);
	}

	async ondrop(data: CommitDropData): Promise<DropResult | void> {
		const { relativeTo, side } = toCommitMovePlacement({
			targetBranchName: this.targetBranchName,
			targetCommitId: "top",
		});

		const sourceSelection = untrack(() => this.uiState.lane(data.stackId).selection.current);
		if (
			sourceSelection?.commitId &&
			data.allCommits.some((c) => c.id === sourceSelection.commitId)
		) {
			this.uiState.lane(data.stackId).selection.set(undefined);
		}

		const command: MoveCommitsCommand = {
			type: STACK_COMMANDS.MOVE_COMMITS,
			projectId: this.projectId,
			subjectCommitIds: data.allCommits.map((c) => c.id),
			relativeTo,
			side,
			sourceStackId: data.stackId,
			targetStackId: this.stackId,
		};

		const result = await this.commandExecutor.execute(command);

		if (!result.success && result.notification?.warning) {
			return {
				type: "warning",
				title: result.notification.warning.title,
				message: result.notification.warning.message,
			};
		}
	}
}

/**
 * Handler that will be able to amend a commit using `TreeChange`.
 */
export class AmendCommitWithChangeDzHandler implements DropzoneHandler {
	private readonly uiState = inject(UI_STATE);
	private readonly commandExecutor = inject(STACK_COMMAND_EXECUTOR);
	private readonly hooksService = inject(HOOKS_SERVICE);

	constructor(
		private projectId: string,
		private stackId: string,
		private runHooks: boolean,
		private commit: DzCommitData,
		private onresult: (result: string) => void,
	) {}
	accepts(data: unknown): boolean {
		if (!(data instanceof FileChangeDropData || data instanceof FolderChangeDropData)) return false;
		if (this.commit.hasConflicts) return false;
		if (data.selectionId.type === "branch") return false;
		if (data.selectionId.type === "commit" && data.selectionId.commitId === this.commit.id)
			return false;
		return true;
	}

	async ondrop(data: ChangeDropData): Promise<DropResult | void> {
		switch (data.selectionId.type) {
			case "commit": {
				const sourceStackId = data.stackId;
				const sourceCommitId = data.selectionId.commitId;
				const changes = changesToDiffSpec(await data.treeChanges());
				if (sourceStackId && sourceCommitId) {
					const command: MoveChangesBetweenCommitsCommand = {
						type: STACK_COMMANDS.MOVE_CHANGES_BETWEEN_COMMITS,
						projectId: this.projectId,
						changes,
						sourceCommitId,
						sourceStackId,
						destinationCommitId: this.commit.id,
						destinationStackId: this.stackId,
						dryRun: false,
					};
					await this.commandExecutor.execute(command);
				} else {
					throw new Error("Change drop data must specify the source stackId");
				}
				break;
			}
			case "branch":
				console.warn("Moving a branch into a commit is an invalid operation");
				break;
			case "worktree": {
				const assignments = data.assignments();
				const worktreeChanges = changesToDiffSpec(await data.treeChanges(), assignments);

				if (this.runHooks) {
					try {
						await this.hooksService.runPreCommitHooks(this.projectId, worktreeChanges);
					} catch (err) {
						if (err instanceof HookFailedError) return { type: "ok" };
						return { type: "error", title: "Git hook failed", error: err };
					}
				}

				const command: AmendCommitCommand = {
					type: STACK_COMMANDS.AMEND_COMMIT,
					projectId: this.projectId,
					stackId: this.stackId,
					commitId: this.commit.id,
					worktreeChanges,
					dryRun: false,
				};

				const result = await this.commandExecutor.execute(command);

				if (result.success && result.data) {
					const outcome = result.data as CreateCommitOutcome;
					if (outcome.newCommit) {
						this.onresult(outcome.newCommit);
					}

					if (outcome.rejectedChanges.length > 0) {
						return toRejectedChangesResult(this.projectId, outcome);
					}
				}

				if (this.runHooks) {
					await this.hooksService.runPostCommitHooks(this.projectId);
				}

				break;
			}
		}
	}
}

export class UncommitDzHandler implements DropzoneHandler {
	private readonly commandExecutor = inject(STACK_COMMAND_EXECUTOR);

	constructor(
		private projectId: string,
		private readonly assignTo?: string,
	) {}

	accepts(data: unknown): boolean {
		if (data instanceof FileChangeDropData || data instanceof FolderChangeDropData) {
			if (data.selectionId.type !== "commit") return false;
			if (!data.selectionId.commitId) return false;
			if (!data.stackId) return false;
			return true;
		}
		if (data instanceof HunkDropDataV3) {
			if (data.uncommitted) return false;
			if (!data.commitId) return false;
			if (!data.stackId) return false;
			return true;
		}
		return false;
	}

	async ondrop(data: ChangeDropData | HunkDropDataV3) {
		if (data instanceof FileChangeDropData || data instanceof FolderChangeDropData) {
			switch (data.selectionId.type) {
				case "commit": {
					const stackId = data.stackId;
					const commitId = data.selectionId.commitId;
					if (stackId && commitId) {
						const changes = changesToDiffSpec(await data.treeChanges());
						const command: UncommitChangesCommand = {
							type: STACK_COMMANDS.UNCOMMIT_CHANGES,
							projectId: this.projectId,
							changes,
							commitId,
							stackId,
							assignTo: this.assignTo,
							dryRun: false,
						};
						await this.commandExecutor.execute(command);
					} else {
						throw new Error("Change drop data must specify the source stackId");
					}
					break;
				}
				case "branch":
					console.warn("Moving a branch into a commit is an invalid operation");
					break;
				case "worktree":
					console.warn("Moving a branch into a commit is an invalid operation");
					break;
			}
		} else {
			if (!(data.stackId && data.commitId)) {
				throw new Error("Can't receive a change without it's source or commit");
			}
			const previousPathBytes =
				data.change.status.type === "Rename" ? data.change.status.subject.previousPathBytes : null;

			const sourceStackId = data.stackId;
			const sourceCommitId = data.commitId;

			const command: UncommitChangesCommand = {
				type: STACK_COMMANDS.UNCOMMIT_CHANGES,
				projectId: this.projectId,
				changes: [
					{
						previousPathBytes,
						pathBytes: data.change.pathBytes,
						hunkHeaders: [
							{
								oldStart: data.hunk.oldStart,
								oldLines: data.hunk.oldLines,
								newStart: data.hunk.newStart,
								newLines: data.hunk.newLines,
							},
						],
					},
				],
				commitId: sourceCommitId,
				stackId: sourceStackId,
				assignTo: this.assignTo,
				dryRun: false,
			};
			await this.commandExecutor.execute(command);

			return;
		}
	}
}

/**
 * Handler that is able to amend a commit using `Hunk`.
 */
export class AmendCommitWithHunkDzHandler implements DropzoneHandler {
	private readonly commandExecutor = inject(STACK_COMMAND_EXECUTOR);
	private readonly hooksService = inject(HOOKS_SERVICE);

	constructor(
		private args: {
			okWithForce: boolean;
			projectId: string;
			stackId: string;
			commit: DzCommitData;
			runHooks: boolean;
		},
	) {}

	private acceptsHunkV3(data: unknown): boolean {
		const { commit, okWithForce } = this.args;
		if (!okWithForce && commit.isRemote) return false;
		if (commit.isIntegrated) return false;
		if (data instanceof HunkDropDataV3 && data.commitId === commit.id) return false;
		return data instanceof HunkDropDataV3 && !commit.hasConflicts;
	}

	accepts(data: unknown): boolean {
		return this.acceptsHunkV3(data);
	}

	async ondrop(data: HunkDropDataV3): Promise<DropResult | void> {
		const { projectId, stackId, commit, okWithForce, runHooks } = this.args;
		if (!okWithForce && commit.isRemote) return;

		if (data instanceof HunkDropDataV3) {
			const previousPathBytes =
				data.change.status.type === "Rename" ? data.change.status.subject.previousPathBytes : null;

			if (!data.uncommitted) {
				if (!(data.stackId && data.commitId)) {
					throw new Error("Can't receive a change without it's source or commit");
				}

				const sourceStackId = data.stackId;
				const sourceCommitId = data.commitId;

				const command: MoveChangesBetweenCommitsCommand = {
					type: STACK_COMMANDS.MOVE_CHANGES_BETWEEN_COMMITS,
					projectId,
					changes: [
						{
							previousPathBytes,
							pathBytes: data.change.pathBytes,
							hunkHeaders: [
								{
									oldStart: data.hunk.oldStart,
									oldLines: data.hunk.oldLines,
									newStart: data.hunk.newStart,
									newLines: data.hunk.newLines,
								},
							],
						},
					],
					sourceStackId,
					sourceCommitId,
					destinationStackId: stackId,
					destinationCommitId: commit.id,
					dryRun: false,
				};
				await this.commandExecutor.execute(command);

				return;
			}

			const worktreeChanges = [
				{
					previousPathBytes,
					pathBytes: data.change.pathBytes,
					hunkHeaders: [
						{
							oldStart: data.hunk.oldStart,
							oldLines: data.hunk.oldLines,
							newStart: data.hunk.newStart,
							newLines: data.hunk.newLines,
						},
					],
				},
			];

			if (runHooks) {
				try {
					await this.hooksService.runPreCommitHooks(projectId, worktreeChanges);
				} catch (err) {
					if (err instanceof HookFailedError) return { type: "ok" };
					return { type: "error", title: "Git hook failed", error: err };
				}
			}

			const command: AmendCommitCommand = {
				type: STACK_COMMANDS.AMEND_COMMIT,
				projectId,
				stackId,
				commitId: commit.id,
				worktreeChanges,
				dryRun: false,
			};

			const result = await this.commandExecutor.execute(command);

			if (result.success && result.data) {
				const outcome = result.data as CreateCommitOutcome;
				const rejectionResult = toRejectedChangesResult(projectId, outcome);

				if (runHooks) {
					await this.hooksService.runPostCommitHooks(projectId);
				}

				return rejectionResult;
			}

			if (runHooks) {
				await this.hooksService.runPostCommitHooks(projectId);
			}

			break;
		}
	}
}

/**
 * Handler that is able to squash two commits using `DzCommitData`.
 */
export class SquashCommitDzHandler implements DropzoneHandler {
	private readonly commandExecutor = inject(STACK_COMMAND_EXECUTOR);

	constructor(
		private args: {
			projectId: string;
			stackId: string;
			commit: DzCommitData;
		},
	) {}

	accepts(data: unknown): boolean {
		const { stackId, commit } = this.args;
		if (!(data instanceof CommitDropData)) return false;
		if (data.stackId !== stackId) return false;

		if (commit.hasConflicts) return false;
		if (data.allCommits.some((c) => c.hasConflicts)) return false;

		// Don't show dropzone on any of the commits being dragged
		if (data.allCommits.some((c) => c.id === commit.id)) return false;

		return true;
	}

	async ondrop(data: unknown) {
		const { projectId, stackId, commit } = this.args;
		if (data instanceof CommitDropData) {
			const sourceCommitIds = data.allCommits.map((c) => c.id).filter((id) => id !== commit.id);
			if (sourceCommitIds.length === 0) return;

			const command: SquashCommitsCommand = {
				type: STACK_COMMANDS.SQUASH_COMMITS,
				projectId,
				stackId,
				sourceCommitIds,
				targetCommitId: commit.id,
			};
			await this.commandExecutor.execute(command);
		}
	}
}

function toRejectedChangesResult(
	projectId: string,
	outcome: CreateCommitOutcome,
): DropResult | undefined {
	if (outcome.rejectedChanges.length === 0) return undefined;

	const pathsToRejectedChanges = outcome.rejectedChanges.reduce(
		(acc: Record<string, RejectionReason>, { reason, path }) => {
			acc[path] = reason;
			return acc;
		},
		{},
	);

	return {
		type: "rejectedChanges",
		projectId,
		newCommitId: outcome.newCommit ?? undefined,
		commitTitle: undefined,
		targetBranchName: "",
		pathsToRejectedChanges,
	};
}

/**
 * Creates drop handlers for amending and squashing commits.
 * Returns undefined if stackId is not provided (read-only mode).
 */
export function createCommitDropHandlers(args: {
	projectId: string;
	stackId: string | undefined;
	commit: DzCommitData;
	runHooks: boolean;
	onCommitIdChange?: (newCommitId: string) => void;
	okWithForce?: boolean;
}): {
	amendHandler: AmendCommitWithChangeDzHandler | undefined;
	squashHandler: SquashCommitDzHandler | undefined;
	hunkHandler: AmendCommitWithHunkDzHandler | undefined;
} {
	const { stackId, commit, onCommitIdChange, okWithForce = true } = args;

	if (!stackId) {
		return {
			amendHandler: undefined,
			squashHandler: undefined,
			hunkHandler: undefined,
		};
	}

	const amendHandler = new AmendCommitWithChangeDzHandler(
		args.projectId,
		stackId,
		args.runHooks,
		commit,
		(newId) => {
			onCommitIdChange?.(newId);
		},
	);

	const squashHandler = new SquashCommitDzHandler({
		projectId: args.projectId,
		stackId,
		commit,
	});

	const hunkHandler = new AmendCommitWithHunkDzHandler({
		projectId: args.projectId,
		stackId,
		commit,
		okWithForce,
		runHooks: args.runHooks,
	});

	return {
		amendHandler,
		squashHandler,
		hunkHandler,
	};
}
