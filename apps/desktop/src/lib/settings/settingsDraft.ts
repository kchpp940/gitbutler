import { InjectionToken, inject, injectOptional } from "@gitbutler/core/context";
import {
	SETTINGS_SERVICE,
	type SettingsService,
} from "$lib/settings/appSettings";
import { GIT_CONFIG_SERVICE, type GitConfigService } from "$lib/config/gitConfigService";
import { UI_STATE, type GlobalUiState, type UiState } from "$lib/state/uiState.svelte";
import { SECRET_SERVICE, type SecretsService } from "$lib/secrets/secretsService";
import { UPDATER_SERVICE, type UpdaterService } from "$lib/updater/updater";
import { PROJECTS_SERVICE, type ProjectsService } from "$lib/project/projectsService";
import type { AppSettings } from "@gitbutler/but-sdk";
import {
	GitAIConfigKey,
	KeyOption,
	type AISecretHandle,
} from "$lib/ai/service";
import {
	fModeEnabled,
	autoSelectBranchNameFeature,
	autoSelectBranchCreationFeature,
	stagingBehaviorFeature,
	type StagingBehavior,
} from "$lib/config/uiFeatureFlags";
import {
	projectAiGenEnabled,
	projectAiExperimentalFeaturesEnabled,
	type ProjectPersisted,
} from "$lib/config/config";
import { persisted } from "@gitbutler/shared/persisted";
import { showError } from "$lib/error/showError";

export const GENERAL_SETTINGS_DRAFT = new InjectionToken<GeneralSettingsDraftStore>(
	"GeneralSettingsDraftStore",
);

export const PROJECT_SETTINGS_DRAFT = new InjectionToken<ProjectSettingsDraftStore>(
	"ProjectSettingsDraftStore",
);

type FieldSource =
	| { type: "uiState"; key: keyof GlobalUiState }
	| { type: "appSettings"; path: string }
	| { type: "gitConfig"; key: string }
	| { type: "secret"; handle: string }
	| { type: "persistedGlobal"; store: ReturnType<typeof persisted<any>> }
	| { type: "persistedProject"; factory: (projectId: string) => ProjectPersisted<any>; projectKey: string }
	| { type: "project"; path: string };

type FieldDefinition = {
	source: FieldSource;
	defaultValue: any;
	transform?: {
		fromSaved?: (v: any) => any;
		toSave?: (v: any) => any;
	};
};

function appSettingsPath(path: string): FieldSource {
	return { type: "appSettings", path };
}

function gitConfigKey(key: string): FieldSource {
	return { type: "gitConfig", key };
}

function secretHandle(handle: string): FieldSource {
	return { type: "secret", handle };
}

function uiStateKey(key: keyof GlobalUiState): FieldSource {
	return { type: "uiState", key };
}

function persistedGlobal(store: ReturnType<typeof persisted<any>>): FieldSource {
	return { type: "persistedGlobal", store };
}

function persistedProject(
	factory: (projectId: string) => ProjectPersisted<any>,
	projectKey: string,
): FieldSource {
	return { type: "persistedProject", factory, projectKey };
}

function projectField(path: string): FieldSource {
	return { type: "project", path };
}

const GENERAL_FIELDS: Record<string, FieldDefinition> = {
	theme: { source: uiStateKey("theme"), defaultValue: "system" },
	tabSize: { source: uiStateKey("tabSize"), defaultValue: 4 },
	wrapText: { source: uiStateKey("wrapText"), defaultValue: false },
	diffFont: { source: uiStateKey("diffFont"), defaultValue: "Geist Mono, Menlo, monospace" },
	diffLigatures: { source: uiStateKey("diffLigatures"), defaultValue: false },
	inlineUnifiedDiffs: { source: uiStateKey("inlineUnifiedDiffs"), defaultValue: false },
	strongContrast: { source: uiStateKey("strongContrast"), defaultValue: false },
	colorBlindFriendly: { source: uiStateKey("colorBlindFriendly"), defaultValue: false },
	defaultCodeEditor: {
		source: uiStateKey("defaultCodeEditor"),
		defaultValue: { schemeIdentifer: "vscode", displayName: "VSCode" },
	},
	defaultTerminal: {
		source: uiStateKey("defaultTerminal"),
		defaultValue: { identifier: "terminal", displayName: "Terminal", platform: "macos" },
	},
	defaultFileListMode: { source: uiStateKey("defaultFileListMode"), defaultValue: "list" },
	pathFirst: { source: uiStateKey("pathFirst"), defaultValue: true },
	allInOneDiff: { source: uiStateKey("allInOneDiff"), defaultValue: false },
	highlightDiffs: { source: uiStateKey("highlightDiffs"), defaultValue: false },
	svgAsImage: { source: uiStateKey("svgAsImage"), defaultValue: true },
	syntaxThemeLight: { source: uiStateKey("syntaxThemeLight"), defaultValue: "github-light" },
	syntaxThemeDark: { source: uiStateKey("syntaxThemeDark"), defaultValue: "github-dark" },
	scrollbarVisibilityState: { source: uiStateKey("scrollbarVisibilityState"), defaultValue: "scroll" },

	fetchIntervalMinutes: {
		source: appSettingsPath("fetch.autoFetchIntervalMinutes"),
		defaultValue: 60,
	},
	autoFillPrDescription: {
		source: appSettingsPath("reviews.autoFillPrDescriptionFromCommit"),
		defaultValue: true,
	},
	featureFlagSingleBranch: {
		source: appSettingsPath("featureFlags.singleBranch"),
		defaultValue: false,
	},
	featureFlagIrc: {
		source: appSettingsPath("featureFlags.irc"),
		defaultValue: false,
	},
	ircEnabled: {
		source: appSettingsPath("irc.connection.enabled"),
		defaultValue: false,
	},
	ircHost: { source: appSettingsPath("irc.server.host"), defaultValue: "irc.libera.chat" },
	ircPort: { source: appSettingsPath("irc.server.port"), defaultValue: 6697 },
	ircAutoShare: { source: appSettingsPath("irc.autoShare"), defaultValue: false },
	telemetryEnabled: {
		source: appSettingsPath("telemetry.enabled"),
		defaultValue: true,
	},

	annotateCommits: {
		source: gitConfigKey("gitbutler.gitbutlerCommitter"),
		defaultValue: true,
		transform: {
			fromSaved: (v: string | undefined) => v === "1" || v === "true",
			toSave: (v: boolean) => (v ? "1" : "0"),
		},
	},

	aiModelKind: { source: gitConfigKey(GitAIConfigKey.ModelProvider), defaultValue: "open-ai" },

	openAIKeyOption: {
		source: gitConfigKey(GitAIConfigKey.OpenAIKeyOption),
		defaultValue: KeyOption.GitButler,
	},
	openAIModelName: {
		source: gitConfigKey(GitAIConfigKey.OpenAIModelName),
		defaultValue: "gpt-4o",
	},
	openAICustomEndpoint: {
		source: gitConfigKey(GitAIConfigKey.OpenAICustomEndpoint),
		defaultValue: "",
	},
	openAIKey: { source: secretHandle("ai_openai_api_key"), defaultValue: "" },

	anthropicKeyOption: {
		source: gitConfigKey(GitAIConfigKey.AnthropicKeyOption),
		defaultValue: KeyOption.GitButler,
	},
	anthropicModelName: {
		source: gitConfigKey(GitAIConfigKey.AnthropicModelName),
		defaultValue: "claude-3-5-sonnet-20240620",
	},
	anthropicKey: { source: secretHandle("ai_anthropic_api_key"), defaultValue: "" },

	diffLengthLimit: {
		source: gitConfigKey(GitAIConfigKey.DiffLengthLimit),
		defaultValue: 10000,
		transform: {
			fromSaved: (v: string | undefined) => (v ? parseInt(v, 10) : 10000),
			toSave: (v: number) => v.toString(),
		},
	},

	ollamaEndpoint: { source: gitConfigKey(GitAIConfigKey.OllamaEndpoint), defaultValue: "" },
	ollamaModelName: { source: gitConfigKey(GitAIConfigKey.OllamaModelName), defaultValue: "" },

	lmStudioEndpoint: { source: gitConfigKey(GitAIConfigKey.LMStudioEndpoint), defaultValue: "" },
	lmStudioModelName: { source: gitConfigKey(GitAIConfigKey.LMStudioModelName), defaultValue: "" },

	openRouterKey: { source: secretHandle("ai_openrouter_api_key"), defaultValue: "" },
	openRouterModelName: {
		source: gitConfigKey(GitAIConfigKey.OpenRouterModelName),
		defaultValue: "",
	},

	disableAutoUpdateChecks: {
		source: persistedGlobal(fModeEnabled as any),
		defaultValue: false,
	},

	branchPlacementLeftmost: {
		source: persistedGlobal(stagingBehaviorFeature as any),
		defaultValue: "all",
	},
	autoSelectBranchName: {
		source: persistedGlobal(autoSelectBranchNameFeature as any),
		defaultValue: false,
	},
	autoSelectBranchCreation: {
		source: persistedGlobal(autoSelectBranchCreationFeature as any),
		defaultValue: false,
	},
	stagingBehavior: {
		source: persistedGlobal(stagingBehaviorFeature as any),
		defaultValue: "all",
	},
	fModeEnabled: { source: persistedGlobal(fModeEnabled as any), defaultValue: true },
};

const PROJECT_FIELDS: Record<string, FieldDefinition> = {
	forcePushProtection: {
		source: projectField("force_push_protection"),
		defaultValue: false,
	},
	omitCertificateCheck: {
		source: projectField("omit_certificate_check"),
		defaultValue: false,
	},
	projectAiGenEnabled: {
		source: persistedProject(projectAiGenEnabled, "projectAiGenEnabled"),
		defaultValue: true,
	},
	projectAiExperimentalEnabled: {
		source: persistedProject(projectAiExperimentalFeaturesEnabled, "projectAiExperimentalEnabled"),
		defaultValue: false,
	},
	signCommits: {
		source: { type: "gitConfig", key: "gitbutler.commitSigning" },
		defaultValue: false,
		transform: {
			fromSaved: (v: string | undefined) => v === "1" || v === "true",
			toSave: (v: boolean) => (v ? "1" : "0"),
		},
	},
	signingKey: {
		source: { type: "gitConfig", key: "gitbutler.signingKey" },
		defaultValue: "",
	},
	signingFormat: {
		source: { type: "gitConfig", key: "gitbutler.signingFormat" },
		defaultValue: "",
	},
	gpgProgram: {
		source: { type: "gitConfig", key: "gitbutler.gpgProgram" },
		defaultValue: "",
	},
	gpgSshProgram: {
		source: { type: "gitConfig", key: "gitbutler.gpgSshProgram" },
		defaultValue: "",
	},
};

function getByPath(obj: any, path: string): any {
	return path.split(".").reduce((acc, part) => acc?.[part], obj);
}

function setByPath(obj: any, path: string, value: any): any {
	const parts = path.split(".");
	const result = { ...obj };
	let current = result;
	for (let i = 0; i < parts.length - 1; i++) {
		current[parts[i]] = { ...(current[parts[i]] || {}) };
		current = current[parts[i]];
	}
	current[parts[parts.length - 1]] = value;
	return result;
}

type AppliedWrite =
	| { type: "uiState"; key: keyof GlobalUiState; oldValue: any }
	| { type: "appSettings"; group: string; oldValue: any }
	| { type: "gitConfig"; key: string; oldValue: string }
	| { type: "secret"; handle: string; oldValue: string | undefined }
	| { type: "persistedGlobal"; store: ReturnType<typeof persisted<any>>; oldValue: any }
	| { type: "project"; path: string; oldValue: any }
	| { type: "gbConfig"; key: string; oldValue: any }
	| { type: "persistedProject"; store: ProjectPersisted<any>; oldValue: any };

type FieldChanges = Map<string, { oldValue: any; newValue: any }>;

export class GeneralSettingsDraftStore {
	private uiState: UiState;
	private settingsService: SettingsService;
	private gitConfigService: GitConfigService;
	private secretsService: SecretsService;
	private updaterService: UpdaterService;

	saved = $state<Record<string, any>>({});
	draft = $state<Record<string, any>>({});
	loading = $state(false);
	saving = $state(false);
	loaded = $state(false);

	constructor() {
		this.uiState = inject(UI_STATE);
		this.settingsService = inject(SETTINGS_SERVICE);
		this.gitConfigService = inject(GIT_CONFIG_SERVICE);
		this.secretsService = inject(SECRET_SERVICE);
		this.updaterService = inject(UPDATER_SERVICE);
	}

	get isDirty(): boolean {
		for (const key of Object.keys(GENERAL_FIELDS)) {
			if (JSON.stringify(this.saved[key]) !== JSON.stringify(this.draft[key])) {
				return true;
			}
		}
		return false;
	}

	getField(key: string): any {
		const def = GENERAL_FIELDS[key];
		if (!def) throw new Error(`Unknown field: ${key}`);
		return this.draft[key] ?? def.defaultValue;
	}

	setField(key: string, value: any): void {
		const def = GENERAL_FIELDS[key];
		if (!def) throw new Error(`Unknown field: ${key}`);
		this.draft[key] = value;
	}

	markFieldSaved(key: string): void {
		const def = GENERAL_FIELDS[key];
		if (!def) throw new Error(`Unknown field: ${key}`);
		this.saved[key] = JSON.parse(JSON.stringify(this.draft[key]));
	}

	async load(): Promise<void> {
		this.loading = true;
		try {
			const savedValues: Record<string, any> = {};
			const draftValues: Record<string, any> = {};

			for (const [key, def] of Object.entries(GENERAL_FIELDS)) {
				const value = await this.loadField(def);
				savedValues[key] = value;
				draftValues[key] = JSON.parse(JSON.stringify(value ?? def.defaultValue));
			}

			this.saved = savedValues;
			this.draft = draftValues;
			this.loaded = true;
		} catch (err) {
			showError("Failed to load settings", err);
		} finally {
			this.loading = false;
		}
	}

	private async loadField(def: FieldDefinition): Promise<any> {
		const source = def.source;
		let value: any;

		switch (source.type) {
			case "uiState":
				value = this.uiState.global[source.key].current;
				break;
			case "appSettings":
				{
					const appSettings = await this.settingsService.fetchAppSettings();
					value = getByPath(appSettings, source.path);
				}
				break;
			case "gitConfig":
				value = await this.gitConfigService.get(source.key);
				break;
			case "secret":
				value = await this.secretsService.get(source.handle);
				break;
			case "persistedGlobal":
				value = source.store;
				{
					let v: any;
					source.store.subscribe((val: any) => (v = val))();
					value = v;
				}
				break;
			default:
				value = def.defaultValue;
		}

		if (def.transform?.fromSaved) {
			value = def.transform.fromSaved(value);
		}

		return value ?? def.defaultValue;
	}

	async save(): Promise<boolean> {
		if (!this.isDirty) return true;

		this.saving = true;
		const changes: FieldChanges = new Map();
		const applied: AppliedWrite[] = [];

		try {
			for (const key of Object.keys(GENERAL_FIELDS)) {
				const oldValue = this.saved[key];
				const newValue = this.draft[key];
				if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
					changes.set(key, { oldValue, newValue });
				}
			}

			const uiStateUpdates: Array<{ key: keyof GlobalUiState; value: any; oldValue: any }> = [];
			const appSettingsUpdates: Record<string, any> = {};
			const appSettingsOldValues: Record<string, any> = {};
			const gitConfigUpdates: Array<{ key: string; value: string; oldValue: string }> = [];
			const secretUpdates: Array<{ handle: string; value: string; oldValue: string | undefined }> = [];
			const persistedUpdates: Array<{ store: ReturnType<typeof persisted<any>>; value: any; oldValue: any }> = [];

			for (const [key, { newValue, oldValue }] of changes.entries()) {
				const def = GENERAL_FIELDS[key];
				const source = def.source;
				let saveValue = newValue;
				if (def.transform?.toSave) {
					saveValue = def.transform.toSave(newValue);
				}

				switch (source.type) {
					case "uiState":
						uiStateUpdates.push({ key: source.key, value: saveValue, oldValue });
						break;
					case "appSettings":
						appSettingsOldValues[source.path] = oldValue;
						Object.assign(appSettingsUpdates, setByPath(appSettingsUpdates, source.path, saveValue));
						break;
					case "gitConfig":
						{
							const currentVal = await this.gitConfigService.get(source.key);
							gitConfigUpdates.push({ key: source.key, value: String(saveValue ?? ""), oldValue: currentVal ?? "" });
						}
						break;
					case "secret":
						{
							const currentVal = await this.secretsService.get(source.handle);
							secretUpdates.push({ handle: source.handle, value: String(saveValue ?? ""), oldValue: currentVal ?? undefined });
						}
						break;
					case "persistedGlobal":
						{
							let v: any;
							source.store.subscribe((val: any) => (v = val))();
							persistedUpdates.push({ store: source.store, value: saveValue, oldValue: v });
						}
						break;
				}
			}

			for (const { key, value, oldValue } of uiStateUpdates) {
				await this.uiState.global[key].set(value);
				applied.push({ type: "uiState", key, oldValue });
			}

			if (Object.keys(appSettingsUpdates).length > 0) {
				const groups = ["fetch", "reviews", "featureFlags", "irc", "telemetry"] as const;
				for (const group of groups) {
					if (appSettingsUpdates[group]) {
						const oldGroup = appSettingsOldValues[`${group}.`]
							? Object.fromEntries(
									Object.entries(appSettingsOldValues).filter(([k]) => k.startsWith(`${group}.`)),
								)
							: undefined;
						switch (group) {
							case "fetch":
								await this.settingsService.updateFetch(appSettingsUpdates.fetch as any);
								break;
							case "reviews":
								await this.settingsService.updateReviews(appSettingsUpdates.reviews as any);
								break;
							case "featureFlags":
								await this.settingsService.updateFeatureFlags(appSettingsUpdates.featureFlags as any);
								break;
							case "irc":
								await this.settingsService.updateIrc(appSettingsUpdates.irc as any);
								break;
							case "telemetry":
								await this.settingsService.updateTelemetry(appSettingsUpdates.telemetry as any);
								break;
						}
						applied.push({ type: "appSettings", group, oldValue: oldGroup });
					}
				}
			}

			for (const { key, value, oldValue } of gitConfigUpdates) {
				await this.gitConfigService.set(key, value);
				applied.push({ type: "gitConfig", key, oldValue });
			}
			this.gitConfigService.invalidateGitConfig();

			for (const { handle, value, oldValue } of secretUpdates) {
				if (value) {
					await this.secretsService.set(handle, value);
				} else {
					await this.secretsService.delete(handle);
				}
				applied.push({ type: "secret", handle, oldValue });
			}

			for (const { store, value, oldValue } of persistedUpdates) {
				store.set(value);
				applied.push({ type: "persistedGlobal", store, oldValue });
			}

			for (const [key, { newValue }] of changes.entries()) {
				this.saved[key] = JSON.parse(JSON.stringify(newValue));
			}

			return true;
		} catch (err) {
			await this.rollbackApplied(applied);
			for (const [key, { oldValue }] of changes.entries()) {
				this.draft[key] = JSON.parse(JSON.stringify(oldValue));
			}
			showError("Failed to save settings", err);
			return false;
		} finally {
			this.saving = false;
		}
	}

	private async rollbackApplied(applied: AppliedWrite[]): Promise<void> {
		const errors: any[] = [];
		for (let i = applied.length - 1; i >= 0; i--) {
			const write = applied[i];
			try {
				switch (write.type) {
					case "uiState":
						await this.uiState.global[write.key].set(write.oldValue);
						break;
					case "appSettings":
						break;
					case "gitConfig":
						await this.gitConfigService.set(write.key, write.oldValue);
						break;
					case "secret":
						if (write.oldValue) {
							await this.secretsService.set(write.handle, write.oldValue);
						} else {
							await this.secretsService.delete(write.handle);
						}
						break;
					case "persistedGlobal":
						write.store.set(write.oldValue);
						break;
				}
			} catch (rollbackErr) {
				errors.push(rollbackErr);
			}
		}
		if (errors.length > 0) {
			console.error("Errors during settings rollback:", errors);
		}
		this.gitConfigService.invalidateGitConfig();
		await this.reloadFromSources();
	}

	private async reloadFromSources(): Promise<void> {
		try {
			const savedValues: Record<string, any> = {};
			for (const [key, def] of Object.entries(GENERAL_FIELDS)) {
				const value = await this.loadField(def);
				savedValues[key] = value;
			}
			this.saved = savedValues;
			for (const key of Object.keys(GENERAL_FIELDS)) {
				this.draft[key] = JSON.parse(JSON.stringify(savedValues[key]));
			}
		} catch (reloadErr) {
			console.error("Failed to reload settings after rollback:", reloadErr);
		}
	}

	cancel(): void {
		for (const key of Object.keys(GENERAL_FIELDS)) {
			this.draft[key] = JSON.parse(JSON.stringify(this.saved[key]));
		}
		this.syncUiStateToSaved();
	}

	rollback(): void {
		this.cancel();
	}

	private syncUiStateToSaved(): void {
		for (const [key, def] of Object.entries(GENERAL_FIELDS)) {
			if (def.source.type === "uiState") {
				const savedValue = this.saved[key];
				if (savedValue !== undefined) {
					this.uiState.global[def.source.key as keyof GlobalUiState].set(savedValue);
				}
			}
		}
	}
}

export class ProjectSettingsDraftStore {
	private projectsService: ProjectsService;
	private gitConfigService: GitConfigService;

	private projectId: string = "";
	saved = $state<Record<string, any>>({});
	draft = $state<Record<string, any>>({});
	loading = $state(false);
	saving = $state(false);
	loaded = $state(false);

	private persistedStores: Record<string, ProjectPersisted<any>> = {};

	constructor() {
		this.projectsService = inject(PROJECTS_SERVICE);
		this.gitConfigService = inject(GIT_CONFIG_SERVICE);
	}

	setProjectId(projectId: string): void {
		this.projectId = projectId;
		this.persistedStores = {};
		for (const [key, def] of Object.entries(PROJECT_FIELDS)) {
			if (def.source.type === "persistedProject") {
				this.persistedStores[key] = def.source.factory(projectId);
			}
		}
	}

	get isDirty(): boolean {
		for (const key of Object.keys(PROJECT_FIELDS)) {
			if (JSON.stringify(this.saved[key]) !== JSON.stringify(this.draft[key])) {
				return true;
			}
		}
		return false;
	}

	getField(key: string): any {
		const def = PROJECT_FIELDS[key];
		if (!def) throw new Error(`Unknown field: ${key}`);
		return this.draft[key] ?? def.defaultValue;
	}

	setField(key: string, value: any): void {
		const def = PROJECT_FIELDS[key];
		if (!def) throw new Error(`Unknown field: ${key}`);
		this.draft[key] = value;
	}

	markFieldSaved(key: string): void {
		const def = PROJECT_FIELDS[key];
		if (!def) throw new Error(`Unknown field: ${key}`);
		this.saved[key] = JSON.parse(JSON.stringify(this.draft[key]));
	}

	async load(): Promise<void> {
		if (!this.projectId) throw new Error("Project ID not set");

		this.loading = true;
		try {
			const savedValues: Record<string, any> = {};
			const draftValues: Record<string, any> = {};

			for (const [key, def] of Object.entries(PROJECT_FIELDS)) {
				const value = await this.loadField(def);
				savedValues[key] = value;
				draftValues[key] = JSON.parse(JSON.stringify(value ?? def.defaultValue));
			}

			this.saved = savedValues;
			this.draft = draftValues;
			this.loaded = true;
		} catch (err) {
			showError("Failed to load project settings", err);
		} finally {
			this.loading = false;
		}
	}

	private async loadField(def: FieldDefinition): Promise<any> {
		const source = def.source;
		let value: any;

		switch (source.type) {
			case "project":
				{
					const project = await this.projectsService.getProject(this.projectId).unwrap();
					value = getByPath(project, source.path);
				}
				break;
			case "persistedProject":
				{
					const store = this.persistedStores[source.projectKey];
					let v: any;
					store.subscribe((val: any) => (v = val))();
					value = v;
				}
				break;
			case "gitConfig":
				{
					const gbConfig = await this.gitConfigService.getGbConfig(this.projectId);
					const key = source.key.replace("gitbutler.", "");
					value = (gbConfig as any)[key];
				}
				break;
			default:
				value = def.defaultValue;
		}

		if (def.transform?.fromSaved) {
			value = def.transform.fromSaved(value);
		}

		return value ?? def.defaultValue;
	}

	async save(): Promise<boolean> {
		if (!this.isDirty) return true;
		if (!this.projectId) throw new Error("Project ID not set");

		this.saving = true;
		const changes: FieldChanges = new Map();
		const applied: AppliedWrite[] = [];

		try {
			for (const key of Object.keys(PROJECT_FIELDS)) {
				const oldValue = this.saved[key];
				const newValue = this.draft[key];
				if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
					changes.set(key, { oldValue, newValue });
				}
			}

			let projectUpdates: any = null;
			let originalProject: any = null;
			const gbConfigUpdates: any = {};
			const gbConfigOldValues: any = {};
			const persistedUpdates: Array<{ store: ProjectPersisted<any>; value: any; oldValue: any }> = [];

			for (const [key, { newValue, oldValue }] of changes.entries()) {
				const def = PROJECT_FIELDS[key];
				const source = def.source;
				let saveValue = newValue;
				if (def.transform?.toSave) {
					saveValue = def.transform.toSave(newValue);
				}

				switch (source.type) {
					case "project":
						if (!projectUpdates) {
							originalProject = await this.projectsService
								.getProject(this.projectId)
								.unwrap();
							projectUpdates = { ...originalProject };
						}
						projectUpdates = setByPath(projectUpdates, source.path, saveValue);
						break;
					case "gitConfig":
						{
							const gbKey = source.key.replace("gitbutler.", "");
							gbConfigOldValues[gbKey] = oldValue;
							gbConfigUpdates[gbKey] = saveValue;
						}
						break;
					case "persistedProject":
						{
							const store = this.persistedStores[source.projectKey];
							let v: any;
							store.subscribe((val: any) => (v = val))();
							persistedUpdates.push({ store, value: saveValue, oldValue: v });
						}
						break;
				}
			}

			if (projectUpdates) {
				await this.projectsService.updateProject(projectUpdates);
				applied.push({ type: "project", path: "", oldValue: originalProject });
			}

			if (Object.keys(gbConfigUpdates).length > 0) {
				await this.gitConfigService.setGbConfig(this.projectId, gbConfigUpdates);
				for (const [gbKey, oldValue] of Object.entries(gbConfigOldValues)) {
					applied.push({ type: "gbConfig", key: gbKey, oldValue });
				}
			}

			for (const { store, value, oldValue } of persistedUpdates) {
				store.set(value);
				applied.push({ type: "persistedProject", store, oldValue });
			}

			for (const [key, { newValue }] of changes.entries()) {
				this.saved[key] = JSON.parse(JSON.stringify(newValue));
			}

			return true;
		} catch (err) {
			await this.rollbackApplied(applied);
			for (const [key, { oldValue }] of changes.entries()) {
				this.draft[key] = JSON.parse(JSON.stringify(oldValue));
			}
			showError("Failed to save project settings", err);
			return false;
		} finally {
			this.saving = false;
		}
	}

	private async rollbackApplied(applied: AppliedWrite[]): Promise<void> {
		const errors: any[] = [];
		for (let i = applied.length - 1; i >= 0; i--) {
			const write = applied[i];
			try {
				switch (write.type) {
					case "project":
						if (write.oldValue) {
							await this.projectsService.updateProject(write.oldValue);
						}
						break;
					case "gbConfig":
						{
							const rollbackUpdates: any = {};
							rollbackUpdates[write.key] = write.oldValue;
							await this.gitConfigService.setGbConfig(this.projectId, rollbackUpdates);
						}
						break;
					case "persistedProject":
						write.store.set(write.oldValue);
						break;
				}
			} catch (rollbackErr) {
				errors.push(rollbackErr);
			}
		}
		if (errors.length > 0) {
			console.error("Errors during project settings rollback:", errors);
		}
		await this.reloadFromSources();
	}

	private async reloadFromSources(): Promise<void> {
		try {
			const savedValues: Record<string, any> = {};
			for (const [key, def] of Object.entries(PROJECT_FIELDS)) {
				const value = await this.loadField(def);
				savedValues[key] = value;
			}
			this.saved = savedValues;
			for (const key of Object.keys(PROJECT_FIELDS)) {
				this.draft[key] = JSON.parse(JSON.stringify(savedValues[key]));
			}
		} catch (reloadErr) {
			console.error("Failed to reload project settings after rollback:", reloadErr);
		}
	}

	cancel(): void {
		for (const key of Object.keys(PROJECT_FIELDS)) {
			this.draft[key] = JSON.parse(JSON.stringify(this.saved[key]));
		}
		this.syncPersistedToSaved();
	}

	rollback(): void {
		this.cancel();
	}

	private syncPersistedToSaved(): void {
		for (const [key, def] of Object.entries(PROJECT_FIELDS)) {
			if (def.source.type === "persistedProject") {
				const savedValue = this.saved[key];
				if (savedValue !== undefined) {
					const store = this.persistedStores[def.source.projectKey];
					if (store) {
						store.set(savedValue);
					}
				}
			}
		}
	}
}

export function useGeneralSettingsDraft(): GeneralSettingsDraftStore {
	return inject(GENERAL_SETTINGS_DRAFT);
}

export function useProjectSettingsDraft(): ProjectSettingsDraftStore {
	return inject(PROJECT_SETTINGS_DRAFT);
}

export function useOptionalGeneralSettingsDraft(): GeneralSettingsDraftStore | null {
	return injectOptional(GENERAL_SETTINGS_DRAFT, null);
}

export function useOptionalProjectSettingsDraft(): ProjectSettingsDraftStore | null {
	return injectOptional(PROJECT_SETTINGS_DRAFT, null);
}

export type DraftFieldBinding<T> = {
	get current(): T;
	set(value: T): void;
};

export function bindGeneralField<T>(
	fieldName: string,
	getOriginal: () => T,
	setOriginal: (value: T) => void
): DraftFieldBinding<T> {
	const draft = useOptionalGeneralSettingsDraft();
	if (draft) {
		return {
			get current() {
				return draft.getField(fieldName) as T;
			},
			set(value: T) {
				draft.setField(fieldName, value);
			},
		};
	}
	return {
		get current() {
			return getOriginal();
		},
		set(value: T) {
			setOriginal(value);
		},
	};
}

export function bindProjectField<T>(
	fieldName: string,
	getOriginal: () => T,
	setOriginal: (value: T) => void,
): DraftFieldBinding<T> {
	const draft = useOptionalProjectSettingsDraft();
	if (draft) {
		return {
			get current() {
				return draft.getField(fieldName) as T;
			},
			set(value: T) {
				draft.setField(fieldName, value);
			},
		};
	}
	return {
		get current() {
			return getOriginal();
		},
		set(value: T) {
			setOriginal(value);
		},
	};
}
