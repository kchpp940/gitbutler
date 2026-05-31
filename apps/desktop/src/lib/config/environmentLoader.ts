import { InjectionToken } from "@gitbutler/core/context";
import { ENVIRONMENT_PROFILES, type EnvironmentName, type EnvironmentProfile } from "./environmentProfile";

export const ENVIRONMENT_PROFILE = new InjectionToken<EnvironmentProfile>("EnvironmentProfile");

class ConfigurationError extends Error {
	constructor(message: string) {
		super(`[Environment Configuration Error] ${message}`);
		this.name = "ConfigurationError";
	}
}

function validateRequiredString(value: string | undefined, fieldName: string): asserts value is string {
	if (value === undefined || value === null || value === "") {
		throw new ConfigurationError(`Missing required configuration: ${fieldName}`);
	}
}

function validateProfile(profile: EnvironmentProfile): void {
	const errors: string[] = [];

	try {
		validateRequiredString(profile.api.baseUrl, "api.baseUrl");
		validateRequiredString(profile.api.cloudBaseUrl, "api.cloudBaseUrl");
		validateRequiredString(profile.api.chainApi, "api.chainApi");
	} catch (e) {
		if (e instanceof ConfigurationError) {
			errors.push(e.message.replace("[Environment Configuration Error] ", ""));
		}
	}

	if (profile.analytics.posthog.enabled) {
		try {
			validateRequiredString(profile.analytics.posthog.apiKey, "analytics.posthog.apiKey");
			validateRequiredString(profile.analytics.posthog.apiHost, "analytics.posthog.apiHost");
		} catch (e) {
			if (e instanceof ConfigurationError) {
				errors.push(e.message.replace("[Environment Configuration Error] ", ""));
			}
		}
	}

	if (profile.analytics.sentry.enabled) {
		try {
			validateRequiredString(profile.analytics.sentry.dsn, "analytics.sentry.dsn");
			validateRequiredString(profile.analytics.sentry.environment, "analytics.sentry.environment");
		} catch (e) {
			if (e instanceof ConfigurationError) {
				errors.push(e.message.replace("[Environment Configuration Error] ", ""));
			}
		}
	}

	if (profile.updates.checkIntervalMs < 0) {
		errors.push("updates.checkIntervalMs must be non-negative");
	}

	if (profile.analytics.sentry.tracesSampleRate < 0 || profile.analytics.sentry.tracesSampleRate > 1) {
		errors.push("analytics.sentry.tracesSampleRate must be between 0 and 1");
	}

	if (profile.buildTarget !== "tauri" && profile.buildTarget !== "web") {
		errors.push("buildTarget must be 'tauri' or 'web'");
	}

	for (const [forgeName, forgeConf] of Object.entries(profile.forge)) {
		if (forgeConf.enabled) {
			if ("defaultDomain" in forgeConf && !forgeConf.defaultDomain) {
				errors.push(`forge.${forgeName}.defaultDomain is required when enabled`);
			}
		}
	}

	if (!["all", "selection", "none"].includes(profile.persistenceDefaults.stagingBehavior)) {
		errors.push("persistenceDefaults.stagingBehavior must be 'all', 'selection', or 'none'");
	}

	if (!["system", "light", "dark"].includes(profile.persistenceDefaults.theme)) {
		errors.push("persistenceDefaults.theme must be 'system', 'light', or 'dark'");
	}

	if (errors.length > 0) {
		throw new ConfigurationError(`Invalid configuration for environment '${profile.name}':\n  - ${errors.join("\n  - ")}`);
	}
}

function detectEnvironmentName(): EnvironmentName {
	const viteMode = import.meta.env.MODE;
	const publicTesting = import.meta.env.PUBLIC_TESTING;
	const publicNightly = import.meta.env.PUBLIC_NIGHTLY;
	const publicPreview = import.meta.env.PUBLIC_PREVIEW;

	if (publicTesting === "true" || viteMode === "test") {
		return "testing";
	}

	if (publicNightly === "true") {
		return "nightly";
	}

	if (publicPreview === "true" || viteMode === "preview") {
		return "preview";
	}

	if (viteMode === "production") {
		return "production";
	}

	return "development";
}

function applyRuntimeOverrides(profile: EnvironmentProfile): EnvironmentProfile {
	const overridden = { ...profile };

	const baseUrl = import.meta.env.PUBLIC_API_BASE_URL;
	if (baseUrl) {
		overridden.api = { ...overridden.api, baseUrl };
	}

	const cloudBaseUrl = import.meta.env.PUBLIC_CLOUD_BASE_URL;
	if (cloudBaseUrl) {
		overridden.api = { ...overridden.api, cloudBaseUrl };
	}

	const posthogApiKey = import.meta.env.PUBLIC_POSTHOG_API_KEY;
	if (posthogApiKey !== undefined) {
		overridden.analytics = {
			...overridden.analytics,
			posthog: {
				...overridden.analytics.posthog,
				apiKey: posthogApiKey,
				enabled: overridden.analytics.posthog.enabled && posthogApiKey !== "",
			},
		};
	}

	const sentryEnvironment = import.meta.env.PUBLIC_SENTRY_ENVIRONMENT;
	if (sentryEnvironment !== undefined) {
		overridden.analytics = {
			...overridden.analytics,
			sentry: {
				...overridden.analytics.sentry,
				environment: sentryEnvironment,
				enabled: overridden.analytics.sentry.enabled && sentryEnvironment !== "",
			},
		};
	}

	const butlerApiBaseUrl = import.meta.env.VITE_BUTLER_API_BASE_URL;
	if (butlerApiBaseUrl) {
		overridden.api = { ...overridden.api, butlerApiBaseUrl };
	}

	const butlerHost = import.meta.env.VITE_BUTLER_HOST;
	if (butlerHost) {
		overridden.api = { ...overridden.api, butlerHost };
	}

	const butlerPort = import.meta.env.VITE_BUTLER_PORT;
	if (butlerPort) {
		overridden.api = { ...overridden.api, butlerPort };
	}

	const viteE2E = import.meta.env.VITE_E2E;
	if (typeof viteE2E === "string") {
		overridden.isE2E = viteE2E === "true";
	}

	if (typeof import.meta.env.CI === "string") {
		overridden.isCI = import.meta.env.CI === "true";
	}

	const buildTarget = import.meta.env.VITE_BUILD_TARGET;
	if (buildTarget === "web" || buildTarget === "tauri") {
		overridden.buildTarget = buildTarget;
	}

	const flatpakId = import.meta.env.PUBLIC_FLATPAK_ID;
	if (flatpakId) {
		overridden.flatpakId = flatpakId;
	}

	return overridden;
}

let loadedProfile: EnvironmentProfile | null = null;
let initializationError: Error | null = null;

export function loadEnvironmentProfile(): EnvironmentProfile {
	if (initializationError) {
		throw initializationError;
	}

	if (loadedProfile) {
		return loadedProfile;
	}

	try {
		const envName = detectEnvironmentName();

		const baseProfile = ENVIRONMENT_PROFILES[envName];
		if (!baseProfile) {
			throw new ConfigurationError(`Unknown environment name: ${envName}`);
		}

		const profileWithOverrides = applyRuntimeOverrides(baseProfile);

		validateProfile(profileWithOverrides);

		loadedProfile = profileWithOverrides;

		if (loadedProfile.isDevelopment) {
			console.info(`[Environment] Loaded profile: ${loadedProfile.name}`, loadedProfile);
		}

		return loadedProfile;
	} catch (error) {
		initializationError = error instanceof Error ? error : new Error(String(error));

		console.error("Failed to load environment configuration:", initializationError);

		throw initializationError;
	}
}

export function getEnvironmentProfile(): EnvironmentProfile {
	if (!loadedProfile) {
		throw new ConfigurationError(
			"Environment profile not loaded. Call loadEnvironmentProfile() during application startup.",
		);
	}
	return loadedProfile;
}

export function isConfigurationLoaded(): boolean {
	return loadedProfile !== null;
}

export function getConfigurationError(): Error | null {
	return initializationError;
}

export function resetEnvironmentProfile(): void {
	loadedProfile = null;
	initializationError = null;
}
