import {
	type ProjectSettingsDraft,
	type ProjectDraftState,
	computeIsDirty,
	createEmptyProjectDraft,
	deepEqual,
} from "$lib/settings/settingsDraftStore";

export class ProjectDraftStore {
	private stores = new Map<string, ProjectDraftState>();
	private activeProjectId = $state<string | null>(null);

	get draft(): ProjectSettingsDraft {
		if (!this.activeProjectId) return createEmptyProjectDraft();
		return this.ensureStore(this.activeProjectId).draft;
	}

	get original(): ProjectSettingsDraft {
		if (!this.activeProjectId) return createEmptyProjectDraft();
		return this.ensureStore(this.activeProjectId).original;
	}

	get isDirty(): boolean {
		if (!this.activeProjectId) return false;
		return this.ensureStore(this.activeProjectId).isDirty;
	}

	private ensureStore(projectId: string): ProjectDraftState {
		if (!this.stores.has(projectId)) {
			this.stores.set(projectId, {
				original: createEmptyProjectDraft(),
				draft: createEmptyProjectDraft(),
				isDirty: false,
			});
		}
		return this.stores.get(projectId)!;
	}

	private recalculateDirty(projectId: string): void {
		const store = this.ensureStore(projectId);
		store.isDirty = computeIsDirty(store.original, store.draft);
	}

	setActiveProject(projectId: string | null): void {
		this.activeProjectId = projectId;
	}

	setOriginal(projectId: string, original: ProjectSettingsDraft): void {
		const store = this.ensureStore(projectId);
		store.original = original;
		store.draft = JSON.parse(JSON.stringify(original));
		this.recalculateDirty(projectId);
	}

	updateDraft(projectId: string, updates: Partial<ProjectSettingsDraft>): void {
		const store = this.ensureStore(projectId);
		const updatedDraft = { ...store.draft, ...updates };

		if (!deepEqual(store.draft, updatedDraft)) {
			store.draft = updatedDraft;
			this.recalculateDirty(projectId);
		}
	}

	updateProjectDetails(
		projectId: string,
		updates: Pick<ProjectSettingsDraft, "title" | "description">,
	): void {
		this.updateDraft(projectId, updates);
	}

	updateGitSettings(
		projectId: string,
		updates: Pick<ProjectSettingsDraft, "forcePushProtection" | "omitCertificateCheck">,
	): void {
		this.updateDraft(projectId, updates);
	}

	updateAISettings(
		projectId: string,
		updates: Pick<ProjectSettingsDraft, "aiGenEnabled" | "aiExperimentalFeaturesEnabled">,
	): void {
		this.updateDraft(projectId, updates);
	}

	updateSigningSettings(
		projectId: string,
		updates: NonNullable<ProjectSettingsDraft["signing"]>,
	): void {
		const store = this.ensureStore(projectId);
		const currentSigning = store.draft.signing ?? {};
		const updatedSigning = { ...currentSigning, ...updates };
		if (!deepEqual(currentSigning, updatedSigning)) {
			store.draft = { ...store.draft, signing: updatedSigning };
			this.recalculateDirty(projectId);
		}
	}

	updateForgeSettings(
		projectId: string,
		updates: Pick<ProjectSettingsDraft, "forgeOverride" | "preferredForgeProvider" | "preferredForgeAccount">,
	): void {
		this.updateDraft(projectId, updates);
	}

	reset(projectId: string): void {
		const store = this.ensureStore(projectId);
		store.draft = JSON.parse(JSON.stringify(store.original));
		this.recalculateDirty(projectId);
	}

	promoteDraftToOriginal(projectId: string): void {
		const store = this.ensureStore(projectId);
		store.original = JSON.parse(JSON.stringify(store.draft));
		this.recalculateDirty(projectId);
	}

	getChanges(projectId: string): Partial<ProjectSettingsDraft> {
		const store = this.ensureStore(projectId);
		const changes: Partial<ProjectSettingsDraft> = {};

		for (const key of Object.keys(store.draft) as Array<keyof ProjectSettingsDraft>) {
			if (!deepEqual(store.original[key], store.draft[key])) {
				(changes as Record<string, unknown>)[key] = store.draft[key];
			}
		}

		return changes;
	}

	clear(projectId: string): void {
		this.stores.delete(projectId);
		if (this.activeProjectId === projectId) {
			this.activeProjectId = null;
		}
	}
}

export const PROJECT_DRAFT_STORE = new ProjectDraftStore();
