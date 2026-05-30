import { goto } from "$app/navigation";
import { showError } from "$lib/error/showError";
import { showInfo, showWarning } from "$lib/notifications/toasts";
import { handleAddProjectOutcome, type Project } from "$lib/project/project";
import { chipToasts } from "@gitbutler/ui";
import type { ProjectsService } from "$lib/project/projectsService";
import type BaseBranchService from "$lib/baseBranch/baseBranchService.svelte";
import { clonePath, projectPath } from "$lib/routes/routes.svelte";
import { OnboardingEvent, type PostHogWrapper } from "$lib/telemetry/posthog";
import { InjectionToken } from "@gitbutler/core/context";
import { reactive } from "@gitbutler/shared/reactiveUtils.svelte";
import { lifecycleReducer, createCardLifecycleStore } from "./reducer";
import {
	INITIAL_STATE,
	type LifecycleAction,
	type OpenProjectOptions,
	type ProjectCardLifecycleState,
	type ProjectHealthIssue,
	type ProjectHealthIssueType,
	type ProjectLifecycleState,
	type RepairResult,
} from "./types";

export type ProjectLifecycleStore = ReturnType<typeof createProjectLifecycleStore>;

export function createProjectLifecycleStore(
	projectsService: ProjectsService,
	baseBranchService: BaseBranchService,
	posthog: PostHogWrapper,
) {
	let state = $state<ProjectLifecycleState>({ ...INITIAL_STATE });

	function dispatch(action: LifecycleAction) {
		state = lifecycleReducer(state, action);
	}

	function parseIssuesFromError(error: unknown): ProjectHealthIssue[] {
		const issues: ProjectHealthIssue[] = [];
		const errorMessage = error instanceof Error ? error.message : String(error);

		if (errorMessage.includes("corrupt") || errorMessage.includes("database")) {
			issues.push({
				type: "db_corrupted",
				message: errorMessage,
				recoverable: true,
			});
		} else if (errorMessage.includes("not a git repository")) {
			issues.push({
				type: "not_git_repository",
				message: errorMessage,
				recoverable: false,
			});
		} else if (errorMessage.includes("not found") || errorMessage.includes("path not found")) {
			issues.push({
				type: "path_not_found",
				message: errorMessage,
				recoverable: true,
			});
		}

		return issues;
	}

	function parseIssuesFromProjectInfo(
		projectInfo: { db_error?: string; headsup?: string; is_exclusive?: boolean } | null,
	): ProjectHealthIssue[] {
		const issues: ProjectHealthIssue[] = [];

		if (projectInfo?.db_error) {
			issues.push({
				type: "db_corrupted",
				message: projectInfo.db_error,
				recoverable: true,
			});
		}

		if (projectInfo?.headsup) {
			issues.push({
				type: "unknown",
				message: projectInfo.headsup,
				recoverable: false,
			});
		}

		if (projectInfo?.is_exclusive === false) {
			issues.push({
				type: "exclusive_lock",
				message: "Project is open in another window",
				recoverable: false,
			});
		}

		return issues;
	}

	function handleProjectActivationInfo(
		info: { is_exclusive: boolean; db_error?: string; headsup?: string } | null,
		projectId: string,
	) {
		if (!info) return;

		if (!info.is_exclusive) {
			showInfo(
				"Just FYI, this project is already open in another window",
				"There might be some unexpected behavior if you open it in multiple windows",
			);
		}

		if (info.db_error) {
			showError("The database was corrupted", info.db_error);
		}

		const dontShowAgainKey = `git-filters--dont-show-again--${projectId}`;
		if (info.headsup && localStorage.getItem(dontShowAgainKey) !== "1") {
			showWarning("Important PSA", info.headsup, {
				label: "Don't show again",
				onClick: (dismiss) => {
					localStorage.setItem(dontShowAgainKey, "1");
					dismiss();
				},
			});
		}
	}

	async function openProject(
		projectId: string,
		options: OpenProjectOptions = {},
	): Promise<Project | null> {
		const { validate = true, activate = true } = options;

		dispatch({ type: "SET_PROJECT_ID", payload: { projectId } });
		dispatch({ type: "SET_LOADING" });

		try {
			if (validate) {
				dispatch({ type: "SET_CHECKING" });
			}

			const project = await projectsService.fetchProject(projectId, !validate);

			if (activate) {
				dispatch({ type: "SET_ACTIVATING" });
				const projectInfo = await projectsService.setActiveProject(projectId);
				posthog.captureOnboarding(OnboardingEvent.SetProjectActive);

				handleProjectActivationInfo(projectInfo, projectId);

				const issues = parseIssuesFromProjectInfo(projectInfo);
				if (issues.length > 0) {
					dispatch({ type: "ADD_ISSUES", payload: { issues } });
				}

				dispatch({ type: "SET_ACTIVE", payload: { project, projectInfo } });
			} else {
				dispatch({
					type: "SET_ACTIVE",
					payload: { project, projectInfo: null },
				});
			}

			projectsService.setLastOpenedProject(projectId);

			return project;
		} catch (error: unknown) {
			posthog.captureOnboarding(OnboardingEvent.SetProjectActiveFailed);

			const issues = parseIssuesFromError(error);
			if (issues.length > 0) {
				dispatch({ type: "ADD_ISSUES", payload: { issues } });
			}

			dispatch({
				type: "SET_ERROR",
				payload: {
					error: error instanceof Error ? error : new Error(String(error)),
				},
			});

			return null;
		}
	}

	async function openProjectAndNavigate(projectId: string): Promise<void> {
		reset();
		await openProject(projectId);
		goto(projectPath(projectId));
	}

	async function openProjectInNewWindow(projectId: string): Promise<void> {
		await projectsService.openProjectInNewWindow(projectId);
	}

	async function addProject(path?: string): Promise<Project | null> {
		dispatch({ type: "SET_LOADING" });

		try {
			const outcome = await projectsService.addProject(path);

			if (!outcome) {
				dispatch({ type: "RESET" });
				return null;
			}

			if (outcome.type === "added" || outcome.type === "alreadyExists") {
				return outcome.subject;
			} else {
				handleAddProjectOutcome(outcome);
				dispatch({ type: "RESET" });
				return null;
			}
		} catch (error: unknown) {
			dispatch({
				type: "SET_ERROR",
				payload: {
					error: error instanceof Error ? error : new Error(String(error)),
				},
			});
			return null;
		}
	}

	async function addProjectAndNavigate(path?: string): Promise<void> {
		const project = await addProject(path);
		if (project) {
			await openProjectAndNavigate(project.id);
		}
	}

	async function addProjectFromClone(targetDir: string): Promise<Project | null> {
		posthog.captureOnboarding(OnboardingEvent.ClonedProject);

		const outcome = await projectsService.addProject(targetDir);
		if (!outcome) {
			posthog.captureOnboarding(
				OnboardingEvent.ClonedProjectFailed,
				"Failed to add project after cloning",
			);
			throw new Error("Failed to add project after cloning.");
		}

		if (outcome.type === "added" || outcome.type === "alreadyExists") {
			return outcome.subject;
		}

		handleAddProjectOutcome(outcome);
		return null;
	}

	async function addProjectFromCloneAndNavigate(targetDir: string): Promise<void> {
		const project = await addProjectFromClone(targetDir);
		if (project) {
			await openProjectAndNavigate(project.id);
		}
	}

	async function switchToProject(projectId: string): Promise<void> {
		await openProjectAndNavigate(projectId);
	}

	async function setTargetBranch(projectId: string, branch: string, pushRemote?: string): Promise<boolean> {
		dispatch({ type: "SET_ACTIVATING" });

		try {
			const [setTarget] = baseBranchService.setTarget;
			await setTarget({ projectId, branch, pushRemote });
			posthog.captureOnboarding(OnboardingEvent.SetTargetBranch);
			await openProjectAndNavigate(projectId);
			return true;
		} catch (e: unknown) {
			posthog.captureOnboarding(OnboardingEvent.SetTargetBranchFailed, e);
			dispatch({
				type: "SET_ERROR",
				payload: { error: e instanceof Error ? e : new Error(String(e)) },
			});
			return false;
		}
	}

	async function deleteProject(projectId: string): Promise<void> {
		dispatch({ type: "SET_LOADING" });

		const projects = await projectsService.fetchProjects();
		const remainingProject: Project | undefined = projects?.find((p) => p.id !== projectId);

		if (remainingProject) {
			await goto(projectPath(remainingProject.id));
			await projectsService.deleteProject(projectId);
		} else {
			await projectsService.deleteProject(projectId);
			await projectsService.fetchProjects();
			await goto("/");
		}

		chipToasts.success("Project deleted");
		reset();
	}

	async function deleteProjectWithErrorHandling(projectId: string): Promise<boolean> {
		try {
			await deleteProject(projectId);
			return true;
		} catch (err: any) {
			console.error(err);
			showError("Failed to delete project", err);
			return false;
		}
	}

	async function relocateProject(projectId: string): Promise<void> {
		await projectsService.relocateProject(projectId);
	}

	async function checkProjectHealth(projectId: string): Promise<ProjectHealthIssue[]> {
		dispatch({ type: "SET_CHECKING" });
		dispatch({ type: "CLEAR_ISSUES" });

		const issues: ProjectHealthIssue[] = [];

		try {
			const projectInfo = await projectsService.setActiveProject(projectId);
			issues.push(...parseIssuesFromProjectInfo(projectInfo));
		} catch (error: unknown) {
			issues.push(...parseIssuesFromError(error));
		}

		if (issues.length > 0) {
			dispatch({ type: "ADD_ISSUES", payload: { issues } });
		}

		if (state.project) {
			dispatch({ type: "SET_ACTIVE", payload: { project: state.project, projectInfo: null } });
		}

		return issues;
	}

	async function repairProject(
		projectId: string,
		issueTypes?: ProjectHealthIssueType[],
	): Promise<RepairResult> {
		dispatch({ type: "SET_REPAIRING" });

		const resolvedIssues: ProjectHealthIssue[] = [];
		const remainingIssues: ProjectHealthIssue[] = [];

		const issuesToRepair = issueTypes
			? state.issues.filter((i) => issueTypes.includes(i.type))
			: state.issues;

		for (const issue of issuesToRepair) {
			try {
				const repaired = await attemptRepair(projectId, issue.type);
				if (repaired) {
					resolvedIssues.push(issue);
				} else {
					remainingIssues.push(issue);
				}
			} catch {
				remainingIssues.push(issue);
			}
		}

		const success = resolvedIssues.length > 0;

		if (success) {
			const remainingAllIssues = state.issues.filter(
				(i) => !resolvedIssues.some((r) => r.type === i.type),
			);
			dispatch({ type: "CLEAR_ISSUES" });
			if (remainingAllIssues.length > 0) {
				dispatch({ type: "ADD_ISSUES", payload: { issues: remainingAllIssues } });
			}

			await checkProjectHealth(projectId);
		} else {
			dispatch({
				type: "SET_ERROR",
				payload: { error: new Error("Repair failed") },
			});
		}

		return {
			success,
			issuesResolved: resolvedIssues,
			issuesRemaining: remainingIssues,
		};
	}

	async function attemptRepair(projectId: string, issueType: ProjectHealthIssueType): Promise<boolean> {
		switch (issueType) {
			case "db_corrupted":
				try {
					await projectsService.deleteProject(projectId);
					return true;
				} catch {
					return false;
				}
			default:
				return false;
		}
	}

	function hasIssue(type: ProjectHealthIssueType): boolean {
		return state.issues.some((i) => i.type === type);
	}

	function getIssuesByType(type: ProjectHealthIssueType): ProjectHealthIssue[] {
		return state.issues.filter((i) => i.type === type);
	}

	function reset(): void {
		dispatch({ type: "RESET" });
	}

	function navigateToOnboarding(): void {
		reset();
		goto("/onboarding");
	}

	function navigateToClone(): void {
		goto(clonePath());
	}

	function navigateToHome(): void {
		reset();
		goto("/");
	}

	type CardStore = ReturnType<typeof createCardLifecycleStore>;

	async function checkCardProjectHealth(
		cardStore: CardStore,
	): Promise<ProjectHealthIssue[]> {
		cardStore.dispatch({ type: "SET_CHECKING" });
		cardStore.dispatch({ type: "CLEAR_ISSUES" });

		const project = cardStore.project;
		const issues: ProjectHealthIssue[] = [];

		try {
			const healthInfo = await projectsService.checkProjectHealth(project.id);
			const healthIssues = parseIssuesFromProjectInfo(healthInfo);
			issues.push(...healthIssues);

			if (healthIssues.length > 0) {
				cardStore.dispatch({ type: "ADD_ISSUES", payload: { issues: healthIssues } });
			}

			const isOpenInOtherWindow = healthInfo?.is_exclusive === false;

			if (healthIssues.length > 0 && healthIssues.some((i) => !i.recoverable)) {
				const firstIssue = healthIssues.find((i) => !i.recoverable) ?? healthIssues[0]!;
				cardStore.dispatch({
					type: "SET_ERROR",
					payload: { error: new Error(firstIssue.message) },
				});
			} else {
				cardStore.dispatch({
					type: "SET_ACTIVE",
					payload: { project, isOpenInOtherWindow },
				});
			}
		} catch (error: unknown) {
			const errorIssues = parseIssuesFromError(error);
			issues.push(...errorIssues);

			if (errorIssues.length > 0) {
				cardStore.dispatch({ type: "ADD_ISSUES", payload: { issues: errorIssues } });
			}

			cardStore.dispatch({
				type: "SET_ERROR",
				payload: { error: error instanceof Error ? error : new Error(String(error)) },
			});
		}

		return issues;
	}

	async function repairCardProject(cardStore: CardStore): Promise<RepairResult> {
		cardStore.dispatch({ type: "SET_REPAIRING" });

		const project = cardStore.project;
		const resolvedIssues: ProjectHealthIssue[] = [];
		const remainingIssues: ProjectHealthIssue[] = [];

		const issuesToRepair = cardStore.issues.filter((i) => i.recoverable);

		for (const issue of issuesToRepair) {
			try {
				const repaired = await attemptRepair(project.id, issue.type);
				if (repaired) {
					resolvedIssues.push(issue);
				} else {
					remainingIssues.push(issue);
				}
			} catch {
				remainingIssues.push(issue);
			}
		}

		cardStore.dispatch({ type: "CLEAR_ISSUES" });
		if (remainingIssues.length > 0) {
			cardStore.dispatch({ type: "ADD_ISSUES", payload: { issues: remainingIssues } });
		}

		const success = resolvedIssues.length > 0;
		if (success) {
			await checkCardProjectHealth(cardStore);
		} else {
			cardStore.dispatch({
				type: "SET_ERROR",
				payload: { error: new Error("Repair failed") },
			});
		}

		return {
			success,
			issuesResolved: resolvedIssues,
			issuesRemaining: remainingIssues,
		};
	}

	return {
		get state() {
			return reactive(() => state);
		},
		get status() {
			return reactive(() => state.status);
		},
		get project() {
			return reactive(() => state.project);
		},
		get issues() {
			return reactive(() => state.issues);
		},
		get error() {
			return reactive(() => state.error);
		},
		get isOpenInOtherWindow() {
			return reactive(() => state.isOpenInOtherWindow);
		},
		get hasIssues() {
			return reactive(() => state.issues.length > 0);
		},
		get hasRecoverableIssues() {
			return reactive(() => state.issues.some((i) => i.recoverable));
		},

		openProject,
		openProjectAndNavigate,
		openProjectInNewWindow,
		addProject,
		addProjectAndNavigate,
		addProjectFromClone,
		addProjectFromCloneAndNavigate,
		switchToProject,
		setTargetBranch,
		deleteProject,
		deleteProjectWithErrorHandling,
		relocateProject,
		checkProjectHealth,
		repairProject,
		hasIssue,
		getIssuesByType,
		reset,
		navigateToOnboarding,
		navigateToClone,
		navigateToHome,

		createCardLifecycleStore,
		checkCardProjectHealth,
		repairCardProject,
	};
}

export const PROJECT_LIFECYCLE_STORE = new InjectionToken<ProjectLifecycleStore>(
	"ProjectLifecycleStore",
);
