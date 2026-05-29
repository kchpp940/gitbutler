import { parseError } from "$lib/error/parser";
import { showError } from "$lib/error/showError";
import { showToast } from "$lib/notifications/toasts";
import { invalidatesList, ReduxTag } from "$lib/state/tags";
import type { UiState } from "$lib/state/uiState.svelte";
import { InjectionToken } from "@gitbutler/core/context";
import { reactive } from "@gitbutler/shared/reactiveUtils.svelte";
import {
	STACK_COMMANDS,
	type CommandNotification,
	type CommandResult,
	type CommandTimelineEntry,
	type StackCommand,
} from "$lib/stacks/stackCommands";
import type { AppDispatch } from "$lib/state/clientState.svelte";
import type { BackendApi } from "$lib/state/backendApi";
import type { DefaultForgeFactory } from "$lib/forge/forgeFactory.svelte";
import type { StackService } from "$lib/stacks/stackService.svelte";

export const STACK_COMMAND_EXECUTOR = new InjectionToken<StackCommandExecutor>("StackCommandExecutor");

const MAX_TIMELINE_ENTRIES = 100;

type CommandHandlerFn<T extends StackCommand = StackCommand> = (
	command: T,
	services: CommandServices,
) => Promise<CommandResult>;

export interface CommandServices {
	stackService: StackService;
	backendApi: BackendApi;
	dispatch: AppDispatch;
	forgeFactory: DefaultForgeFactory;
	uiState: UiState;
}

interface CommandHandler {
	validate?: (command: StackCommand) => string | undefined;
	execute: CommandHandlerFn;
	getNotification?: (result: CommandResult, command: StackCommand) => CommandNotification;
	getBusyStackIds?: (command: StackCommand) => string[];
	getBusyCommitIds?: (command: StackCommand) => string[];
	rollback?: (command: StackCommand, services: CommandServices, result: CommandResult) => Promise<void>;
}

function defaultErrorNotification(command: StackCommand, error: unknown): CommandNotification {
	const { description, message } = parseError(error);
	return {
		error: {
			title: getCommandErrorMessage(command),
			message: description ?? message,
		},
	};
}

function getCommandErrorMessage(command: StackCommand): string {
	switch (command.type) {
		case STACK_COMMANDS.MOVE_COMMITS:
			return "Cannot move commits";
		case STACK_COMMANDS.MOVE_BRANCH:
			return "Cannot move branch";
		case STACK_COMMANDS.TEAR_OFF_BRANCH:
			return "Cannot tear off branch";
		case STACK_COMMANDS.UPDATE_STACK_ORDER:
			return "Cannot reorder stacks";
		case STACK_COMMANDS.MOVE_CHANGES_BETWEEN_COMMITS:
			return "Cannot move changes";
		case STACK_COMMANDS.UNCOMMIT_CHANGES:
			return "Cannot uncommit changes";
		case STACK_COMMANDS.UNCOMMIT:
			return "Cannot uncommit";
		case STACK_COMMANDS.DISCARD_CHANGES:
			return "Cannot discard changes";
		case STACK_COMMANDS.AMEND_COMMIT:
			return "Cannot amend commit";
		case STACK_COMMANDS.CREATE_COMMIT:
			return "Cannot create commit";
		case STACK_COMMANDS.CREATE_STACK:
			return "Cannot create stack";
		case STACK_COMMANDS.SQUASH_COMMITS:
			return "Cannot squash commits";
		case STACK_COMMANDS.UNAPPLY_STACK:
			return "Cannot unapply stack";
		case STACK_COMMANDS.CREATE_BRANCH:
			return "Cannot create branch";
		case STACK_COMMANDS.UPDATE_BRANCH_NAME:
			return "Cannot rename branch";
		case STACK_COMMANDS.REMOVE_BRANCH:
			return "Cannot remove branch";
		case STACK_COMMANDS.INTEGRATE_UPSTREAM_COMMITS:
			return "Cannot integrate upstream commits";
		case STACK_COMMANDS.INTEGRATE_BRANCH_WITH_STEPS:
			return "Cannot integrate branch";
		case STACK_COMMANDS.CREATE_VIRTUAL_BRANCH_FROM_BRANCH:
			return "Cannot create virtual branch";
		case STACK_COMMANDS.DELETE_LOCAL_BRANCH:
			return "Cannot delete branch";
		case STACK_COMMANDS.PUSH_STACK:
			return "Git push failed";
		case STACK_COMMANDS.UPDATE_COMMIT_MESSAGE:
			return "Cannot update commit message";
		case STACK_COMMANDS.STASH_INTO_BRANCH:
			return "Cannot stash changes";
		case STACK_COMMANDS.UPDATE_BRANCH_PR_NUMBER:
			return "Cannot update PR number";
		case STACK_COMMANDS.ABSORB:
			return "Cannot absorb changes";
		case STACK_COMMANDS.INSERT_BLANK_COMMIT:
			return "Cannot insert blank commit";
		default:
			return "Operation failed";
	}
}

function getSuccessNotification(command: StackCommand, data: unknown): CommandNotification | undefined {
	switch (command.type) {
		case STACK_COMMANDS.DISCARD_CHANGES:
			return { success: { title: "Changes discarded" } };
		case STACK_COMMANDS.CREATE_STACK:
			return { success: { title: "Stack created" } };
		case STACK_COMMANDS.CREATE_COMMIT:
			return { success: { title: "Commit created" } };
		case STACK_COMMANDS.SQUASH_COMMITS:
			return { success: { title: "Commits squashed" } };
		case STACK_COMMANDS.UPDATE_STACK_ORDER:
			return { success: { title: "Stack order updated" } };
		default:
			return undefined;
	}
}

export class StackCommandExecutor {
	private timelineEntries: CommandTimelineEntry[] = $state([]);
	private executingCommands = new Map<string, Promise<CommandResult>>();

	timeline = reactive(() => this.timelineEntries);

	constructor(
		private services: CommandServices,
		private handlers: Map<StackCommand["type"], CommandHandler>,
	) {}

	async execute<TResult = unknown>(command: StackCommand): Promise<CommandResult<TResult>> {
		const handler = this.handlers.get(command.type);
		if (!handler) {
			const error = new Error(`No handler registered for command type: ${command.type}`);
			this.showNotification(command, { error: { title: "Unknown command", message: error.message } });
			return { success: false, error };
		}

		const validationError = handler.validate?.(command);
		if (validationError) {
			const error = new Error(validationError);
			this.showNotification(command, { error: { title: "Invalid command", message: validationError } });
			return { success: false, error };
		}

		const commandId = this.generateCommandId();
		const entry = this.createTimelineEntry(commandId, command);

		if (!command.meta?.skipTimeline) {
			this.addTimelineEntry(entry);
		}

		const busyStackIds = handler.getBusyStackIds?.(command) ?? [];
		const busyCommitId = handler.getBusyCommitIds?.(command)?.[0];

		const withBusyState = async <T>(fn: () => Promise<T>): Promise<T> => {
			if (busyStackIds.length === 0) return fn();
			return this.withStackBusy(command.projectId, busyStackIds, busyCommitId, fn);
		};

		const existingExecution = this.executingCommands.get(commandId);
		if (existingExecution) {
			return existingExecution as Promise<CommandResult<TResult>>;
		}

		const execution = withBusyState(async () => {
			try {
				entry.status = "executing";
				this.updateTimelineEntry(entry);

				const start = performance.now();
				const result = await handler.execute(command, this.services);
				entry.duration = performance.now() - start;

				if (result.success) {
					entry.status = "success";
					entry.result = result.data;

					const notification =
						result.notification ??
						handler.getNotification?.(result, command) ??
						getSuccessNotification(command, result.data);

					if (notification && !command.meta?.skipNotification) {
						this.showNotification(command, notification);
					}

					this.invalidateCache(command);
				} else {
					entry.status = "error";
					entry.error = result.error;

					if (handler.rollback && !result.rolledBack) {
						try {
							await handler.rollback(command, this.services, result);
							entry.status = "rolled_back";
						} catch (rollbackError) {
							entry.rollbackResult = { error: rollbackError };
						}
					}

					const notification =
						result.notification ??
						handler.getNotification?.(result, command) ??
						defaultErrorNotification(command, result.error);

					if (!command.meta?.skipNotification) {
						this.showNotification(command, notification);
					}
				}

				this.updateTimelineEntry(entry);
				return result as CommandResult<TResult>;
			} catch (error) {
				entry.status = "error";
				entry.error = error;

				if (handler.rollback) {
					try {
						await handler.rollback(command, this.services, { success: false, error });
						entry.status = "rolled_back";
					} catch (rollbackError) {
						entry.rollbackResult = { error: rollbackError };
					}
				}

				this.updateTimelineEntry(entry);

				const notification = defaultErrorNotification(command, error);
				if (!command.meta?.skipNotification) {
					this.showNotification(command, notification);
				}

				return { success: false, error } as CommandResult<TResult>;
			} finally {
				this.executingCommands.delete(commandId);
			}
		});

		this.executingCommands.set(commandId, execution);
		return execution;
	}

	registerHandler(type: StackCommand["type"], handler: CommandHandler): void {
		this.handlers.set(type, handler);
	}

	getTimeline(): CommandTimelineEntry[] {
		return [...this.timelineEntries];
	}

	clearTimeline(): void {
		this.timelineEntries = [];
	}

	private generateCommandId(): string {
		return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
	}

	private createTimelineEntry(id: string, command: StackCommand): CommandTimelineEntry {
		return {
			id,
			command,
			status: "pending",
			timestamp: Date.now(),
		};
	}

	private addTimelineEntry(entry: CommandTimelineEntry): void {
		this.timelineEntries = [entry, ...this.timelineEntries].slice(0, MAX_TIMELINE_ENTRIES);
	}

	private updateTimelineEntry(entry: CommandTimelineEntry): void {
		const index = this.timelineEntries.findIndex((e) => e.id === entry.id);
		if (index !== -1) {
			this.timelineEntries = [
				...this.timelineEntries.slice(0, index),
				entry,
				...this.timelineEntries.slice(index + 1),
			];
		}
	}

	private showNotification(command: StackCommand, notification: CommandNotification): void {
		if (notification.success) {
			showToast({
				style: "success",
				title: notification.success.title,
				message: notification.success.message,
			});
		}
		if (notification.error) {
			showError(notification.error.title, notification.error.message ?? notification.error);
		}
		if (notification.warning) {
			showToast({
				style: "warning",
				title: notification.warning.title,
				message: notification.warning.message,
			});
		}
	}

	private invalidateCache(command: StackCommand): void {
		const { dispatch, backendApi } = this.services;

		const tags = [invalidatesList(ReduxTag.Stacks), invalidatesList(ReduxTag.StackDetails)];

		switch (command.type) {
			case STACK_COMMANDS.PUSH_STACK:
				tags.push(invalidatesList(ReduxTag.PullRequests));
				break;
			case STACK_COMMANDS.UPDATE_BRANCH_PR_NUMBER:
				tags.push(invalidatesList(ReduxTag.PullRequests));
				break;
		}

		dispatch(backendApi.util.invalidateTags(tags));
	}

	private async withStackBusy<T>(
		projectId: string,
		stackIds: string[],
		commitId: string | undefined,
		fn: () => Promise<T>,
	): Promise<T> {
		const { uiState } = this.services;
		const stackBusyState = uiState.project(projectId).stackBusy;

		const previousBusy = stackBusyState.current;

		stackBusyState.set({ commitId, stackIds });

		try {
			return await fn();
		} finally {
			stackBusyState.set(previousBusy);
		}
	}
}
