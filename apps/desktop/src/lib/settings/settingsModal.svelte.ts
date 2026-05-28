import { UI_STATE } from "$lib/state/uiState.svelte";
import { inject } from "@gitbutler/core/context";
import type {
	GeneralSettingsModalState,
	GeneralSettingsPageId,
	ProjectSettingsModalState,
	ProjectSettingsPageId,
} from "$lib/state/uiState.svelte";

let closeInterceptor: (() => boolean) | null = $state(null);

export function setCloseInterceptor(fn: (() => boolean) | null): () => void {
	closeInterceptor = fn;
	return () => {
		if (closeInterceptor === fn) {
			closeInterceptor = null;
		}
	};
}

export function getCloseInterceptor(): (() => boolean) | null {
	return closeInterceptor;
}

export function clearCloseInterceptor(): void {
	closeInterceptor = null;
}

export function useSettingsModal() {
	const uiState = inject(UI_STATE);

	function openGeneralSettings(selectedId?: GeneralSettingsPageId) {
		const modalState: GeneralSettingsModalState = {
			type: "general-settings",
			selectedId,
		};
		uiState.global.modal.set(modalState);
	}

	function openProjectSettings(projectId: string, selectedId?: ProjectSettingsPageId) {
		const modalState: ProjectSettingsModalState = {
			type: "project-settings",
			projectId,
			selectedId,
		};
		uiState.global.modal.set(modalState);
	}

	function closeSettings() {
		uiState.global.modal.set(undefined);
	}

	return {
		openGeneralSettings,
		openProjectSettings,
		closeSettings,
	};
}
