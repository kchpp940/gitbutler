import { goto } from "$app/navigation";
import { page } from "$app/state";
import { type BranchesSelectionStore } from "$lib/branches/branchesSelectionStore.svelte";
import { type FolderExpandedStateStore } from "$lib/files/folderExpandedState.svelte";
import { createWorktreeSelection } from "$lib/selection/key";
import { InjectionToken } from "@gitbutler/core/context";
import { get } from "svelte/store";
import type { BackendApi } from "$lib/state/backendApi";
import type { FileSelectionManager } from "$lib/selection/fileSelectionManager.svelte";
import type { ProjectUiState as ProjectUiStateType } from "$lib/project/projectEndpoints";
import type { UiState } from "$lib/state/uiState.svelte";

export type SwitchScene =
	| "idle"
	| "user-switching"
	| "restoring"
	| "initial-load";

export const PROJECT_UI_STATE_SERVICE = new InjectionToken<ProjectUiStateService>(
	"ProjectUiStateService",
);

export class ProjectUiStateService {
	private activeProjectId: string | null = null;
	private saveTimeout: ReturnType<typeof setTimeout> | null = null;
	private pendingRouteRestore: { route: string; projectId: string } | null = null;
	private pendingSettingsRestore: {
		state: { open: boolean; pageId: string | null; type: "general" | "project" | null };
		projectId: string;
	} | null = null;

	private scene: SwitchScene = "idle";
	private sceneProjectId: string | null = null;
	private restoringProjectId: string | null = null;
	private pendingFileRestoreProjectId: string | null = null;

	constructor(
		private backendApi: BackendApi,
		private uiState: UiState,
		private fileSelectionManager: FileSelectionManager,
		private folderExpandedStore: FolderExpandedStateStore,
		private branchesSelectionStore: BranchesSelectionStore,
	) {}

	getScene(): SwitchScene {
		return this.scene;
	}

	getSceneProjectId(): string | null {
		return this.sceneProjectId;
	}

	beginScene(scene: SwitchScene, projectId: string): boolean {
		if (this.scene !== "idle" && scene !== "idle") {
			return false;
		}
		this.scene = scene;
		this.sceneProjectId = projectId;
		return true;
	}

	endScene(): void {
		this.scene = "idle";
		this.sceneProjectId = null;
		this.restoringProjectId = null;
	}

	canSave(projectId: string): boolean {
		if (this.scene === "user-switching") return false;
		if (this.scene === "restoring") return false;
		return true;
	}

	canRestore(projectId: string): boolean {
		if (this.scene === "user-switching") return false;
		if (this.scene === "restoring" && this.restoringProjectId !== projectId) return false;
		return true;
	}

	canRestoreRoute(projectId: string): boolean {
		if (this.scene === "user-switching") return false;
		if (this.scene === "restoring" && this.restoringProjectId === projectId) return true;
		if (this.scene === "initial-load" && this.sceneProjectId === projectId) return true;
		if (this.scene === "idle") return true;
		return false;
	}

	setActiveProject(projectId: string | null) {
		this.activeProjectId = projectId;
	}

	getActiveProject(): string | null {
		return this.activeProjectId;
	}

	captureExpandedDirectories(projectId: string): string[] {
		return this.folderExpandedStore.captureExpandedDirectories(projectId);
	}

	captureFileSelection(projectId: string, stackId?: string): string[] {
		const selectionId = createWorktreeSelection({ stackId });
		return this.fileSelectionManager.captureSelection(selectionId);
	}

	capturePrState(projectId: string): { open: boolean; prNumber: number | null } {
		return this.branchesSelectionStore.capturePrState(projectId);
	}

	captureSettingsState(): { open: boolean; pageId: string | null; type: "general" | "project" | null } {
		return this.uiState.captureSettingsState();
	}

	captureStackSelection(stackId: string) {
		return this.uiState.captureStackSelection(stackId);
	}

	captureRoute(): string {
		const currentPage = get(page);
		return currentPage.url.toString();
	}

	async saveState(projectId: string): Promise<void> {
		if (!this.canSave(projectId)) {
			return;
		}
		try {
			const expandedDirectories = this.captureExpandedDirectories(projectId);
			const selectedFiles = this.captureFileSelection(projectId);
			const prState = this.capturePrState(projectId);
			const settingsState = this.captureSettingsState();
			const route = this.captureRoute();

			const now = Date.now();
			const state: ProjectUiStateType = {
				route,
				selectedStackId: null,
				selectedFiles,
				expandedDirectories,
				prPanel: {
					open: prState.open,
					prNumber: prState.prNumber,
				},
				settingsPanel: {
					open: settingsState.open,
					pageId: settingsState.pageId,
				},
				updatedAt: {
					secsSinceEpoch: Math.floor(now / 1000),
					nanosSinceEpoch: (now % 1000) * 1000000,
				},
			};

			await this.backendApi.endpoints.setProjectUiState.mutate({ projectId, state });
		} catch (error) {
			console.error("Failed to save project UI state:", error);
		}
	}

	async saveStateDebounced(projectId: string, delay = 500): Promise<void> {
		if (!this.canSave(projectId)) {
			return;
		}
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}

		return new Promise((resolve) => {
			this.saveTimeout = setTimeout(async () => {
				await this.saveState(projectId);
				resolve();
			}, delay);
		});
	}

	async loadState(projectId: string): Promise<ProjectUiStateType | null> {
		try {
			const result = await this.backendApi.endpoints.getProjectUiState.fetch({ projectId });
			return result ?? null;
		} catch (error) {
			console.error("Failed to load project UI state:", error);
			return null;
		}
	}

	async restoreState(projectId: string): Promise<void> {
		if (!this.canRestore(projectId)) {
			return;
		}
		if (this.scene === "idle") {
			this.beginScene("restoring", projectId);
		}
		this.restoringProjectId = projectId;
		const state = await this.loadState(projectId);
		if (!state) {
			this.setActiveProject(projectId);
			this.restoringProjectId = null;
			if (this.scene === "restoring") {
				this.endScene();
			}
			return;
		}

		this.enqueueAllRestores(projectId, state);
		this.setActiveProject(projectId);
	}

	private enqueueAllRestores(projectId: string, state: ProjectUiStateType): void {
		if (state.expandedDirectories.length > 0) {
			this.folderExpandedStore.enqueueRestore(projectId, state.expandedDirectories);
		}

		if (state.selectedFiles.length > 0) {
			const selectionId = createWorktreeSelection({ stackId: state.selectedStackId ?? undefined });
			this.fileSelectionManager.enqueueFileRestore(selectionId, state.selectedFiles);
			this.pendingFileRestoreProjectId = projectId;
		}

		if (state.prPanel.open) {
			this.branchesSelectionStore.enqueuePrRestore(projectId, state.prPanel.open, state.prPanel.prNumber);
		}

		if (state.settingsPanel.open && state.settingsPanel.pageId) {
			this.pendingSettingsRestore = {
				state: {
					open: state.settingsPanel.open,
					pageId: state.settingsPanel.pageId,
					type: ["project", "git", "ai", "experimental"].includes(state.settingsPanel.pageId)
						? "project"
						: "general",
				},
				projectId,
			};
		}

		if (state.route && state.route.includes(`/${projectId}/`)) {
			this.pendingRouteRestore = { route: state.route, projectId };
		}
	}

	consumeFolderExpandedRestore(projectId: string): void {
		this.folderExpandedStore.consumePendingRestore(projectId);
		this.tryEndScene(projectId);
	}

	consumeFileSelectionRestore(selectionId: { type: string; stackId?: string }): void {
		this.fileSelectionManager.consumePendingFileRestore(selectionId as any);
		this.pendingFileRestoreProjectId = null;
		this.tryEndScene();
	}

	consumePrRestore(projectId: string): void {
		this.branchesSelectionStore.consumePendingPrRestore(projectId);
		this.tryEndScene(projectId);
	}

	consumeSettingsRestore(): void {
		if (!this.pendingSettingsRestore) return;
		const { state, projectId } = this.pendingSettingsRestore;
		this.pendingSettingsRestore = null;
		this.uiState.restoreSettingsState(state, projectId);
		this.tryEndScene(projectId);
	}

	consumeRouteRestore(projectId: string): void {
		if (!this.canRestoreRoute(projectId)) {
			this.pendingRouteRestore = null;
			return;
		}
		if (!this.pendingRouteRestore || this.pendingRouteRestore.projectId !== projectId) return;
		const { route } = this.pendingRouteRestore;
		this.pendingRouteRestore = null;
		const currentPage = get(page);
		if (currentPage.url.toString() !== route) {
			goto(route);
		}
		this.tryEndScene(projectId);
	}

	private tryEndScene(projectId?: string): void {
		if (this.scene === "idle") return;
		const targetProjectId = projectId ?? this.sceneProjectId;
		if (!targetProjectId) return;
		if (
			!this.hasPendingRestores(targetProjectId) &&
			this.pendingFileRestoreProjectId === null
		) {
			this.endScene();
		}
	}

	hasPendingRestores(projectId: string): boolean {
		return (
			this.folderExpandedStore.hasPendingRestore(projectId) ||
			this.branchesSelectionStore.hasPendingPrRestore(projectId) ||
			this.pendingSettingsRestore?.projectId === projectId ||
			this.pendingRouteRestore?.projectId === projectId ||
			this.pendingFileRestoreProjectId === projectId
		);
	}

	async saveBeforeSwitch(fromProjectId: string, _toProjectId: string): Promise<void> {
		if (this.scene === "restoring") {
			return;
		}
		await this.saveState(fromProjectId);
		this.setActiveProject(null);
	}

	dispose() {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}
	}
}

export function createProjectUiStateService(
	backendApi: BackendApi,
	uiState: UiState,
	fileSelectionManager: FileSelectionManager,
	folderExpandedStore: FolderExpandedStateStore,
	branchesSelectionStore: BranchesSelectionStore,
): ProjectUiStateService {
	return new ProjectUiStateService(backendApi, uiState, fileSelectionManager, folderExpandedStore, branchesSelectionStore);
}
