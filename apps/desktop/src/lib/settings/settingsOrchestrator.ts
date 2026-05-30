import { InjectionToken, inject } from "@gitbutler/core/context";
import { GLOBAL_DRAFT_STORE, GlobalDraftStore } from "$lib/settings/globalDraftStore";
import { PROJECT_DRAFT_STORE, ProjectDraftStore } from "$lib/settings/projectDraftStore";
import {
	GLOBAL_SETTINGS_LOADER,
	type GlobalSettingsLoader,
} from "$lib/settings/settingsLoader";
import {
	GLOBAL_SETTINGS_SAVER,
	type GlobalSettingsSaver,
} from "$lib/settings/settingsSaver";
import type {
	GlobalSettingsDraft,
	ProjectSettingsDraft,
} from "$lib/settings/settingsDraftStore";
import type { AppTheme } from "$lib/state/uiState.svelte";
import { UI_STATE, type UiState } from "$lib/state/uiState.svelte";
import { showError } from "$lib/error/showError";
import { chipToasts } from "@gitbutler/ui";
import { get } from "svelte/store";

export const SETTINGS_ORCHESTRATOR = new InjectionToken<SettingsOrchestrator>(
	"SettingsOrchestrator",
);

export type SaveStatus = "idle" | "saving" | "error";

export class SettingsOrchestrator {
	private saveStatus = $state<SaveStatus>("idle");
	private error = $state<Error | null>(null);

	get isSaving(): boolean {
		return this.saveStatus === "saving";
	}

	get hasError(): boolean {
		return this.saveStatus === "error";
	}

	get currentError(): Error | null {
		return this.error;
	}

	constructor(
		private globalDraftStore: GlobalDraftStore,
		private projectDraftStore: ProjectDraftStore,
		private globalLoader: GlobalSettingsLoader,
		private globalSaver: GlobalSettingsSaver,
		private uiState: UiState,
	) {}

	async loadGlobalSettings(): Promise<GlobalSettingsDraft> {
		try {
			const draft = await this.globalLoader.load();
			this.globalDraftStore.setOriginal(draft);
			return draft;
		} catch (err) {
			this.handleError(err, "Failed to load settings");
			throw err;
		}
	}

	async saveGlobalSettings(): Promise<void> {
		if (!this.globalDraftStore.isDirty) return;

		this.saveStatus = "saving";
		this.error = null;

		try {
			const changes = {
				appSettings: this.globalDraftStore.getCategoryChanges("appSettings"),
				uiPreferences: this.globalDraftStore.getCategoryChanges("uiPreferences"),
				ai: this.globalDraftStore.getCategoryChanges("ai"),
				git: this.globalDraftStore.getCategoryChanges("git"),
				userProfile: this.globalDraftStore.getCategoryChanges("userProfile"),
				lanes: this.globalDraftStore.getCategoryChanges("lanes"),
				aiPrompts: this.globalDraftStore.getCategoryChanges("aiPrompts"),
			};

			await this.globalSaver.save(changes);
			this.globalDraftStore.promoteDraftToOriginal();
			chipToasts.success("Settings saved");
		} catch (err) {
			this.handleError(err, "Failed to save settings");
			throw err;
		} finally {
			this.saveStatus = "idle";
		}
	}

	cancelGlobalSettings(): void {
		const original = this.globalDraftStore.original;
		this.globalDraftStore.reset();
		this.restoreUIStateFromOriginal(original.uiPreferences);
		this.error = null;
	}

	async refreshGlobalSettings(): Promise<void> {
		await this.loadGlobalSettings();
		this.error = null;
	}

	previewTheme(theme: AppTheme): void {
		this.globalDraftStore.updateUIPreferences({ theme });
		this.uiState.global.theme.set(theme);
	}

	previewZoom(zoom: number): void {
		const MIN_ZOOM = 0.375;
		const MAX_ZOOM = 3;
		const clamped = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
		this.globalDraftStore.updateUIPreferences({ zoom: clamped });
		this.uiState.global.zoom.set(clamped);
		document.documentElement.style.fontSize = clamped + "rem";
	}

	previewSidebarFolded(folded: boolean): void {
		this.globalDraftStore.updateUIPreferences({ unassignedSidebarFolded: folded });
		this.uiState.global.unassignedSidebarFolded.set(folded);
	}

	private restoreUIStateFromOriginal(ui: GlobalSettingsDraft["uiPreferences"]): void {
		if (!ui) return;
		const g = this.uiState.global;

		if (ui.theme !== undefined) g.theme.set(ui.theme);
		if (ui.zoom !== undefined) {
			g.zoom.set(ui.zoom);
			document.documentElement.style.fontSize = ui.zoom + "rem";
		}
		if (ui.unassignedSidebarFolded !== undefined) {
			g.unassignedSidebarFolded.set(ui.unassignedSidebarFolded);
		}
	}

	async loadProjectSettings(projectId: string): Promise<ProjectSettingsDraft> {
		try {
			this.projectDraftStore.setActiveProject(projectId);
			const draft = await this.loadProjectSettingsFromServices(projectId);
			this.projectDraftStore.setOriginal(projectId, draft);
			return draft;
		} catch (err) {
			this.handleError(err, "Failed to load project settings");
			throw err;
		}
	}

	private async loadProjectSettingsFromServices(
		projectId: string,
	): Promise<ProjectSettingsDraft> {
		const { PROJECTS_SERVICE } = await import("$lib/project/projectsService");
		const { GIT_CONFIG_SERVICE } = await import("$lib/config/gitConfigService");
		const { projectAiGenEnabled, projectAiExperimentalFeaturesEnabled, projectRunCommitHooks } =
			await import("$lib/config/config");
		const { PROMPT_SERVICE } = await import("$lib/ai/aiPromptService");

		const projectsService = inject(PROJECTS_SERVICE);
		const gitConfigService = inject(GIT_CONFIG_SERVICE);
		const promptService = inject(PROMPT_SERVICE);
		const project = await projectsService.fetchProject(projectId, true);
		const gbConfig = await gitConfigService.getGbConfig(projectId);

		return {
			title: project.title,
			description: project.description,
			forcePushProtection: project.force_push_protection,
			omitCertificateCheck: project.omit_certificate_check,
			aiGenEnabled: get(projectAiGenEnabled(projectId)),
			aiExperimentalFeaturesEnabled: get(projectAiExperimentalFeaturesEnabled(projectId)),
			huskyHooksEnabled: project.husky_hooks_enabled,
			forgeOverride: project.forge_override ?? undefined,
			preferredForgeProvider: project.preferred_forge_user ? (project.preferred_forge_user.provider as "github" | "gitlab") : undefined,
			preferredForgeAccount: project.preferred_forge_user?.details ?? undefined,
			runCommitHooks: get(projectRunCommitHooks(projectId)),
			signing: {
				signCommits: gbConfig.signCommits,
				signingFormat: gbConfig.signingFormat,
				signingKey: gbConfig.signingKey,
				gpgProgram: gbConfig.gpgProgram,
				gpgSshProgram: gbConfig.gpgSshProgram,
			},
			gerritMode: gbConfig.gitbutlerGerritMode ?? false,
			selectedCommitPromptId: get(promptService.selectedCommitPromptId(projectId)),
			selectedBranchPromptId: get(promptService.selectedBranchPromptId(projectId)),
		};
	}

	async saveProjectSettings(projectId: string): Promise<void> {
		const changes = this.projectDraftStore.getChanges(projectId);
		if (Object.keys(changes).length === 0) return;

		this.saveStatus = "saving";
		this.error = null;

		try {
			await this.saveProjectSettingsToServices(projectId, changes);
			this.projectDraftStore.promoteDraftToOriginal(projectId);
			chipToasts.success("Project settings saved");
		} catch (err) {
			this.handleError(err, "Failed to save project settings");
			throw err;
		} finally {
			this.saveStatus = "idle";
		}
	}

	private async saveProjectSettingsToServices(
		projectId: string,
		changes: Partial<ProjectSettingsDraft>,
	): Promise<void> {
		const { PROJECTS_SERVICE } = await import("$lib/project/projectsService");
		const { GIT_CONFIG_SERVICE } = await import("$lib/config/gitConfigService");
		const { projectAiGenEnabled, projectAiExperimentalFeaturesEnabled, projectRunCommitHooks } =
			await import("$lib/config/config");
		const { PROMPT_SERVICE } = await import("$lib/ai/aiPromptService");

		const projectsService = inject(PROJECTS_SERVICE);
		const gitConfigService = inject(GIT_CONFIG_SERVICE);
		const promptService = inject(PROMPT_SERVICE);

		if (
			changes.title !== undefined ||
			changes.description !== undefined ||
			changes.forcePushProtection !== undefined ||
			changes.omitCertificateCheck !== undefined ||
			changes.huskyHooksEnabled !== undefined ||
			changes.forgeOverride !== undefined
		) {
			const project = await projectsService.fetchProject(projectId, true);
			const update: Partial<typeof project> = {};

			if (changes.title !== undefined) update.title = changes.title;
			if (changes.description !== undefined) update.description = changes.description;
			if (changes.forcePushProtection !== undefined)
				update.force_push_protection = changes.forcePushProtection;
			if (changes.omitCertificateCheck !== undefined)
				update.omit_certificate_check = changes.omitCertificateCheck;
			if (changes.huskyHooksEnabled !== undefined)
				update.husky_hooks_enabled = changes.huskyHooksEnabled;

			if (changes.forgeOverride !== undefined) {
				if (changes.forgeOverride === "default" || changes.forgeOverride === undefined) {
					(update as Record<string, unknown>).unset_forge_override = true;
				} else {
					update.forge_override = changes.forgeOverride;
				}
			}

			if (Object.keys(update).length > 0) {
				await projectsService.updateProject({ ...project, ...update });
			}
		}

		if (changes.preferredForgeProvider !== undefined && changes.preferredForgeAccount !== undefined) {
			projectsService.updatePreferredForgeUser(projectId, {
				provider: changes.preferredForgeProvider,
				details: changes.preferredForgeAccount,
			} as any);
		}

		if (changes.signing !== undefined) {
			const signingUpdate: Record<string, string | boolean | null> = {};
			if (changes.signing.signCommits !== undefined)
				signingUpdate.signCommits = changes.signing.signCommits;
			if (changes.signing.signingFormat !== undefined)
				signingUpdate.signingFormat = changes.signing.signingFormat;
			if (changes.signing.signingKey !== undefined)
				signingUpdate.signingKey = changes.signing.signingKey;
			if (changes.signing.gpgProgram !== undefined)
				signingUpdate.gpgProgram = changes.signing.gpgProgram;
			if (changes.signing.gpgSshProgram !== undefined)
				signingUpdate.gpgSshProgram = changes.signing.gpgSshProgram;

			if (Object.keys(signingUpdate).length > 0) {
				await gitConfigService.setGbConfig(projectId, signingUpdate);
			}
		}

		if (changes.gerritMode !== undefined) {
			await gitConfigService.setGerritMode(projectId, changes.gerritMode);
		}

		if (changes.aiGenEnabled !== undefined) {
			projectAiGenEnabled(projectId).set(changes.aiGenEnabled);
		}

		if (changes.aiExperimentalFeaturesEnabled !== undefined) {
			projectAiExperimentalFeaturesEnabled(projectId).set(changes.aiExperimentalFeaturesEnabled);
		}

		if (changes.runCommitHooks !== undefined) {
			projectRunCommitHooks(projectId).set(changes.runCommitHooks);
		}

		if (changes.selectedCommitPromptId !== undefined) {
			promptService.selectedCommitPromptId(projectId).set(changes.selectedCommitPromptId);
		}

		if (changes.selectedBranchPromptId !== undefined) {
			promptService.selectedBranchPromptId(projectId).set(changes.selectedBranchPromptId);
		}
	}

	cancelProjectSettings(projectId: string): void {
		this.projectDraftStore.reset(projectId);
		this.error = null;
	}

	async refreshProjectSettings(projectId: string): Promise<void> {
		await this.loadProjectSettings(projectId);
		this.error = null;
	}

	private handleError(err: unknown, defaultMessage: string): void {
		this.saveStatus = "error";
		this.error = err instanceof Error ? err : new Error(String(err));
		showError(defaultMessage, err);
	}

	clearError(): void {
		this.error = null;
		if (this.saveStatus === "error") {
			this.saveStatus = "idle";
		}
	}
}

export function createSettingsOrchestrator(): SettingsOrchestrator {
	const globalLoader = inject(GLOBAL_SETTINGS_LOADER);
	const globalSaver = inject(GLOBAL_SETTINGS_SAVER);
	const uiState = inject(UI_STATE);

	return new SettingsOrchestrator(
		GLOBAL_DRAFT_STORE,
		PROJECT_DRAFT_STORE,
		globalLoader,
		globalSaver,
		uiState,
	);
}
