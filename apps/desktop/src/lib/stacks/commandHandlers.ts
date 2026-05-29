import { parseError } from "$lib/error/parser";
import { updatePrDescriptions } from "$lib/stacks/stackDropHandlerUtils";
import { STACK_COMMANDS } from "$lib/stacks/stackCommands";
import type { CommandNotification, CommandResult, StackCommand } from "$lib/stacks/stackCommands";
import type { ForgePrService } from "$lib/forge/interface/forgePrService";
import type {
	AmendCommitCommand,
	CreateCommitCommand,
	CreateStackCommand,
	DiscardChangesCommand,
	MoveChangesBetweenCommitsCommand,
	MoveCommitsCommand,
	MoveBranchCommand,
	SquashCommitsCommand,
	TearOffBranchCommand,
	UnapplyStackCommand,
	UncommitChangesCommand,
	UncommitCommand,
	UpdateStackOrderCommand,
	UpdateBranchNameCommand,
	PushStackCommand,
	IntegrateUpstreamCommitsCommand,
	CreateVirtualBranchFromBranchCommand,
	DeleteLocalBranchCommand,
	InsertBlankCommitCommand,
	StashIntoBranchCommand,
	UpdateCommitMessageCommand,
	AbsorbCommand,
} from "$lib/stacks/stackCommands";
import type { ReduxError } from "$lib/error/reduxError";
import { getBranchNameFromRef } from "$lib/branches/branchUtils";
import { invalidatesItem, invalidatesList, ReduxTag } from "$lib/state/tags";
import type { StackService } from "$lib/stacks/stackService.svelte";
import type { CommandServices } from "$lib/stacks/commandExecutor";
import { untrack } from "svelte";
import {
	replaceBranchInExclusiveAction,
	replaceBranchInStackSelection,
} from "$lib/stacks/staleStateUpdaters";

interface HandlerContext {
	prService?: ForgePrService;
	baseBranchName?: string;
}

function getAffectedStackIds(command: StackCommand): string[] {
	switch (command.type) {
		case STACK_COMMANDS.MOVE_COMMITS:
			return [command.sourceStackId, command.targetStackId].filter(
				(id): id is string => id !== undefined,
			);
		case STACK_COMMANDS.MOVE_BRANCH:
			return [command.sourceStackId, command.targetStackId];
		case STACK_COMMANDS.TEAR_OFF_BRANCH:
			return [command.sourceStackId];
		case STACK_COMMANDS.UPDATE_STACK_ORDER:
			return command.stacks.map((s) => s.id);
		case STACK_COMMANDS.MOVE_CHANGES_BETWEEN_COMMITS:
			return [command.sourceStackId, command.destinationStackId];
		case STACK_COMMANDS.UNCOMMIT_CHANGES:
			return [command.stackId];
		case STACK_COMMANDS.UNCOMMIT:
			return [command.stackId];
		case STACK_COMMANDS.DISCARD_CHANGES:
			return [];
		case STACK_COMMANDS.AMEND_COMMIT:
			return [command.stackId];
		case STACK_COMMANDS.CREATE_COMMIT:
			return [command.stackId];
		case STACK_COMMANDS.CREATE_STACK:
			return [];
		case STACK_COMMANDS.SQUASH_COMMITS:
			return [command.stackId];
		case STACK_COMMANDS.UNAPPLY_STACK:
			return [command.stackId];
		case STACK_COMMANDS.CREATE_BRANCH:
			return [command.stackId];
		case STACK_COMMANDS.UPDATE_BRANCH_NAME:
			return [command.laneId];
		case STACK_COMMANDS.REMOVE_BRANCH:
			return [command.stackId];
		case STACK_COMMANDS.INTEGRATE_UPSTREAM_COMMITS:
			return [command.stackId];
		case STACK_COMMANDS.INTEGRATE_BRANCH_WITH_STEPS:
			return [command.stackId];
		case STACK_COMMANDS.CREATE_VIRTUAL_BRANCH_FROM_BRANCH:
			return [command.stackId];
		case STACK_COMMANDS.DELETE_LOCAL_BRANCH:
			return [];
		case STACK_COMMANDS.PUSH_STACK:
			return [command.stackId];
		case STACK_COMMANDS.UPDATE_COMMIT_MESSAGE:
			return [];
		case STACK_COMMANDS.STASH_INTO_BRANCH:
			return [command.stackId];
		case STACK_COMMANDS.UPDATE_BRANCH_PR_NUMBER:
			return [command.stackId];
		case STACK_COMMANDS.ABSORB:
			return [command.stackId];
		case STACK_COMMANDS.INSERT_BLANK_COMMIT:
			return [command.stackId];
		default:
			return [];
	}
}

function getAffectedCommitIds(command: StackCommand): string[] {
	switch (command.type) {
		case STACK_COMMANDS.MOVE_COMMITS:
			return command.subjectCommitIds;
		case STACK_COMMANDS.MOVE_CHANGES_BETWEEN_COMMITS:
			return [command.sourceCommitId, command.destinationCommitId];
		case STACK_COMMANDS.UNCOMMIT_CHANGES:
			return [command.commitId];
		case STACK_COMMANDS.UNCOMMIT:
			return command.commitIds;
		case STACK_COMMANDS.AMEND_COMMIT:
			return [command.commitId];
		case STACK_COMMANDS.CREATE_COMMIT:
			return command.parentId ? [command.parentId] : [];
		case STACK_COMMANDS.SQUASH_COMMITS:
			return [...command.sourceCommitIds, command.targetCommitId];
		case STACK_COMMANDS.UPDATE_COMMIT_MESSAGE:
			return [command.commitId];
		case STACK_COMMANDS.ABSORB:
			return command.target?.type === "commit" ? [command.target.commitId] : [];
		case STACK_COMMANDS.INSERT_BLANK_COMMIT:
			return [command.targetCommitId];
		default:
			return [];
	}
}

async function handleMoveCommits(
	command: MoveCommitsCommand,
	services: CommandServices,
	context: HandlerContext,
): Promise<CommandResult> {
	const { stackService, uiState } = services;

	const sourceSelection = untrack(() => uiState.lane(command.sourceStackId).selection.current);
	if (
		sourceSelection?.commitId &&
		command.subjectCommitIds.includes(sourceSelection.commitId)
	) {
		uiState.lane(command.sourceStackId).selection.set(undefined);
	}

	try {
		await stackService.commitMove({
			projectId: command.projectId,
			subjectCommitIds: command.subjectCommitIds,
			relativeTo: command.relativeTo,
			side: command.side,
			dryRun: false,
		});

		return { success: true };
	} catch (error) {
		const { description, message } = parseError(error);
		return {
			success: false,
			error,
			notification: {
				warning: {
					title: "Cannot move commits",
					message: description ?? message,
				},
			},
		};
	}
}

async function handleMoveBranch(
	command: MoveBranchCommand,
	services: CommandServices,
	context: HandlerContext,
): Promise<CommandResult> {
	const { stackService } = services;

	try {
		await stackService.moveBranch({
			projectId: command.projectId,
			subjectBranch: command.subjectBranch,
			targetBranch: command.targetBranch,
		});

		if (context.prService && context.baseBranchName) {
			await updatePrDescriptions(
				stackService,
				context.prService,
				context.baseBranchName,
				command.projectId,
				command.sourceStackId,
				command.targetStackId,
			);
		}

		return { success: true };
	} catch (error) {
		return { success: false, error };
	}
}

async function handleTearOffBranch(
	command: TearOffBranchCommand,
	services: CommandServices,
	context: HandlerContext,
): Promise<CommandResult> {
	const { stackService } = services;

	try {
		const beforeAppliedStackCount = (await stackService.fetchStacks(command.projectId)).length;
		const result = await stackService.tearOffBranch({
			projectId: command.projectId,
			sourceStackId: command.sourceStackId,
			subjectBranchName: command.subjectBranchName,
		});
		const afterAppliedStackCount = result.workspace.headInfo.stacks.length;
		const unappliedStackCount = Math.max(0, beforeAppliedStackCount + 1 - afterAppliedStackCount);

		if (context.prService && context.baseBranchName) {
			await updatePrDescriptions(
				stackService,
				context.prService,
				context.baseBranchName,
				command.projectId,
				command.sourceStackId,
			);
		}

		return { success: true, data: { ...result, unappliedStackCount } };
	} catch (error) {
		return { success: false, error };
	}
}

async function handleUpdateStackOrder(
	command: UpdateStackOrderCommand,
	services: CommandServices,
): Promise<CommandResult> {
	const { stackService } = services;

	try {
		await stackService.updateStackOrder({
			projectId: command.projectId,
			stacks: command.stacks,
		});

		return { success: true };
	} catch (error) {
		return { success: false, error };
	}
}

async function handleMoveChangesBetweenCommits(
	command: MoveChangesBetweenCommitsCommand,
	services: CommandServices,
): Promise<CommandResult> {
	const { stackService, uiState } = services;

	try {
		const { workspace } = await stackService.moveChangesBetweenCommits({
			projectId: command.projectId,
			destinationStackId: command.destinationStackId,
			destinationCommitId: command.destinationCommitId,
			sourceStackId: command.sourceStackId,
			sourceCommitId: command.sourceCommitId,
			changes: command.changes,
			dryRun: command.dryRun ?? false,
		});

		updateUiStateForReplacedCommits(
			uiState,
			command.sourceStackId,
			command.sourceCommitId,
			workspace.replacedCommits,
		);
		updateUiStateForReplacedCommits(
			uiState,
			command.destinationStackId,
			command.destinationCommitId,
			workspace.replacedCommits,
		);

		return { success: true, data: { workspace } };
	} catch (error) {
		return { success: false, error };
	}
}

async function handleUncommitChanges(
	command: UncommitChangesCommand,
	services: CommandServices,
): Promise<CommandResult> {
	const { stackService, uiState } = services;

	try {
		const { workspace } = await stackService.uncommitChanges({
			projectId: command.projectId,
			stackId: command.stackId,
			commitId: command.commitId,
			changes: command.changes,
			assignTo: command.assignTo,
			dryRun: command.dryRun ?? false,
		});

		updateUiStateForReplacedCommits(
			uiState,
			command.stackId,
			command.commitId,
			workspace.replacedCommits,
		);

		return { success: true, data: { workspace } };
	} catch (error) {
		return { success: false, error };
	}
}

async function handleUncommit(
	command: UncommitCommand,
	services: CommandServices,
): Promise<CommandResult> {
	const { stackService, uiState } = services;

	try {
		const result = await stackService.uncommit({
			projectId: command.projectId,
			stackId: command.stackId,
			commitIds: command.commitIds,
		});

		const selection = uiState.lane(command.stackId).selection;
		if (
			selection.current?.commitId &&
			command.commitIds.includes(selection.current.commitId)
		) {
			selection.set(undefined);
		}

		return { success: true, data: result };
	} catch (error) {
		return { success: false, error };
	}
}

async function handleDiscardChanges(
	command: DiscardChangesCommand,
	services: CommandServices,
): Promise<CommandResult> {
	const { stackService } = services;

	try {
		await stackService.discardChanges({
			projectId: command.projectId,
			worktreeChanges: command.worktreeChanges,
		});

		return { success: true };
	} catch (error) {
		return { success: false, error };
	}
}

async function handleAmendCommit(
	command: AmendCommitCommand,
	services: CommandServices,
): Promise<CommandResult> {
	const { stackService, uiState } = services;

	try {
		const outcome = await stackService.amendCommitMutation({
			projectId: command.projectId,
			stackId: command.stackId,
			commitId: command.commitId,
			worktreeChanges: command.worktreeChanges,
			dryRun: command.dryRun ?? false,
		});

		if (outcome.newCommit) {
			const laneState = uiState.lane(command.stackId);
			const previousSelection = laneState.selection.current;
			if (previousSelection?.commitId === command.commitId) {
				laneState.selection.set({
					...previousSelection,
					commitId: outcome.newCommit,
				});
			}
		}

		if (outcome.rejectedChanges.length > 0) {
			return {
				success: false,
				data: outcome,
				notification: {
					error: {
						title: "Cannot amend commit",
						message: "Some changes were rejected",
					},
				},
			};
		}

		return { success: true, data: outcome };
	} catch (error) {
		return { success: false, error };
	}
}

async function handleCreateCommit(
	command: CreateCommitCommand,
	services: CommandServices,
): Promise<CommandResult> {
	const { stackService, uiState } = services;

	try {
		const outcome = await stackService.createCommitMutation({
			projectId: command.projectId,
			stackId: command.stackId,
			stackBranchName: command.stackBranchName,
			parentId: command.parentId,
			message: command.message,
			worktreeChanges: command.worktreeChanges ?? [],
			dryRun: command.dryRun ?? false,
		});

		if (outcome.newCommit) {
			uiState.lane(command.stackId).selection.set({
				branchName: command.stackBranchName,
				commitId: outcome.newCommit,
				previewOpen: true,
			});
		}

		if (outcome.rejectedChanges.length > 0) {
			const pathsToRejectedChanges = outcome.rejectedChanges.reduce(
				(acc: Record<string, import("$lib/state/uiState.svelte").RejectionReason>, { reason, path }) => {
					acc[path] = reason as import("$lib/state/uiState.svelte").RejectionReason;
					return acc;
				},
				{},
			);

			uiState.global.modal.set({
				type: "commit-failed",
				projectId: command.projectId,
				targetBranchName: command.stackBranchName,
				newCommitId: outcome.newCommit ?? undefined,
				commitTitle: command.message,
				pathsToRejectedChanges,
			});

			return {
				success: false,
				data: outcome,
				notification: {
					error: {
						title: "Cannot create commit",
						message: "Some changes were rejected",
					},
				},
			};
		}

		return { success: true, data: outcome };
	} catch (error) {
		return { success: false, error };
	}
}

async function handleCreateStack(
	command: CreateStackCommand,
	services: CommandServices,
): Promise<CommandResult> {
	const { stackService } = services;

	try {
		const branch = command.branch ?? { name: undefined };
		const stack = await stackService.newStackMutation({
			projectId: command.projectId,
			branch: { name: branch.name, order: 0 },
		});

		return { success: true, data: stack };
	} catch (error) {
		return { success: false, error };
	}
}

async function handleSquashCommits(
	command: SquashCommitsCommand,
	services: CommandServices,
): Promise<CommandResult> {
	const { stackService } = services;

	try {
		await stackService.squashCommits({
			projectId: command.projectId,
			stackId: command.stackId,
			sourceCommitIds: command.sourceCommitIds,
			targetCommitId: command.targetCommitId,
		});

		return { success: true };
	} catch (error) {
		return { success: false, error };
	}
}

async function handleUnapplyStack(
	command: UnapplyStackCommand,
	services: CommandServices,
): Promise<CommandResult> {
	const { stackService } = services;

	try {
		await stackService.unapply({
			projectId: command.projectId,
			stackId: command.stackId,
		});

		return { success: true };
	} catch (error) {
		return { success: false, error };
	}
}

async function handleUpdateBranchName(
	command: UpdateBranchNameCommand,
	services: CommandServices,
): Promise<CommandResult> {
	const { stackService, uiState } = services;

	try {
		const [updateBranchName] = stackService.updateBranchName;
		await updateBranchName({
			projectId: command.projectId,
			laneId: command.laneId,
			branchName: command.branchName,
			newName: command.newName,
		});

		const laneState = uiState.lane(command.laneId);
		const projectState = uiState.project(command.projectId);
		const exclusiveAction = projectState.exclusiveAction.current;
		const previousSelection = laneState.selection.current;

		if (previousSelection) {
			const updatedSelection = replaceBranchInStackSelection(
				previousSelection,
				command.branchName,
				command.newName,
			);
			laneState.selection.set(updatedSelection);
		}

		if (exclusiveAction) {
			const updatedExclusiveAction = replaceBranchInExclusiveAction(
				exclusiveAction,
				command.branchName,
				command.newName,
			);
			projectState.exclusiveAction.set(updatedExclusiveAction);
		}

		return { success: true };
	} catch (error) {
		const state = uiState.lane(command.laneId);
		const previewOpen = state.selection.current?.previewOpen ?? false;
		state.selection.set({
			branchName: command.branchName,
			previewOpen,
		});
		return { success: false, error };
	}
}

async function handlePushStack(
	command: PushStackCommand,
	services: CommandServices,
	context: HandlerContext,
): Promise<CommandResult> {
	const { stackService, forgeFactory, dispatch, backendApi } = services;

	try {
		const [pushStack, pushStackQuery] = stackService.pushStack;
		const result = await pushStack({
			projectId: command.projectId,
			stackId: command.stackId,
			withForce: command.withForce,
			skipForcePushProtection: command.skipForcePushProtection ?? false,
			branch: command.branch ?? "",
			runHooks: command.runHooks ?? true,
			pushOpts: (command.pushOpts ?? []) as unknown as import("$lib/stacks/stack").GerritPushFlag[],
		});

		setTimeout(() => {
			const invalidations = [invalidatesList(ReduxTag.PullRequests)];

			if (result) {
				const upstreamBranchNames = result.branchToRemote
					.map(([_, refname]) =>
						getBranchNameFromRef(refname, result.remote),
					)
					.filter((name): name is string => name !== undefined);
				for (const name of upstreamBranchNames) {
					invalidations.push(invalidatesItem(ReduxTag.Checks, name));
				}
			}

			forgeFactory.invalidate(invalidations);
		}, 2000);

		return { success: true, data: result };
	} catch (error) {
		const commandError = error as ReduxError;
		const { code, message } = commandError;

		if (code === "GitForcePushProtection") {
			throw commandError;
		}

		const reason =
			code === "ProjectGitAuth"
				? "an authentication failure"
				: "an unforeseen error";

		return {
			success: false,
			error,
			notification: {
				warning: {
					title: "Git push failed",
					message: `Your branch cannot be pushed due to ${reason}.\n\nPlease check our [documentation](https://docs.gitbutler.com/troubleshooting/fetch-push)\non fetching and pushing for ways to resolve the problem.`,
				},
			},
		};
	}
}

async function handleInsertBlankCommit(
	command: InsertBlankCommitCommand,
	services: CommandServices,
): Promise<CommandResult> {
	const { stackService } = services;

	try {
		const [insertBlankCommit] = stackService.insertBlankCommit;
		await insertBlankCommit({
			projectId: command.projectId,
			stackId: command.stackId,
			branchName: command.branchName,
			targetCommitId: command.targetCommitId,
			insertAfter: command.insertAfter ?? false,
		});

		return { success: true };
	} catch (error) {
		return { success: false, error };
	}
}

async function handleStashIntoBranch(
	command: StashIntoBranchCommand,
	services: CommandServices,
): Promise<CommandResult> {
	const { stackService } = services;

	try {
		const [stashIntoBranch] = stackService.stashIntoBranch;
		await stashIntoBranch({
			projectId: command.projectId,
			branchName: command.branchName,
			message: command.message,
		});

		return { success: true };
	} catch (error) {
		return { success: false, error };
	}
}

async function handleUpdateCommitMessage(
	command: UpdateCommitMessageCommand,
	services: CommandServices,
): Promise<CommandResult> {
	const { stackService } = services;

	try {
		const [updateCommitMessage] = stackService.updateCommitMessage;
		await updateCommitMessage({
			projectId: command.projectId,
			commitId: command.commitId,
			message: command.message,
		});

		return { success: true };
	} catch (error) {
		return { success: false, error };
	}
}

async function handleAbsorb(
	command: AbsorbCommand,
	services: CommandServices,
): Promise<CommandResult> {
	const { stackService } = services;

	try {
		const [absorb] = stackService.absorb;
		await absorb({
			projectId: command.projectId,
			stackId: command.stackId,
			message: command.message,
			target: command.target,
		});

		return { success: true };
	} catch (error) {
		return { success: false, error };
	}
}

async function handleIntegrateUpstreamCommits(
	command: IntegrateUpstreamCommitsCommand,
	services: CommandServices,
): Promise<CommandResult> {
	const { stackService } = services;

	try {
		const [integrate, query] = stackService.integrateUpstreamCommits;
		const result = await integrate({
			projectId: command.projectId,
			stackId: command.stackId,
			seriesName: command.seriesName,
			integrationStrategy: command.integrationStrategy,
		});

		return { success: true, data: result };
	} catch (error) {
		return { success: false, error };
	}
}

function updateUiStateForReplacedCommits(
	uiState: CommandServices["uiState"],
	stackId: string,
	commitId: string,
	mapping: Record<string, string>,
): void {
	const sourceReplacement = mapping[commitId];
	const sourceState = untrack(() => uiState.lane(stackId).selection.current);
	if (sourceReplacement && sourceState) {
		uiState.lane(stackId).selection.set({ ...sourceState, commitId: sourceReplacement });
	}
}

export function createCommandHandlers(context: HandlerContext = {}): Map<
	StackCommand["type"],
	{
		execute: (command: StackCommand, services: CommandServices) => Promise<CommandResult>;
		getBusyStackIds: (command: StackCommand) => string[];
		getBusyCommitIds: (command: StackCommand) => string[];
	}
> {
	const handlers = new Map<
		StackCommand["type"],
		{
			execute: (command: StackCommand, services: CommandServices) => Promise<CommandResult>;
			getBusyStackIds: (command: StackCommand) => string[];
			getBusyCommitIds: (command: StackCommand) => string[];
		}
	>();

	handlers.set(STACK_COMMANDS.MOVE_COMMITS, {
		execute: (cmd, services) => handleMoveCommits(cmd as MoveCommitsCommand, services, context),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.MOVE_BRANCH, {
		execute: (cmd, services) => handleMoveBranch(cmd as MoveBranchCommand, services, context),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.TEAR_OFF_BRANCH, {
		execute: (cmd, services) => handleTearOffBranch(cmd as TearOffBranchCommand, services, context),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.UPDATE_STACK_ORDER, {
		execute: (cmd, services) => handleUpdateStackOrder(cmd as UpdateStackOrderCommand, services),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.MOVE_CHANGES_BETWEEN_COMMITS, {
		execute: (cmd, services) =>
			handleMoveChangesBetweenCommits(cmd as MoveChangesBetweenCommitsCommand, services),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.UNCOMMIT_CHANGES, {
		execute: (cmd, services) => handleUncommitChanges(cmd as UncommitChangesCommand, services),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.UNCOMMIT, {
		execute: (cmd, services) => handleUncommit(cmd as UncommitCommand, services),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.DISCARD_CHANGES, {
		execute: (cmd, services) => handleDiscardChanges(cmd as DiscardChangesCommand, services),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.AMEND_COMMIT, {
		execute: (cmd, services) => handleAmendCommit(cmd as AmendCommitCommand, services),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.CREATE_COMMIT, {
		execute: (cmd, services) => handleCreateCommit(cmd as CreateCommitCommand, services),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.CREATE_STACK, {
		execute: (cmd, services) => handleCreateStack(cmd as CreateStackCommand, services),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.SQUASH_COMMITS, {
		execute: (cmd, services) => handleSquashCommits(cmd as SquashCommitsCommand, services),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.UNAPPLY_STACK, {
		execute: (cmd, services) => handleUnapplyStack(cmd as UnapplyStackCommand, services),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.UPDATE_BRANCH_NAME, {
		execute: (cmd, services) => handleUpdateBranchName(cmd as UpdateBranchNameCommand, services),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.PUSH_STACK, {
		execute: (cmd, services) => handlePushStack(cmd as PushStackCommand, services, context),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.INTEGRATE_UPSTREAM_COMMITS, {
		execute: (cmd, services) =>
			handleIntegrateUpstreamCommits(cmd as IntegrateUpstreamCommitsCommand, services),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.INSERT_BLANK_COMMIT, {
		execute: (cmd, services) => handleInsertBlankCommit(cmd as InsertBlankCommitCommand, services),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.STASH_INTO_BRANCH, {
		execute: (cmd, services) => handleStashIntoBranch(cmd as StashIntoBranchCommand, services),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.UPDATE_COMMIT_MESSAGE, {
		execute: (cmd, services) => handleUpdateCommitMessage(cmd as UpdateCommitMessageCommand, services),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	handlers.set(STACK_COMMANDS.ABSORB, {
		execute: (cmd, services) => handleAbsorb(cmd as AbsorbCommand, services),
		getBusyStackIds: getAffectedStackIds,
		getBusyCommitIds: getAffectedCommitIds,
	});

	return handlers;
}
