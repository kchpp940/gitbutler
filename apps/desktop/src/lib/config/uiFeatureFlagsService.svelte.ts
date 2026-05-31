import { InjectionToken } from "@gitbutler/core/context";
import { persisted, persistWithExpiration } from "@gitbutler/shared/persisted";
import type { EnvironmentProfile, PersistenceDefaults } from "./environmentProfile";

export const UI_FEATURE_FLAGS = new InjectionToken<UIFeatureFlagsService>("UIFeatureFlagsService");

export type StagingBehavior = "all" | "selection" | "none";

export class UIFeatureFlagsService {
	readonly autoSelectBranchNameFeature;
	readonly autoSelectBranchCreationFeature;
	readonly rewrapCommitMessage;
	readonly stagingBehaviorFeature;
	readonly fModeEnabled;
	readonly newlineOnEnter;

	constructor(profile: EnvironmentProfile) {
		const flags = profile.featureFlags;
		const defaults = profile.persistenceDefaults;

		this.autoSelectBranchNameFeature = persisted(
			flags.autoSelectBranchName,
			"autoSelectBranchLaneContentsFeature",
		);
		this.autoSelectBranchCreationFeature = persisted(
			flags.autoSelectBranchCreation,
			"autoSelectBranchCreationFeature",
		);
		this.rewrapCommitMessage = persistWithExpiration(
			flags.rewrapCommitMessage,
			"rewrap-commit-msg",
			1440 * 30,
		);
		this.stagingBehaviorFeature = persisted<StagingBehavior>(
			defaults.stagingBehavior,
			"feature-staging-behavior",
		);
		this.fModeEnabled = persisted(flags.fModeEnabled, "f-mode");
		this.newlineOnEnter = persisted(flags.newlineOnEnter, "feature-newline-on-enter");
	}
}

export function getPersistenceDefaults(profile: EnvironmentProfile): PersistenceDefaults {
	return profile.persistenceDefaults;
}
