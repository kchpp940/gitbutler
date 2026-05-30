import type { Project, AddProjectOutcome } from "$lib/project/project";
import type { ProjectInfo } from "$lib/project/projectEndpoints";

export type ProjectLifecycleStatus =
	| "idle"
	| "loading"
	| "checking"
	| "activating"
	| "active"
	| "repairing"
	| "error"
	| "not_found";

export type ProjectHealthIssueType =
	| "db_corrupted"
	| "not_git_repository"
	| "no_dot_git_directory"
	| "path_not_found"
	| "bare_repository"
	| "non_main_worktree"
	| "no_workdir"
	| "not_a_directory"
	| "exclusive_lock"
	| "unknown";

export interface ProjectHealthIssue {
	type: ProjectHealthIssueType;
	message: string;
	recoverable: boolean;
	code?: string;
}

export interface ProjectLifecycleState {
	status: ProjectLifecycleStatus;
	projectId: string | null;
	project: Project | null;
	projectInfo: ProjectInfo | null;
	issues: ProjectHealthIssue[];
	error: Error | null;
	isOpenInOtherWindow: boolean;
	lastChecked: number | null;
}

export interface ProjectCardLifecycleState {
	status: ProjectLifecycleStatus;
	projectId: string;
	project: Project;
	issues: ProjectHealthIssue[];
	error: Error | null;
	isOpenInOtherWindow: boolean;
	lastChecked: number | null;
}

export type CardLifecycleAction =
	| { type: "SET_LOADING" }
	| { type: "SET_CHECKING" }
	| { type: "SET_ACTIVE"; payload: { project: Project; isOpenInOtherWindow: boolean } }
	| { type: "SET_REPAIRING" }
	| { type: "SET_ERROR"; payload: { error: Error } }
	| { type: "ADD_ISSUES"; payload: { issues: ProjectHealthIssue[] } }
	| { type: "CLEAR_ISSUES" };

export type LifecycleAction =
	| { type: "SET_LOADING" }
	| { type: "SET_CHECKING" }
	| { type: "SET_ACTIVATING" }
	| { type: "SET_ACTIVE"; payload: { project: Project; projectInfo: ProjectInfo | null } }
	| { type: "SET_REPAIRING" }
	| { type: "SET_ERROR"; payload: { error: Error } }
	| { type: "SET_NOT_FOUND" }
	| { type: "SET_PROJECT_ID"; payload: { projectId: string } }
	| { type: "ADD_ISSUES"; payload: { issues: ProjectHealthIssue[] } }
	| { type: "CLEAR_ISSUES" }
	| { type: "UPDATE_PROJECT"; payload: { project: Project } }
	| { type: "RESET" };

export interface OpenProjectOptions {
	validate?: boolean;
	activate?: boolean;
}

export interface AddProjectResult {
	success: boolean;
	outcome?: AddProjectOutcome;
	project?: Project;
	error?: Error;
}

export interface RepairResult {
	success: boolean;
	issuesResolved: ProjectHealthIssue[];
	issuesRemaining: ProjectHealthIssue[];
}

export const INITIAL_STATE: ProjectLifecycleState = {
	status: "idle",
	projectId: null,
	project: null,
	projectInfo: null,
	issues: [],
	error: null,
	isOpenInOtherWindow: false,
	lastChecked: null,
};

export function createCardInitialState(project: Project): ProjectCardLifecycleState {
	return {
		status: "idle",
		projectId: project.id,
		project,
		issues: [],
		error: null,
		isOpenInOtherWindow: false,
		lastChecked: null,
	};
}
