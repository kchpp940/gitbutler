import { reactive } from "@gitbutler/shared/reactiveUtils.svelte";
import type { AddProjectOutcome } from "$lib/project/project";
import type { ProjectActivationIssue } from "$lib/project/projectEndpoints";

type AddProjectError = Exclude<
	AddProjectOutcome,
	{ type: "added" } | { type: "alreadyExists" }
>;

export type ProjectErrorSource =
	| "add-outcome"
	| "command-error"
	| "activation-issue";

export type ProjectErrorEntry = {
	id: string;
	source: ProjectErrorSource;
	error:
		| AddProjectError
		| { code: string; message: string; raw?: unknown }
		| ProjectActivationIssue;
	retry?: () => Promise<void> | void;
	context?: {
		path?: string;
		projectId?: string;
	};
};

function createProjectErrorStore() {
	const errors = reactive<ProjectErrorEntry[]>([]);

	let nextId = 0;

	function addError(
		error: ProjectErrorEntry["error"],
		options: {
			source: ProjectErrorSource;
			retry?: () => Promise<void> | void;
			path?: string;
			projectId?: string;
		},
	): string {
		const id = `project-error-${++nextId}`;
		errors.push({
			id,
			source: options.source,
			error,
			retry: options.retry,
			context: {
				path: options.path,
				projectId: options.projectId,
			},
		});
		return id;
	}

	function addOutcomeError(
		outcome: AddProjectError,
		options?: {
			retry?: () => Promise<void> | void;
			path?: string;
			projectId?: string;
		},
	): string {
		let path = options?.path;
		if (!path && "subject" in outcome) {
			path = outcome.subject as string;
		}
		return addError(outcome, {
			source: "add-outcome",
			retry: options?.retry,
			path,
			projectId: options?.projectId,
		});
	}

	function addCommandError(
		code: string,
		message: string,
		options?: {
			retry?: () => Promise<void> | void;
			path?: string;
			projectId?: string;
			raw?: unknown;
		},
	): string {
		return addError(
			{ code, message, raw: options?.raw },
			{
				source: "command-error",
				retry: options?.retry,
				path: options?.path,
				projectId: options?.projectId,
			},
		);
	}

	function addActivationIssue(
		issue: ProjectActivationIssue,
		options?: {
			retry?: () => Promise<void> | void;
			path?: string;
			projectId?: string;
		},
	): string {
		return addError(issue, {
			source: "activation-issue",
			retry: options?.retry,
			path: options?.path,
			projectId: options?.projectId,
		});
	}

	function removeError(id: string) {
		const index = errors.findIndex((e) => e.id === id);
		if (index !== -1) {
			errors.splice(index, 1);
		}
	}

	function clearAll() {
		errors.length = 0;
	}

	return {
		errors,
		addOutcomeError,
		addCommandError,
		addActivationIssue,
		removeError,
		clearAll,
	};
}

export const PROJECT_ERROR_STORE = createProjectErrorStore();
