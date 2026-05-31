export type EnvironmentName = "development" | "production" | "testing" | "preview" | "nightly";

export type ForgeProviderConfig = {
	github: {
		enabled: boolean;
		apiBaseUrl: string;
		defaultDomain: string;
	};
	gitlab: {
		enabled: boolean;
		apiBaseUrl: string;
		defaultDomain: string;
		subDomain: string;
	};
	bitbucket: {
		enabled: boolean;
		defaultDomain: string;
	};
	azure: {
		enabled: boolean;
		defaultDomain: string;
	};
};

export type AnalyticsConfig = {
	posthog: {
		enabled: boolean;
		apiKey: string;
		apiHost: string;
		autoCapture: boolean;
		sessionRecording: boolean;
		capturePerformance: boolean;
	};
	sentry: {
		enabled: boolean;
		dsn: string;
		environment: string;
		tracesSampleRate: number;
	};
};

export type ApiConfig = {
	baseUrl: string;
	butlerApiBaseUrl: string;
	butlerHost: string;
	butlerPort: string;
	chainApi: string;
	cloudBaseUrl: string;
};

export type UpdateConfig = {
	enabled: boolean;
	checkIntervalMs: number;
	autoDownload: boolean;
};

export type FeatureFlags = {
	autoSelectBranchName: boolean;
	autoSelectBranchCreation: boolean;
	rewrapCommitMessage: boolean;
	fModeEnabled: boolean;
	newlineOnEnter: boolean;
	cv3: boolean;
	irc: boolean;
};

export type PersistenceDefaults = {
	stagingBehavior: "all" | "selection" | "none";
	disableAutoUpdateChecks: boolean;
	theme: "system" | "light" | "dark";
	telemetryEnabled: boolean;
	errorReportingEnabled: boolean;
	nonAnonMetricsEnabled: boolean;
};

export type EnvironmentProfile = {
	name: EnvironmentName;
	mode: "development" | "production";
	isDevelopment: boolean;
	isTesting: boolean;
	isPreview: boolean;
	isProduction: boolean;
	isE2E: boolean;
	isCI: boolean;
	buildTarget: "tauri" | "web";
	flatpakId: string | undefined;
	api: ApiConfig;
	analytics: AnalyticsConfig;
	updates: UpdateConfig;
	forge: ForgeProviderConfig;
	featureFlags: FeatureFlags;
	persistenceDefaults: PersistenceDefaults;
};

const SENTRY_DSN = "https://a35bbd6688a3a8f76e4956c6871f414a@o4504644069687296.ingest.sentry.io/4505976067129344";
const POSTHOG_API_HOST = "https://eu.posthog.com";

const GITHUB_DOMAIN = "github.com";
const GITLAB_DOMAIN = "gitlab.com";
const GITLAB_SUB_DOMAIN = "gitlab";
const BITBUCKET_DOMAIN = "bitbucket.org";
const AZURE_DOMAIN = "dev.azure.com";

const baseForgeConfig: ForgeProviderConfig = {
	github: {
		enabled: true,
		apiBaseUrl: "https://api.github.com",
		defaultDomain: GITHUB_DOMAIN,
	},
	gitlab: {
		enabled: true,
		apiBaseUrl: "https://gitlab.com/api/v4",
		defaultDomain: GITLAB_DOMAIN,
		subDomain: GITLAB_SUB_DOMAIN,
	},
	bitbucket: {
		enabled: true,
		defaultDomain: BITBUCKET_DOMAIN,
	},
	azure: {
		enabled: true,
		defaultDomain: AZURE_DOMAIN,
	},
};

const baseFeatureFlags: FeatureFlags = {
	autoSelectBranchName: false,
	autoSelectBranchCreation: false,
	rewrapCommitMessage: true,
	fModeEnabled: true,
	newlineOnEnter: false,
	cv3: false,
	irc: true,
};

const basePersistenceDefaults: PersistenceDefaults = {
	stagingBehavior: "all",
	disableAutoUpdateChecks: false,
	theme: "system",
	telemetryEnabled: true,
	errorReportingEnabled: true,
	nonAnonMetricsEnabled: false,
};

const developmentProfile: EnvironmentProfile = {
	name: "development",
	mode: "development",
	isDevelopment: true,
	isTesting: false,
	isPreview: false,
	isProduction: false,
	isE2E: false,
	isCI: false,
	buildTarget: "tauri",
	flatpakId: undefined,
	api: {
		baseUrl: "https://app.staging.gitbutler.com/",
		butlerApiBaseUrl: "",
		butlerHost: "localhost",
		butlerPort: "6978",
		chainApi: "https://data.staging.gitbutler.com/chain/",
		cloudBaseUrl: "https://cloud.staging.gitbutler.com/",
	},
	analytics: {
		posthog: {
			enabled: false,
			apiKey: "phc_t7VDC9pQELnYep9IiDTxrq2HLseY5wyT7pn0EpHM7rr",
			apiHost: POSTHOG_API_HOST,
			autoCapture: false,
			sessionRecording: false,
			capturePerformance: false,
		},
		sentry: {
			enabled: false,
			dsn: SENTRY_DSN,
			environment: "development",
			tracesSampleRate: 0,
		},
	},
	updates: {
		enabled: false,
		checkIntervalMs: 0,
		autoDownload: false,
	},
	forge: baseForgeConfig,
	featureFlags: {
		...baseFeatureFlags,
		cv3: true,
	},
	persistenceDefaults: basePersistenceDefaults,
};

const testingProfile: EnvironmentProfile = {
	name: "testing",
	mode: "development",
	isDevelopment: false,
	isTesting: true,
	isPreview: false,
	isProduction: false,
	isE2E: true,
	isCI: true,
	buildTarget: "tauri",
	flatpakId: undefined,
	api: {
		baseUrl: "https://test.app.gitbutler.com/",
		butlerApiBaseUrl: "",
		butlerHost: "localhost",
		butlerPort: "6978",
		chainApi: "https://data-test.gitbutler.com/chain/",
		cloudBaseUrl: "https://gitbutler.com/",
	},
	analytics: {
		posthog: {
			enabled: false,
			apiKey: "",
			apiHost: POSTHOG_API_HOST,
			autoCapture: false,
			sessionRecording: false,
			capturePerformance: false,
		},
		sentry: {
			enabled: false,
			dsn: SENTRY_DSN,
			environment: "testing",
			tracesSampleRate: 0,
		},
	},
	updates: {
		enabled: false,
		checkIntervalMs: 0,
		autoDownload: false,
	},
	forge: baseForgeConfig,
	featureFlags: baseFeatureFlags,
	persistenceDefaults: {
		...basePersistenceDefaults,
		telemetryEnabled: false,
		errorReportingEnabled: false,
	},
};

const previewProfile: EnvironmentProfile = {
	name: "preview",
	mode: "production",
	isDevelopment: false,
	isTesting: false,
	isPreview: true,
	isProduction: false,
	isE2E: false,
	isCI: false,
	buildTarget: "tauri",
	flatpakId: undefined,
	api: {
		baseUrl: "https://app.staging.gitbutler.com/",
		butlerApiBaseUrl: "",
		butlerHost: "localhost",
		butlerPort: "6978",
		chainApi: "https://data.staging.gitbutler.com/chain/",
		cloudBaseUrl: "https://cloud.staging.gitbutler.com/",
	},
	analytics: {
		posthog: {
			enabled: true,
			apiKey: "phc_t7VDC9pQELnYep9IiDTxrq2HLseY5wyT7pn0EpHM7rr",
			apiHost: POSTHOG_API_HOST,
			autoCapture: false,
			sessionRecording: false,
			capturePerformance: false,
		},
		sentry: {
			enabled: true,
			dsn: SENTRY_DSN,
			environment: "preview",
			tracesSampleRate: 0.1,
		},
	},
	updates: {
		enabled: true,
		checkIntervalMs: 3600000,
		autoDownload: true,
	},
	forge: baseForgeConfig,
	featureFlags: baseFeatureFlags,
	persistenceDefaults: basePersistenceDefaults,
};

const nightlyProfile: EnvironmentProfile = {
	name: "nightly",
	mode: "production",
	isDevelopment: false,
	isTesting: false,
	isPreview: false,
	isProduction: false,
	isE2E: false,
	isCI: false,
	buildTarget: "tauri",
	flatpakId: undefined,
	api: {
		baseUrl: "https://app.gitbutler.com/",
		butlerApiBaseUrl: "",
		butlerHost: "localhost",
		butlerPort: "6978",
		chainApi: "https://data.gitbutler.com/chain/",
		cloudBaseUrl: "https://gitbutler.com/",
	},
	analytics: {
		posthog: {
			enabled: true,
			apiKey: "phc_yJx46mXv6kA5KTuM2eEQ6IwNTgl5YW3feKV5gi7mfGG",
			apiHost: POSTHOG_API_HOST,
			autoCapture: false,
			sessionRecording: false,
			capturePerformance: false,
		},
		sentry: {
			enabled: true,
			dsn: SENTRY_DSN,
			environment: "nightly",
			tracesSampleRate: 0.1,
		},
	},
	updates: {
		enabled: true,
		checkIntervalMs: 3600000,
		autoDownload: true,
	},
	forge: baseForgeConfig,
	featureFlags: baseFeatureFlags,
	persistenceDefaults: basePersistenceDefaults,
};

const productionProfile: EnvironmentProfile = {
	name: "production",
	mode: "production",
	isDevelopment: false,
	isTesting: false,
	isPreview: false,
	isProduction: true,
	isE2E: false,
	isCI: false,
	buildTarget: "tauri",
	flatpakId: undefined,
	api: {
		baseUrl: "https://app.gitbutler.com/",
		butlerApiBaseUrl: "",
		butlerHost: "localhost",
		butlerPort: "6978",
		chainApi: "https://data.gitbutler.com/chain/",
		cloudBaseUrl: "https://gitbutler.com/",
	},
	analytics: {
		posthog: {
			enabled: true,
			apiKey: "phc_yJx46mXv6kA5KTuM2eEQ6IwNTgl5YW3feKV5gi7mfGG",
			apiHost: POSTHOG_API_HOST,
			autoCapture: false,
			sessionRecording: false,
			capturePerformance: false,
		},
		sentry: {
			enabled: true,
			dsn: SENTRY_DSN,
			environment: "production",
			tracesSampleRate: 0.01,
		},
	},
	updates: {
		enabled: true,
		checkIntervalMs: 21600000,
		autoDownload: true,
	},
	forge: baseForgeConfig,
	featureFlags: baseFeatureFlags,
	persistenceDefaults: basePersistenceDefaults,
};

export const ENVIRONMENT_PROFILES: Record<EnvironmentName, EnvironmentProfile> = {
	development: developmentProfile,
	testing: testingProfile,
	preview: previewProfile,
	nightly: nightlyProfile,
	production: productionProfile,
};
