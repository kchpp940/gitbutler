import {
	type GlobalSettingsDraft,
	type GlobalDraftState,
	computeIsDirty,
	createEmptyGlobalDraft,
	deepEqual,
} from "$lib/settings/settingsDraftStore";

export class GlobalDraftStore {
	private state = $state<GlobalDraftState>({
		original: createEmptyGlobalDraft(),
		draft: createEmptyGlobalDraft(),
		isDirty: false,
	});

	get original(): GlobalSettingsDraft {
		return this.state.original;
	}

	get draft(): GlobalSettingsDraft {
		return this.state.draft;
	}

	get isDirty(): boolean {
		return this.state.isDirty;
	}

	private recalculateDirty(): void {
		this.state.isDirty = computeIsDirty(this.state.original, this.state.draft);
	}

	setOriginal(original: GlobalSettingsDraft): void {
		this.state.original = original;
		this.state.draft = JSON.parse(JSON.stringify(original));
		this.recalculateDirty();
	}

	updateDraft<K extends keyof GlobalSettingsDraft>(
		category: K,
		updates: Partial<GlobalSettingsDraft[K]>,
	): void {
		const currentCategory = this.state.draft[category];
		const updatedCategory = { ...currentCategory, ...updates };

		if (!deepEqual(currentCategory, updatedCategory)) {
			this.state.draft = {
				...this.state.draft,
				[category]: updatedCategory,
			};
			this.recalculateDirty();
		}
	}

	updateAppSettings(updates: Partial<GlobalSettingsDraft["appSettings"]>): void {
		this.updateDraft("appSettings", updates);
	}

	updateUIPreferences(updates: Partial<GlobalSettingsDraft["uiPreferences"]>): void {
		this.updateDraft("uiPreferences", updates);
	}

	updateAISettings(updates: Partial<GlobalSettingsDraft["ai"]>): void {
		this.updateDraft("ai", updates);
	}

	updateGitSettings(updates: Partial<GlobalSettingsDraft["git"]>): void {
		this.updateDraft("git", updates);
	}

	updateUserProfile(updates: Partial<GlobalSettingsDraft["userProfile"]>): void {
		this.updateDraft("userProfile", updates);
	}

	updateLanes(updates: Partial<GlobalSettingsDraft["lanes"]>): void {
		this.updateDraft("lanes", updates);
	}

	updateAIPrompts(updates: Partial<GlobalSettingsDraft["aiPrompts"]>): void {
		this.updateDraft("aiPrompts", updates);
	}

	reset(): void {
		this.state.draft = JSON.parse(JSON.stringify(this.state.original));
		this.recalculateDirty();
	}

	promoteDraftToOriginal(): void {
		this.state.original = JSON.parse(JSON.stringify(this.state.draft));
		this.recalculateDirty();
	}

	getCategoryChanges<K extends keyof GlobalSettingsDraft>(
		category: K,
	): Partial<GlobalSettingsDraft[K]> {
		const original = this.state.original[category];
		const draft = this.state.draft[category];
		const changes: Partial<GlobalSettingsDraft[K]> = {};

		for (const key of Object.keys(draft) as Array<keyof GlobalSettingsDraft[K]>) {
			if (!deepEqual(original[key], draft[key])) {
				changes[key] = draft[key];
			}
		}

		return changes;
	}
}

export const GLOBAL_DRAFT_STORE = new GlobalDraftStore();
