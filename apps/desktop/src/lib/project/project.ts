import { goto } from "$app/navigation";
import { showError } from "$lib/error/showError";
import { showToast } from "$lib/notifications/toasts";
import { projectPath } from "$lib/routes/routes.svelte";
import { TestId } from "@gitbutler/ui";
// Inlined to avoid circular import with forge/.
type ForgeName = "github" | "gitlab" | "bitbucket" | "azure" | "default";
import type { ApiProject, ForgeUser } from "@gitbutler/but-sdk";
import type { Code } from "@gitbutler/but-sdk";
import type { ReduxError } from "$lib/error/reduxError";
import { PROJECT_ERROR_STORE } from "$lib/project/projectErrorStore";

export type Project = {
	id: string;
	title: string;
	description?: string;
	path: string;
	git_dir?: string;
	api?: ApiProject;
	ok_with_force_push: boolean;
	force_push_protection: boolean;
	husky_hooks_enabled: boolean;
	omit_certificate_check: boolean | undefined;
	use_diff_context: boolean | undefined;
	// Produced just for the frontend to determine if the project is open in any window.
	is_open: boolean;
	forge_override: ForgeName | undefined;
	preferred_forge_user: ForgeUser | null;
	// Gerrit mode enabled for this project, derived from git configuration
	gerrit_mode: boolean;
	/**
	 * The path to the forge review template, if set in git configuration.
	 */
	forge_review_template_path: string | null;
};

export function vscodePath(path: string) {
	return path.includes("\\") ? "/" + path.replace("\\", "/") : path;
}

export type AddProjectOutcome =
	| {
			type: "added";
			subject: Project;
	  }
	| {
			type: "alreadyExists";
			subject: Project;
	  }
	| {
			type: "pathNotFound";
	  }
	| {
			type: "notADirectory";
	  }
	| {
			type: "bareRepository";
	  }
	| {
			type: "nonMainWorktree";
	  }
	| {
			type: "noWorkdir";
	  }
	| {
			type: "noDotGitDirectory";
	  }
	| {
			type: "notAGitRepository";
			subject: string;
	  }
	| {
			type: "permissionDenied";
			subject: string;
	  }
	| {
			type: "repoOwnership";
			subject: string;
	  };

const PROJECT_ERROR_MESSAGES: Record<
	string,
	{ title: string; message: string; style: "danger" | "warning" | "info" }
> = {
	ProjectDatabaseCorrupted: {
		title: "Database corrupted",
		message:
			"The project database was corrupted and has been recovered. A new database was created — your worktree is safe, but virtual branches may need to be reconfigured.",
		style: "danger",
	},
	ProjectDatabaseIncompatible: {
		title: "Database incompatible",
		message:
			"The project database was created by a newer version of GitButler and cannot be opened. Please update GitButler.",
		style: "danger",
	},
	ProjectFilterWarning: {
		title: "Git filters detected",
		message:
			"This repository uses Git filters (e.g. LFS) that will not be applied during workspace operations. Run `git lfs pull` after operations to restore files.",
		style: "warning",
	},
	ProjectPermissionDenied: {
		title: "Permission denied",
		message:
			"GitButler does not have permission to access this repository. Check the file permissions for the project directory.",
		style: "danger",
	},
	ProjectAlreadyOpenInAnotherWindow: {
		title: "Project already open",
		message:
			"This project is already open in another window. Opening it in multiple windows may cause unexpected behavior.",
		style: "info",
	},
	ProjectInvalidGitRepository: {
		title: "Not a valid Git repository",
		message:
			"The selected path is not a valid Git repository. Initialize one with `git init` or choose a different directory.",
		style: "warning",
	},
	RepoOwnership: {
		title: "Repository ownership issue",
		message:
			"Git considers this repository unsafe. Run `git config --global --add safe.directory <path>` to allow access.",
		style: "warning",
	},
};

export function handleProjectCommandError(
	error: unknown,
	options?: {
		retry?: () => Promise<void> | void;
		path?: string;
		projectId?: string;
	},
): void {
	const code = extractErrorCode(error);
	if (code && PROJECT_ERROR_MESSAGES[code]) {
		const message = extractErrorMessage(error);
		PROJECT_ERROR_STORE.addCommandError(code, message, {
			retry: options?.retry,
			path: options?.path,
			projectId: options?.projectId,
			raw: error,
		});
	} else {
		showError("Failed to add project", error);
	}
}

export function extractErrorCode(error: unknown): Code | undefined {
	if (error && typeof error === "object" && "code" in error) {
		return (error as { code?: Code }).code;
	}
	return undefined;
}

export function extractErrorMessage(error: unknown): string {
	if (error && typeof error === "object" && "message" in error) {
		return String((error as { message?: unknown }).message) || "Unknown error";
	}
	return "Unknown error";
}

export function handleAddProjectOutcome(
	outcome: AddProjectOutcome,
	onAdded?: (project: Project) => void,
): true {
	switch (outcome.type) {
		case "added":
			onAdded?.(outcome.subject);
			return true;
		case "alreadyExists":
			showToast({
				testId: TestId.AddProjectAlreadyExistsModal,
				style: "warning",
				title: `Project '${outcome.subject.title}' already exists`,
				message: `The project at "${outcome.subject.path}" is already added`,
				extraAction: {
					label: "Open project",
					testId: TestId.AddProjectAlreadyExistsModalOpenProjectButton,
					onClick: (dismiss) => {
						goto(projectPath(outcome.subject.id));
						dismiss();
					},
				},
			});
			return true;
		case "pathNotFound":
		case "notADirectory":
		case "bareRepository":
		case "nonMainWorktree":
		case "noWorkdir":
		case "noDotGitDirectory":
		case "notAGitRepository":
		case "permissionDenied":
		case "repoOwnership":
			PROJECT_ERROR_STORE.addOutcomeError(outcome);
			return true;
	}
}
