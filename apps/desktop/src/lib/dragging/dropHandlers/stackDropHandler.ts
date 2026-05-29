import { changesToDiffSpec } from "$lib/commits/utils";
import {
	FileChangeDropData,
	FolderChangeDropData,
	HunkDropDataV3,
	type ChangeDropData,
} from "$lib/dragging/draggables";
import { BranchDropData } from "$lib/dragging/dropHandlers/branchDropHandler";
import { CommitDropData } from "$lib/dragging/dropHandlers/commitDropHandler";
import { parseError } from "$lib/error/parser";
import { toCommitMovePlacement } from "$lib/stacks/commitMovePlacement";
import { toMoveBranchWarning } from "$lib/stacks/stack";
import { STACK_COMMAND_EXECUTOR } from "$lib/stacks/commandExecutorFactory";
import { STACK_COMMANDS } from "$lib/stacks/stackCommands";
import type {
	CreateStackCommand,
	CreateCommitCommand,
	MoveChangesBetweenCommitsCommand,
	MoveCommitsCommand,
	TearOffBranchCommand,
} from "$lib/stacks/stackCommands";
import { ensureValue } from "$lib/utils/validation";
import { inject } from "@gitbutler/core/context";
import { untrack } from "svelte";
import type { DropResult } from "$lib/dragging/dropResult";
import type { DropzoneHandler } from "$lib/dragging/handler";
import type { ForgePrService } from "$lib/forge/interface/forgePrService";
import type { DiffService } from "$lib/hunks/diffService.svelte";
import type { UncommittedService } from "$lib/selection/uncommittedService.svelte";
import type { StackService } from "$lib/stacks/stackService.svelte";
import type { UiState } from "$lib/state/uiState.svelte";
import type { HunkAssignmentTarget } from "@gitbutler/but-sdk";

/** Handler when drop changes on a special outside lanes dropzone. */
export class OutsideLaneDzHandler implements DropzoneHandler {
	private readonly commandExecutor = inject(STACK_COMMAND_EXECUTOR);

	constructor(
		private stackService: StackService,
		private prService: ForgePrService | undefined,
		private projectId: string,
		private readonly uiState: UiState,
		private readonly uncommittedService: UncommittedService,
		private readonly diffService: DiffService,
		private readonly baseBranchName: string | undefined,
	) {}

	private stackTarget(stackId: string): HunkAssignmentTarget {
		return { type: "stack", subject: { stackId } };
	}

	private acceptsChangeDropData(data: unknown): data is ChangeDropData {
		if (!(data instanceof FileChangeDropData || data instanceof FolderChangeDropData)) return false;
		if (data.selectionId.type === "commit" && data.stackId === undefined) return false;
		if (data.selectionId.type === "branch") return false;
		return true;
	}

	private acceptsHunkDropData(data: unknown): data is HunkDropDataV3 {
		if (!(data instanceof HunkDropDataV3)) return false;
		if (data.selectionId.type === "commit" && data.stackId === undefined) return false;
		if (data.selectionId.type === "branch") return false;
		return true;
	}

	private acceptsBranchDropData(data: unknown): data is BranchDropData {
		if (!(data instanceof BranchDropData)) return false;
		if (data.hasConflicts) return false;
		if (data.numberOfBranchesInStack <= 1) return false; // Can't tear off the last branch of a stack
		if (data.numberOfCommits === 0) return false; // TODO: Allow to rip empty branches
		return true;
	}

	private acceptsCommitDropData(data: unknown): data is CommitDropData {
		if (!(data instanceof CommitDropData)) return false;
		if (data.allCommits.some((c) => c.hasConflicts)) return false;
		return true;
	}

	accepts(data: unknown) {
		return (
			this.acceptsChangeDropData(data) ||
			this.acceptsBranchDropData(data) ||
			this.acceptsHunkDropData(data) ||
			this.acceptsCommitDropData(data)
		);
	}

	async ondropChangeData(data: ChangeDropData) {
		switch (data.selectionId.type) {
			case "commit": {
				const sourceStackId = data.stackId;
				const sourceCommitId = data.selectionId.commitId;
				if (!sourceStackId) {
					throw new Error("Change drop data must specify the source stackId");
				}

				// Step 1: Create new stack
				const createStackCmd: CreateStackCommand = {
					type: STACK_COMMANDS.CREATE_STACK,
					projectId: this.projectId,
					branch: { name: undefined },
				};
				const stackResult = await this.commandExecutor.execute<{
					id: string;
					heads: { name: string }[];
				}>(createStackCmd);
				if (!stackResult.success || !stackResult.data) {
					throw stackResult.error ?? new Error("Failed to create new stack");
				}
				const stack = stackResult.data;
				const newStackId = ensureValue(stack.id);
				const branchName = ensureValue(stack.heads.at(0)?.name);

				// Step 2: Create stub commit in new stack
				const createCommitCmd: CreateCommitCommand = {
					type: STACK_COMMANDS.CREATE_COMMIT,
					projectId: this.projectId,
					stackId: newStackId,
					stackBranchName: branchName,
					message: "New commit",
					dryRun: false,
				};
				const commitResult = await this.commandExecutor.execute<{ newCommit: string }>(
					createCommitCmd,
				);
				if (!commitResult.success || !commitResult.data?.newCommit) {
					throw commitResult.error ?? new Error("Failed to create new commit");
				}
				const newCommitId = commitResult.data.newCommit;

				// Step 3: Move changes from source commit to new commit
				const diffSpec = changesToDiffSpec(await data.treeChanges());
				const moveChangesCmd: MoveChangesBetweenCommitsCommand = {
					type: STACK_COMMANDS.MOVE_CHANGES_BETWEEN_COMMITS,
					projectId: this.projectId,
					changes: diffSpec,
					sourceStackId,
					sourceCommitId,
					destinationStackId: newStackId,
					destinationCommitId: newCommitId,
					dryRun: false,
				};
				await this.commandExecutor.execute(moveChangesCmd);
				break;
			}
			case "worktree": {
				const createStackCmd: CreateStackCommand = {
					type: STACK_COMMANDS.CREATE_STACK,
					projectId: this.projectId,
					branch: { name: undefined },
				};
				const result = await this.commandExecutor.execute<{
					id: string;
					heads: { name: string }[];
				}>(createStackCmd);
				if (!result.success || !result.data) {
					throw result.error ?? new Error("Failed to create new stack");
				}
				const stack = result.data;
				const newStackId = ensureValue(stack.id);

				const changes = await data.treeChanges();
				const assignments = changes
					.flatMap((c) =>
						this.uncommittedService.getAssignmentsByPath(data.stackId ?? null, c.path),
					)
					.map((h) => ({
						hunkHeader: h.hunkHeader,
						pathBytes: h.pathBytes,
						target: this.stackTarget(newStackId),
					}));
				await this.diffService.assignHunk({
					projectId: this.projectId,
					assignments,
				});
			}
		}
	}

	async ondropHunkData(data: HunkDropDataV3) {
		switch (data.selectionId.type) {
			case "commit": {
				if (!data.stackId || !data.commitId) {
					throw new Error("Hunk drop data must specify the source stackId and commitId");
				}

				// Step 1: Create new stack
				const createStackCmd: CreateStackCommand = {
					type: STACK_COMMANDS.CREATE_STACK,
					projectId: this.projectId,
					branch: { name: undefined },
				};
				const stackResult = await this.commandExecutor.execute<{
					id: string;
					heads: { name: string }[];
				}>(createStackCmd);
				if (!stackResult.success || !stackResult.data) {
					throw stackResult.error ?? new Error("Failed to create new stack");
				}
				const stack = stackResult.data;
				const newStackId = ensureValue(stack.id);
				const branchName = ensureValue(stack.heads.at(0)?.name);

				// Step 2: Create stub commit in new stack
				const createCommitCmd: CreateCommitCommand = {
					type: STACK_COMMANDS.CREATE_COMMIT,
					projectId: this.projectId,
					stackId: newStackId,
					stackBranchName: branchName,
					message: "New commit",
					dryRun: false,
				};
				const commitResult = await this.commandExecutor.execute<{ newCommit: string }>(
					createCommitCmd,
				);
				if (!commitResult.success || !commitResult.data?.newCommit) {
					throw commitResult.error ?? new Error("Failed to create new commit");
				}
				const newCommitId = commitResult.data.newCommit;

				// Step 3: Move changes from source commit to new commit
				const previousPathBytes =
					data.change.status.type === "Rename"
						? data.change.status.subject.previousPathBytes
						: null;

				const moveChangesCmd: MoveChangesBetweenCommitsCommand = {
					type: STACK_COMMANDS.MOVE_CHANGES_BETWEEN_COMMITS,
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
					sourceStackId: data.stackId,
					sourceCommitId: data.commitId,
					destinationStackId: newStackId,
					destinationCommitId: newCommitId,
					dryRun: false,
				};
				await this.commandExecutor.execute(moveChangesCmd);
				break;
			}
			case "worktree": {
				const createStackCmd: CreateStackCommand = {
					type: STACK_COMMANDS.CREATE_STACK,
					projectId: this.projectId,
					branch: { name: undefined },
				};
				const result = await this.commandExecutor.execute<{
					id: string;
					heads: { name: string }[];
				}>(createStackCmd);
				if (!result.success || !result.data) {
					throw result.error ?? new Error("Failed to create new stack");
				}
				const stack = result.data;
				const newStackId = ensureValue(stack.id);

				const assignmentReactive = this.uncommittedService.getAssignmentByHeader(
					data.stackId,
					data.change.path,
					data.hunk,
				);
				const assignment = assignmentReactive.current;
				if (!assignment) {
					throw new Error("No hunk assignment found for the dropped worktree hunk");
				}

				await this.diffService.assignHunk({
					projectId: this.projectId,
					assignments: [
						{
							hunkHeader: assignment.hunkHeader,
							pathBytes: assignment.pathBytes,
							target: this.stackTarget(newStackId),
						},
					],
				});
				break;
			}
		}
	}

	async ondropCommitData(data: CommitDropData): Promise<DropResult | void> {
		// Clear the selection from the source lane if any dragged commit was selected.
		const sourceSelection = untrack(() => this.uiState.lane(data.stackId).selection.current);
		if (
			sourceSelection?.commitId &&
			data.allCommits.some((c) => c.id === sourceSelection.commitId)
		) {
			this.uiState.lane(data.stackId).selection.set(undefined);
		}

		// Step 1: Create new stack
		const createStackCmd: CreateStackCommand = {
			type: STACK_COMMANDS.CREATE_STACK,
			projectId: this.projectId,
			branch: { name: undefined },
		};
		const stackResult = await this.commandExecutor.execute<{
			id: string;
			heads: { name: string }[];
		}>(createStackCmd);
		if (!stackResult.success || !stackResult.data) {
			throw stackResult.error ?? new Error("Failed to create new stack");
		}
		const stack = stackResult.data;
		const newStackId = ensureValue(stack.id);
		const branchName = ensureValue(stack.heads.at(0)?.name);

		// Step 2: Move commits to new stack
		const { relativeTo, side } = toCommitMovePlacement({
			targetBranchName: branchName,
			targetCommitId: "top",
		});

		const commitIds = data.allCommits.map((c) => c.id);
		const moveCommitsCmd: MoveCommitsCommand = {
			type: STACK_COMMANDS.MOVE_COMMITS,
			projectId: this.projectId,
			subjectCommitIds: commitIds,
			relativeTo,
			side,
			sourceStackId: data.stackId,
			targetStackId: newStackId,
		};

		const result = await this.commandExecutor.execute(moveCommitsCmd);
		if (!result.success && result.error) {
			const { description, message } = parseError(result.error);
			return {
				type: "warning",
				title: "Cannot move commits",
				message: description ?? message,
			};
		}
	}

	async ondropBranchData(data: BranchDropData): Promise<DropResult | void> {
		const tearOffCmd: TearOffBranchCommand = {
			type: STACK_COMMANDS.TEAR_OFF_BRANCH,
			projectId: this.projectId,
			sourceStackId: data.stackId,
			subjectBranchName: data.branchName,
		};

		const result = await this.commandExecutor.execute<{ unappliedStackCount: number }>(tearOffCmd);
		if (!result.success || !result.data) {
			throw result.error ?? new Error("Failed to tear off branch");
		}

		const unappliedStackCount = result.data.unappliedStackCount ?? 0;
		return toMoveBranchWarning(unappliedStackCount);
	}

	async ondrop(data: unknown): Promise<DropResult | void> {
		if (this.acceptsChangeDropData(data)) {
			await this.ondropChangeData(data);
			return;
		}

		if (this.acceptsHunkDropData(data)) {
			await this.ondropHunkData(data);
			return;
		}

		if (this.acceptsCommitDropData(data)) {
			return await this.ondropCommitData(data);
		}

		if (this.acceptsBranchDropData(data)) {
			return await this.ondropBranchData(data);
		}
	}
}
