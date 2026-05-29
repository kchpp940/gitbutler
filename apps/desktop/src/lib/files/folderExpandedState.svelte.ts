import { InjectionToken } from "@gitbutler/core/context";
import { SvelteMap } from "svelte/reactivity";

export const FOLDER_EXPANDED_STORE = new InjectionToken<FolderExpandedStateStore>(
	"FolderExpandedStateStore",
);

export class FolderExpandedStateStore {
	private projectStates = new Map<string, SvelteMap<string, boolean>>();
	private pendingRestores = new Map<string, string[]>();
	private dataVersions = new Map<string, number>();

	forProject(projectId: string): SvelteMap<string, boolean> {
		let state = this.projectStates.get(projectId);
		if (!state) {
			state = new SvelteMap<string, boolean>();
			this.projectStates.set(projectId, state);
		}
		return state;
	}

	captureExpandedDirectories(projectId: string): string[] {
		const state = this.projectStates.get(projectId);
		if (!state) return [];
		const result: string[] = [];
		for (const [path, expanded] of state.entries()) {
			if (expanded) result.push(path);
		}
		return result;
	}

	enqueueRestore(projectId: string, directories: string[]): void {
		if (directories.length === 0) return;
		this.pendingRestores.set(projectId, directories);
	}

	consumePendingRestore(projectId: string): void {
		const directories = this.pendingRestores.get(projectId);
		if (!directories) return;
		this.pendingRestores.delete(projectId);
		const state = this.forProject(projectId);
		for (const dir of directories) {
			state.set(dir, true);
		}
	}

	hasPendingRestore(projectId: string): boolean {
		return this.pendingRestores.has(projectId);
	}

	setDataVersion(projectId: string, version: number): void {
		this.dataVersions.set(projectId, version);
	}

	getDataVersion(projectId: string): number {
		return this.dataVersions.get(projectId) ?? 0;
	}

	clearProject(projectId: string): void {
		this.projectStates.delete(projectId);
		this.pendingRestores.delete(projectId);
		this.dataVersions.delete(projectId);
	}
}
