import type { Project } from "$lib/project/project";
import type { CardLifecycleAction, LifecycleAction, ProjectCardLifecycleState, ProjectLifecycleState } from "./types";
import { INITIAL_STATE, createCardInitialState } from "./types";

export function lifecycleReducer(
	state: ProjectLifecycleState,
	action: LifecycleAction,
): ProjectLifecycleState {
	switch (action.type) {
		case "SET_LOADING":
			return {
				...state,
				status: "loading",
				error: null,
			};

		case "SET_CHECKING":
			return {
				...state,
				status: "checking",
				error: null,
			};

		case "SET_ACTIVATING":
			return {
				...state,
				status: "activating",
				error: null,
			};

		case "SET_ACTIVE":
			return {
				...state,
				status: "active",
				project: action.payload.project,
				projectInfo: action.payload.projectInfo,
				isOpenInOtherWindow: action.payload.projectInfo?.is_exclusive === false,
				error: null,
				lastChecked: Date.now(),
			};

		case "SET_REPAIRING":
			return {
				...state,
				status: "repairing",
				error: null,
			};

		case "SET_ERROR":
			return {
				...state,
				status: "error",
				error: action.payload.error,
			};

		case "SET_NOT_FOUND":
			return {
				...state,
				status: "not_found",
				error: null,
			};

		case "SET_PROJECT_ID":
			return {
				...state,
				projectId: action.payload.projectId,
			};

		case "ADD_ISSUES":
			return {
				...state,
				issues: [...state.issues, ...action.payload.issues],
			};

		case "CLEAR_ISSUES":
			return {
				...state,
				issues: [],
			};

		case "UPDATE_PROJECT":
			return {
				...state,
				project: action.payload.project,
			};

		case "RESET":
			return { ...INITIAL_STATE };

		default:
			return state;
	}
}

export function cardLifecycleReducer(
	state: ProjectCardLifecycleState,
	action: CardLifecycleAction,
): ProjectCardLifecycleState {
	switch (action.type) {
		case "SET_LOADING":
			return {
				...state,
				status: "loading",
				error: null,
			};

		case "SET_CHECKING":
			return {
				...state,
				status: "checking",
				error: null,
			};

		case "SET_ACTIVE":
			return {
				...state,
				status: "active",
				project: action.payload.project,
				isOpenInOtherWindow: action.payload.isOpenInOtherWindow,
				error: null,
				lastChecked: Date.now(),
			};

		case "SET_REPAIRING":
			return {
				...state,
				status: "repairing",
				error: null,
			};

		case "SET_ERROR":
			return {
				...state,
				status: "error",
				error: action.payload.error,
			};

		case "ADD_ISSUES":
			return {
				...state,
				issues: [...state.issues, ...action.payload.issues],
			};

		case "CLEAR_ISSUES":
			return {
				...state,
				issues: [],
			};

		default:
			return state;
	}
}

export function createCardLifecycleStore(project: Project) {
	let state = $state<ProjectCardLifecycleState>(createCardInitialState(project));

	function dispatch(action: CardLifecycleAction) {
		state = cardLifecycleReducer(state, action);
	}

	return {
		get state() {
			return state;
		},
		get status() {
			return state.status;
		},
		get project() {
			return state.project;
		},
		get issues() {
			return state.issues;
		},
		get error() {
			return state.error;
		},
		get isOpenInOtherWindow() {
			return state.isOpenInOtherWindow;
		},
		get hasIssues() {
			return state.issues.length > 0;
		},
		get hasRecoverableIssues() {
			return state.issues.some((i) => i.recoverable);
		},
		dispatch,
	};
}
