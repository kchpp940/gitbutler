import type { AppSettings, GitConfigSettings } from "@gitbutler/but-sdk";
import type {
	CodeEditorSettings,
	TerminalSettings,
	AppTheme,
} from "$lib/state/uiState.svelte";
import type { ScrollbarVisilitySettings } from "@gitbutler/ui";
import type { ModelKind, OpenAIModelName, AnthropicModelName, UserPrompt } from "$lib/ai/types";
import type { KeyOption } from "$lib/ai/service";
import type { Project } from "$lib/project/project";
import type { ForgeName } from "$lib/forge/interface/forge";
import type { GithubAccountIdentifier, GitlabAccountIdentifier } from "@gitbutler/but-sdk";

export type AISettingsDraft = {
	modelKind?: ModelKind;
	openAIKeyOption?: KeyOption;
	openAIModelName?: OpenAIModelName;
	openAIKey?: string;
	openAICustomEndpoint?: string;
	anthropicKeyOption?: KeyOption;
	anthropicModelName?: AnthropicModelName;
	anthropicKey?: string;
	diffLengthLimit?: number;
	ollamaEndpoint?: string;
	ollamaModel?: string;
	lmStudioEndpoint?: string;
	lmStudioModel?: string;
	openRouterKey?: string;
	openRouterModel?: string;
};

export type GitSettingsDraft = {
	gitbutlerCommitter?: boolean;
	autoFetchIntervalMinutes?: number;
};

export type UIPreferencesDraft = {
	theme?: AppTheme;
	defaultCodeEditor?: CodeEditorSettings;
	defaultTerminal?: TerminalSettings;
	defaultFileListMode?: "tree" | "list";
	pathFirst?: boolean;
	allInOneDiff?: boolean;
	highlightDiffs?: boolean;
	svgAsImage?: boolean;
	syntaxThemeLight?: string;
	syntaxThemeDark?: string;
	tabSize?: number;
	wrapText?: boolean;
	diffFont?: string;
	diffLigatures?: boolean;
	inlineUnifiedDiffs?: boolean;
	strongContrast?: boolean;
	colorBlindFriendly?: boolean;
	scrollbarVisibilityState?: ScrollbarVisilitySettings;
	disableAutoChecks?: boolean;
	fModeEnabled?: boolean;
	zoom?: number;
	unassignedSidebarFolded?: boolean;
};

export type FeatureFlagsDraft = Partial<AppSettings["featureFlags"]>;
export type TelemetryDraft = Partial<AppSettings["telemetry"]>;
export type FetchSettingsDraft = Partial<AppSettings["fetch"]>;
export type ReviewsSettingsDraft = Partial<AppSettings["reviews"]>;
export type UISettingsDraft = Partial<AppSettings["ui"]>;
export type IrcSettingsDraft = Partial<AppSettings["irc"]>;

export type StagingBehavior = "all" | "selection" | "none";

export type LanesDraft = {
	branchPlacementLeftmost?: boolean;
	autoSelectBranchName?: boolean;
	autoSelectBranchCreation?: boolean;
	stagingBehavior?: StagingBehavior;
};

export type AIPromptsDraft = {
	commitUserPrompts?: UserPrompt[];
	branchUserPrompts?: UserPrompt[];
};

export type UserProfileDraft = {
	name?: string;
	picture?: File | undefined;
};

export type CommitSigningDraft = {
	signCommits?: boolean | null;
	signingFormat?: string | null;
	signingKey?: string | null;
	gpgProgram?: string | null;
	gpgSshProgram?: string | null;
};

export type ProjectSettingsDraft = {
	title?: string;
	description?: string;
	forcePushProtection?: boolean;
	omitCertificateCheck?: boolean;
	aiGenEnabled?: boolean;
	aiExperimentalFeaturesEnabled?: boolean;
	huskyHooksEnabled?: boolean;
	forgeOverride?: ForgeName | undefined;
	preferredForgeProvider?: "github" | "gitlab" | undefined;
	preferredForgeAccount?: GithubAccountIdentifier | GitlabAccountIdentifier | undefined;
	runCommitHooks?: boolean;
	signing?: CommitSigningDraft;
	gerritMode?: boolean;
	selectedCommitPromptId?: string;
	selectedBranchPromptId?: string;
};

type DeepPartial<T> = T extends object
	? {
			[K in keyof T]?: DeepPartial<T[K]>;
		}
	: T;

export type GlobalSettingsDraft = {
	appSettings: DeepPartial<AppSettings>;
	uiPreferences: UIPreferencesDraft;
	ai: AISettingsDraft;
	git: GitSettingsDraft;
	userProfile: UserProfileDraft;
	lanes: LanesDraft;
	aiPrompts: AIPromptsDraft;
};

export type DraftScope = "global" | "project";

export type DraftState<T> = {
	original: T;
	draft: T;
	isDirty: boolean;
};

export type GlobalDraftState = DraftState<GlobalSettingsDraft>;
export type ProjectDraftState = DraftState<ProjectSettingsDraft>;

export function deepEqual<T>(a: T, b: T): boolean {
	if (a === b) return true;
	if (a == null || b == null) return false;
	if (typeof a !== typeof b) return false;

	if (typeof a === "object") {
		if (Array.isArray(a) && Array.isArray(b)) {
			if (a.length !== b.length) return false;
			for (let i = 0; i < a.length; i++) {
				if (!deepEqual(a[i], b[i])) return false;
			}
			return true;
		}

		if (Array.isArray(a) || Array.isArray(b)) return false;

		const keysA = Object.keys(a as object);
		const keysB = Object.keys(b as object);
		if (keysA.length !== keysB.length) return false;

		for (const key of keysA) {
			if (!keysB.includes(key)) return false;
			if (
				!deepEqual(
					(a as Record<string, unknown>)[key],
					(b as Record<string, unknown>)[key],
				)
			)
				return false;
		}
		return true;
	}

	return false;
}

export function computeIsDirty<T extends object>(original: T, draft: T): boolean {
	return !deepEqual(original, draft);
}

export function createEmptyGlobalDraft(): GlobalSettingsDraft {
	return {
		appSettings: {},
		uiPreferences: {},
		ai: {},
		git: {},
		userProfile: {},
		lanes: {},
		aiPrompts: {},
	};
}

export function createEmptyProjectDraft(): ProjectSettingsDraft {
	return {};
}

export function mergeDraft<T extends object>(target: T, updates: Partial<T>): T {
	return { ...target, ...updates };
}

export type ChangedFields<T> = {
	[K in keyof T]?: T[K];
};

export function getChangedFields<T extends object>(
	original: T,
	draft: T,
): ChangedFields<T> {
	const changes: ChangedFields<T> = {};
	for (const key of Object.keys(draft) as Array<keyof T>) {
		if (!deepEqual(original[key], draft[key])) {
			changes[key] = draft[key];
		}
	}
	return changes;
}
