import { InjectionToken, inject } from "@gitbutler/core/context";
import type { GlobalSettingsDraft } from "$lib/settings/settingsDraftStore";
import { SETTINGS_SERVICE, type SettingsService } from "$lib/settings/appSettings";
import { GIT_CONFIG_SERVICE, type GitConfigService } from "$lib/config/gitConfigService";
import { SECRET_SERVICE, type SecretsService } from "$lib/secrets/secretsService";
import { USER_SERVICE, type UserService } from "$lib/user/userService.svelte";
import { UI_STATE, type UiState } from "$lib/state/uiState.svelte";
import { AISecretHandle, GitAIConfigKey } from "$lib/ai/service";
import { PROMPT_SERVICE, type AIPromptService } from "$lib/ai/aiPromptService";
import { UPDATER_SERVICE, type UpdaterService } from "$lib/updater/updater";
import {
	fModeEnabled,
	stagingBehaviorFeature,
	autoSelectBranchNameFeature,
	autoSelectBranchCreationFeature,
} from "$lib/config/uiFeatureFlags";
import type { AppSettings } from "@gitbutler/but-sdk";
import { persisted } from "@gitbutler/shared/persisted";

export const GLOBAL_SETTINGS_SAVER = new InjectionToken<GlobalSettingsSaver>(
	"GlobalSettingsSaver",
);

type SaveChanges = {
	appSettings: Partial<GlobalSettingsDraft["appSettings"]>;
	uiPreferences: Partial<GlobalSettingsDraft["uiPreferences"]>;
	ai: Partial<GlobalSettingsDraft["ai"]>;
	git: Partial<GlobalSettingsDraft["git"]>;
	userProfile: Partial<GlobalSettingsDraft["userProfile"]>;
	lanes: Partial<GlobalSettingsDraft["lanes"]>;
	aiPrompts: Partial<GlobalSettingsDraft["aiPrompts"]>;
};

export class GlobalSettingsSaver {
	constructor(
		private settingsService: SettingsService,
		private gitConfigService: GitConfigService,
		private secretsService: SecretsService,
		private userService: UserService,
		private uiState: UiState,
		private updaterService: UpdaterService,
		private promptService: AIPromptService,
	) {}

	async save(changes: SaveChanges): Promise<void> {
		const promises: Promise<unknown>[] = [];

		if (Object.keys(changes.appSettings).length > 0) {
			promises.push(this.saveAppSettings(changes.appSettings));
		}

		if (Object.keys(changes.uiPreferences).length > 0) {
			promises.push(this.saveUIPreferences(changes.uiPreferences));
		}

		if (Object.keys(changes.ai).length > 0) {
			promises.push(this.saveAISettings(changes.ai));
		}

		if (Object.keys(changes.git).length > 0) {
			promises.push(this.saveGitSettings(changes.git));
		}

		if (Object.keys(changes.userProfile).length > 0) {
			promises.push(this.saveUserProfile(changes.userProfile));
		}

		if (Object.keys(changes.lanes).length > 0) {
			this.saveLanes(changes.lanes);
		}

		if (Object.keys(changes.aiPrompts).length > 0) {
			this.saveAIPrompts(changes.aiPrompts);
		}

		await Promise.all(promises);
	}

	private async saveAppSettings(
		changes: Partial<GlobalSettingsDraft["appSettings"]>,
	): Promise<void> {
		const promises: Promise<unknown>[] = [];

		if (changes.telemetry) {
			promises.push(this.settingsService.updateTelemetry(changes.telemetry));
		}

		if (changes.featureFlags) {
			promises.push(this.settingsService.updateFeatureFlags(changes.featureFlags));
		}

		if (changes.fetch) {
			promises.push(this.settingsService.updateFetch(changes.fetch));
		}

		if (changes.reviews) {
			promises.push(this.settingsService.updateReviews(changes.reviews));
		}

		if (changes.ui) {
			promises.push(this.settingsService.updateUi(changes.ui));
		}

		if (changes.irc) {
			promises.push(this.settingsService.updateIrc(changes.irc));
		}

		await Promise.all(promises);
	}

	private async saveUIPreferences(
		changes: Partial<GlobalSettingsDraft["uiPreferences"]>,
	): Promise<void> {
		const g = this.uiState.global;

		if (changes.theme !== undefined) {
			g.theme.set(changes.theme);
		}

		if (changes.defaultCodeEditor !== undefined) {
			g.defaultCodeEditor.set(changes.defaultCodeEditor);
		}

		if (changes.defaultTerminal !== undefined) {
			g.defaultTerminal.set(changes.defaultTerminal);
		}

		if (changes.defaultFileListMode !== undefined) {
			g.defaultFileListMode.set(changes.defaultFileListMode);
		}

		if (changes.pathFirst !== undefined) {
			g.pathFirst.set(changes.pathFirst);
		}

		if (changes.allInOneDiff !== undefined) {
			g.allInOneDiff.set(changes.allInOneDiff);
		}

		if (changes.highlightDiffs !== undefined) {
			g.highlightDiffs.set(changes.highlightDiffs);
		}

		if (changes.svgAsImage !== undefined) {
			g.svgAsImage.set(changes.svgAsImage);
		}

		if (changes.syntaxThemeLight !== undefined) {
			g.syntaxThemeLight.set(changes.syntaxThemeLight);
		}

		if (changes.syntaxThemeDark !== undefined) {
			g.syntaxThemeDark.set(changes.syntaxThemeDark);
		}

		if (changes.tabSize !== undefined) {
			g.tabSize.set(changes.tabSize);
		}

		if (changes.wrapText !== undefined) {
			g.wrapText.set(changes.wrapText);
		}

		if (changes.diffFont !== undefined) {
			g.diffFont.set(changes.diffFont);
		}

		if (changes.diffLigatures !== undefined) {
			g.diffLigatures.set(changes.diffLigatures);
		}

		if (changes.inlineUnifiedDiffs !== undefined) {
			g.inlineUnifiedDiffs.set(changes.inlineUnifiedDiffs);
		}

		if (changes.strongContrast !== undefined) {
			g.strongContrast.set(changes.strongContrast);
		}

		if (changes.colorBlindFriendly !== undefined) {
			g.colorBlindFriendly.set(changes.colorBlindFriendly);
		}

		if (changes.scrollbarVisibilityState !== undefined) {
			g.scrollbarVisibilityState.set(changes.scrollbarVisibilityState);
		}

		if (changes.disableAutoChecks !== undefined) {
			this.updaterService.disableAutoChecks.set(changes.disableAutoChecks);
		}

		if (changes.fModeEnabled !== undefined) {
			fModeEnabled.set(changes.fModeEnabled);
		}

		if (changes.zoom !== undefined) {
			g.zoom.set(changes.zoom);
		}

		if (changes.unassignedSidebarFolded !== undefined) {
			g.unassignedSidebarFolded.set(changes.unassignedSidebarFolded);
		}
	}

	private async saveAISettings(
		changes: Partial<GlobalSettingsDraft["ai"]>,
	): Promise<void> {
		const promises: Promise<unknown>[] = [];

		if (changes.modelKind !== undefined) {
			promises.push(
				this.gitConfigService.set(GitAIConfigKey.ModelProvider, changes.modelKind),
			);
		}

		if (changes.openAIKeyOption !== undefined) {
			promises.push(
				this.gitConfigService.set(GitAIConfigKey.OpenAIKeyOption, changes.openAIKeyOption),
			);
		}

		if (changes.openAIModelName !== undefined) {
			promises.push(
				this.gitConfigService.set(GitAIConfigKey.OpenAIModelName, changes.openAIModelName),
			);
		}

		if (changes.openAIKey !== undefined) {
			promises.push(this.secretsService.set(AISecretHandle.OpenAIKey, changes.openAIKey));
		}

		if (changes.openAICustomEndpoint !== undefined) {
			promises.push(
				this.gitConfigService.set(
					GitAIConfigKey.OpenAICustomEndpoint,
					changes.openAICustomEndpoint || "",
				),
			);
		}

		if (changes.anthropicKeyOption !== undefined) {
			promises.push(
				this.gitConfigService.set(
					GitAIConfigKey.AnthropicKeyOption,
					changes.anthropicKeyOption,
				),
			);
		}

		if (changes.anthropicModelName !== undefined) {
			promises.push(
				this.gitConfigService.set(
					GitAIConfigKey.AnthropicModelName,
					changes.anthropicModelName,
				),
			);
		}

		if (changes.anthropicKey !== undefined) {
			promises.push(
				this.secretsService.set(AISecretHandle.AnthropicKey, changes.anthropicKey),
			);
		}

		if (changes.diffLengthLimit !== undefined) {
			promises.push(
				this.gitConfigService.set(
					GitAIConfigKey.DiffLengthLimit,
					changes.diffLengthLimit.toString(),
				),
			);
		}

		if (changes.ollamaEndpoint !== undefined) {
			promises.push(
				this.gitConfigService.set(GitAIConfigKey.OllamaEndpoint, changes.ollamaEndpoint),
			);
		}

		if (changes.ollamaModel !== undefined) {
			promises.push(
				this.gitConfigService.set(GitAIConfigKey.OllamaModelName, changes.ollamaModel),
			);
		}

		if (changes.lmStudioEndpoint !== undefined) {
			promises.push(
				this.gitConfigService.set(GitAIConfigKey.LMStudioEndpoint, changes.lmStudioEndpoint),
			);
		}

		if (changes.lmStudioModel !== undefined) {
			promises.push(
				this.gitConfigService.set(GitAIConfigKey.LMStudioModelName, changes.lmStudioModel),
			);
		}

		if (changes.openRouterKey !== undefined) {
			promises.push(
				this.secretsService.set(AISecretHandle.OpenRouterKey, changes.openRouterKey),
			);
		}

		if (changes.openRouterModel !== undefined) {
			promises.push(
				this.gitConfigService.set(
					GitAIConfigKey.OpenRouterModelName,
					changes.openRouterModel,
				),
			);
		}

		await Promise.all(promises);
	}

	private async saveGitSettings(
		changes: Partial<GlobalSettingsDraft["git"]>,
	): Promise<void> {
		const promises: Promise<unknown>[] = [];

		if (changes.gitbutlerCommitter !== undefined) {
			promises.push(
				this.gitConfigService.set(
					"gitbutler.gitbutlerCommitter",
					changes.gitbutlerCommitter ? "1" : "0",
				),
			);
		}

		if (changes.autoFetchIntervalMinutes !== undefined) {
			promises.push(
				this.settingsService.updateFetch({
					autoFetchIntervalMinutes: changes.autoFetchIntervalMinutes,
				}),
			);
		}

		await Promise.all(promises);
	}

	private async saveUserProfile(
		changes: Partial<GlobalSettingsDraft["userProfile"]>,
	): Promise<void> {
		const updateParams: Parameters<typeof this.userService.updateUser>[0] = {};

		if (changes.name !== undefined) {
			updateParams.name = changes.name;
		}

		if (changes.picture !== undefined) {
			updateParams.picture = changes.picture;
		}

		if (Object.keys(updateParams).length > 0) {
			const updatedUser = await this.userService.updateUser(updateParams);
			if (updatedUser) {
				await this.userService.setUser(updatedUser);
			}
		}
	}

	private saveLanes(changes: Partial<GlobalSettingsDraft["lanes"]>): void {
		if (changes.branchPlacementLeftmost !== undefined) {
			const store = persisted<boolean>(false, "branch-placement-leftmost");
			store.set(changes.branchPlacementLeftmost);
		}

		if (changes.autoSelectBranchName !== undefined) {
			autoSelectBranchNameFeature.set(changes.autoSelectBranchName);
		}

		if (changes.autoSelectBranchCreation !== undefined) {
			autoSelectBranchCreationFeature.set(changes.autoSelectBranchCreation);
		}

		if (changes.stagingBehavior !== undefined) {
			stagingBehaviorFeature.set(changes.stagingBehavior);
		}
	}

	private saveAIPrompts(changes: Partial<GlobalSettingsDraft["aiPrompts"]>): void {
		if (changes.commitUserPrompts !== undefined) {
			this.promptService.commitPrompts.userPrompts.set(changes.commitUserPrompts);
		}

		if (changes.branchUserPrompts !== undefined) {
			this.promptService.branchPrompts.userPrompts.set(changes.branchUserPrompts);
		}
	}
}

export function createGlobalSettingsSaver(): GlobalSettingsSaver {
	const settingsService = inject(SETTINGS_SERVICE);
	const gitConfigService = inject(GIT_CONFIG_SERVICE);
	const secretsService = inject(SECRET_SERVICE);
	const userService = inject(USER_SERVICE);
	const uiState = inject(UI_STATE);
	const updaterService = inject(UPDATER_SERVICE);
	const promptService = inject(PROMPT_SERVICE);

	return new GlobalSettingsSaver(
		settingsService,
		gitConfigService,
		secretsService,
		userService,
		uiState,
		updaterService,
		promptService,
	);
}
