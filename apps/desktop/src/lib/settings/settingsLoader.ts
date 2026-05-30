import { InjectionToken, inject } from "@gitbutler/core/context";
import type { GlobalSettingsDraft } from "$lib/settings/settingsDraftStore";
import { SETTINGS_SERVICE, type SettingsService } from "$lib/settings/appSettings";
import { GIT_CONFIG_SERVICE, type GitConfigService } from "$lib/config/gitConfigService";
import { SECRET_SERVICE, type SecretsService } from "$lib/secrets/secretsService";
import { USER_SERVICE, type UserService } from "$lib/user/userService.svelte";
import { UI_STATE, type UiState } from "$lib/state/uiState.svelte";
import { AI_SERVICE, AISecretHandle, GitAIConfigKey, type AIService } from "$lib/ai/service";
import { PROMPT_SERVICE, type AIPromptService } from "$lib/ai/aiPromptService";
import { UPDATER_SERVICE, type UpdaterService } from "$lib/updater/updater";
import {
	fModeEnabled,
	stagingBehaviorFeature,
	autoSelectBranchNameFeature,
	autoSelectBranchCreationFeature,
} from "$lib/config/uiFeatureFlags";
import type { ModelKind, OpenAIModelName, AnthropicModelName } from "$lib/ai/types";
import type { KeyOption } from "$lib/ai/service";
import { get } from "svelte/store";
import { persisted } from "@gitbutler/shared/persisted";

export const GLOBAL_SETTINGS_LOADER = new InjectionToken<GlobalSettingsLoader>(
	"GlobalSettingsLoader",
);

export class GlobalSettingsLoader {
	constructor(
		private settingsService: SettingsService,
		private gitConfigService: GitConfigService,
		private secretsService: SecretsService,
		private userService: UserService,
		private uiState: UiState,
		private aiService: AIService,
		private updaterService: UpdaterService,
		private promptService: AIPromptService,
	) {}

	async load(): Promise<GlobalSettingsDraft> {
		const [appSettings, aiSettings, gitSettings, uiPreferences, userProfile, lanes, aiPrompts] =
			await Promise.all([
				this.loadAppSettings(),
				this.loadAISettings(),
				this.loadGitSettings(),
				this.loadUIPreferences(),
				this.loadUserProfile(),
				this.loadLanes(),
				this.loadAIPrompts(),
			]);

		return {
			appSettings,
			ai: aiSettings,
			git: gitSettings,
			uiPreferences,
			userProfile,
			lanes,
			aiPrompts,
		};
	}

	private async loadAppSettings(): Promise<GlobalSettingsDraft["appSettings"]> {
		try {
			const settings = await this.settingsService.fetchAppSettings();
			return {
				telemetry: settings.telemetry,
				featureFlags: settings.featureFlags,
				fetch: settings.fetch,
				reviews: settings.reviews,
				ui: settings.ui,
				irc: settings.irc,
			};
		} catch {
			return {};
		}
	}

	private async loadAISettings(): Promise<GlobalSettingsDraft["ai"]> {
		try {
			const [
				modelKind,
				openAIKeyOption,
				openAIModelName,
				openAIKey,
				openAICustomEndpoint,
				anthropicKeyOption,
				anthropicModelName,
				anthropicKey,
				diffLengthLimit,
				ollamaEndpoint,
				ollamaModel,
				lmStudioEndpoint,
				lmStudioModel,
				openRouterKey,
				openRouterModel,
			] = await Promise.all([
				this.aiService.getModelKind() as Promise<ModelKind>,
				this.aiService.getOpenAIKeyOption() as Promise<KeyOption>,
				this.aiService.getOpenAIModelName() as Promise<OpenAIModelName>,
				this.aiService.getOpenAIKey(),
				this.aiService.getOpenAICustomEndpoint(),
				this.aiService.getAnthropicKeyOption() as Promise<KeyOption>,
				this.aiService.getAnthropicModelName() as Promise<AnthropicModelName>,
				this.aiService.getAnthropicKey(),
				this.aiService.getDiffLengthLimit(),
				this.aiService.getOllamaEndpoint(),
				this.aiService.getOllamaModelName(),
				this.aiService.getLMStudioEndpoint(),
				this.aiService.getLMStudioModelName(),
				this.aiService.getOpenRouterKey(),
				this.aiService.getOpenRouterModelName(),
			]);

			return {
				modelKind,
				openAIKeyOption,
				openAIModelName,
				openAIKey,
				openAICustomEndpoint,
				anthropicKeyOption,
				anthropicModelName,
				anthropicKey,
				diffLengthLimit,
				ollamaEndpoint,
				ollamaModel,
				lmStudioEndpoint,
				lmStudioModel,
				openRouterKey,
				openRouterModel,
			};
		} catch {
			return {};
		}
	}

	private async loadGitSettings(): Promise<GlobalSettingsDraft["git"]> {
		try {
			const [gitbutlerCommitter, appSettings] = await Promise.all([
				this.gitConfigService.get("gitbutler.gitbutlerCommitter"),
				this.settingsService.fetchAppSettings(),
			]);

			return {
				gitbutlerCommitter: gitbutlerCommitter === "1",
				autoFetchIntervalMinutes: appSettings.fetch.autoFetchIntervalMinutes,
			};
		} catch {
			return {};
		}
	}

	private async loadUIPreferences(): Promise<GlobalSettingsDraft["uiPreferences"]> {
		const g = this.uiState.global;
		return {
			theme: g.theme.current,
			defaultCodeEditor: g.defaultCodeEditor.current,
			defaultTerminal: g.defaultTerminal.current,
			defaultFileListMode: g.defaultFileListMode.current,
			pathFirst: g.pathFirst.current,
			allInOneDiff: g.allInOneDiff.current,
			highlightDiffs: g.highlightDiffs.current,
			svgAsImage: g.svgAsImage.current,
			syntaxThemeLight: g.syntaxThemeLight.current,
			syntaxThemeDark: g.syntaxThemeDark.current,
			tabSize: g.tabSize.current,
			wrapText: g.wrapText.current,
			diffFont: g.diffFont.current,
			diffLigatures: g.diffLigatures.current,
			inlineUnifiedDiffs: g.inlineUnifiedDiffs.current,
			strongContrast: g.strongContrast.current,
			colorBlindFriendly: g.colorBlindFriendly.current,
			scrollbarVisibilityState: g.scrollbarVisibilityState.current,
			disableAutoChecks: get(this.updaterService.disableAutoChecks),
			fModeEnabled: get(fModeEnabled),
			zoom: g.zoom.current,
			unassignedSidebarFolded: g.unassignedSidebarFolded.current,
		};
	}

	private async loadUserProfile(): Promise<GlobalSettingsDraft["userProfile"]> {
		try {
			const user = this.userService.user;
			return {
				name: user?.name,
				picture: undefined,
			};
		} catch {
			return {};
		}
	}

	private async loadLanes(): Promise<GlobalSettingsDraft["lanes"]> {
		const branchPlacementLeftmost = get(persisted<boolean>(false, "branch-placement-leftmost"));
		return {
			branchPlacementLeftmost,
			autoSelectBranchName: get(autoSelectBranchNameFeature),
			autoSelectBranchCreation: get(autoSelectBranchCreationFeature),
			stagingBehavior: get(stagingBehaviorFeature),
		};
	}

	private async loadAIPrompts(): Promise<GlobalSettingsDraft["aiPrompts"]> {
		return {
			commitUserPrompts: get(this.promptService.commitPrompts.userPrompts),
			branchUserPrompts: get(this.promptService.branchPrompts.userPrompts),
		};
	}
}

export function createGlobalSettingsLoader(): GlobalSettingsLoader {
	const settingsService = inject(SETTINGS_SERVICE);
	const gitConfigService = inject(GIT_CONFIG_SERVICE);
	const secretsService = inject(SECRET_SERVICE);
	const userService = inject(USER_SERVICE);
	const uiState = inject(UI_STATE);
	const aiService = inject(AI_SERVICE);
	const updaterService = inject(UPDATER_SERVICE);
	const promptService = inject(PROMPT_SERVICE);

	return new GlobalSettingsLoader(
		settingsService,
		gitConfigService,
		secretsService,
		userService,
		uiState,
		aiService,
		updaterService,
		promptService,
	);
}
