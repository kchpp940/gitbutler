import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ENVIRONMENT_PROFILES } from "./environmentProfile";

describe("EnvironmentProfile", () => {
	it("should have all required environment profiles", () => {
		expect(ENVIRONMENT_PROFILES.development).toBeDefined();
		expect(ENVIRONMENT_PROFILES.production).toBeDefined();
		expect(ENVIRONMENT_PROFILES.testing).toBeDefined();
		expect(ENVIRONMENT_PROFILES.preview).toBeDefined();
		expect(ENVIRONMENT_PROFILES.nightly).toBeDefined();
	});

	it("should have correct mode for each environment", () => {
		expect(ENVIRONMENT_PROFILES.development.mode).toBe("development");
		expect(ENVIRONMENT_PROFILES.testing.mode).toBe("development");
		expect(ENVIRONMENT_PROFILES.preview.mode).toBe("production");
		expect(ENVIRONMENT_PROFILES.nightly.mode).toBe("production");
		expect(ENVIRONMENT_PROFILES.production.mode).toBe("production");
	});

	it("should have correct environment flags", () => {
		expect(ENVIRONMENT_PROFILES.development.isDevelopment).toBe(true);
		expect(ENVIRONMENT_PROFILES.development.isTesting).toBe(false);
		expect(ENVIRONMENT_PROFILES.development.isPreview).toBe(false);
		expect(ENVIRONMENT_PROFILES.development.isProduction).toBe(false);

		expect(ENVIRONMENT_PROFILES.testing.isTesting).toBe(true);
		expect(ENVIRONMENT_PROFILES.preview.isPreview).toBe(true);
		expect(ENVIRONMENT_PROFILES.production.isProduction).toBe(true);
	});

	it("should have API configuration for all environments", () => {
		Object.values(ENVIRONMENT_PROFILES).forEach((profile) => {
			expect(profile.api.baseUrl).toBeDefined();
			expect(profile.api.cloudBaseUrl).toBeDefined();
			expect(typeof profile.api.baseUrl).toBe("string");
			expect(profile.api.baseUrl.length).toBeGreaterThan(0);
		});
	});

	it("should have analytics configuration", () => {
		Object.values(ENVIRONMENT_PROFILES).forEach((profile) => {
			expect(profile.analytics.posthog).toBeDefined();
			expect(profile.analytics.sentry).toBeDefined();
			expect(typeof profile.analytics.posthog.enabled).toBe("boolean");
			expect(typeof profile.analytics.sentry.enabled).toBe("boolean");
		});
	});

	it("should have updates configuration", () => {
		Object.values(ENVIRONMENT_PROFILES).forEach((profile) => {
			expect(profile.updates.enabled).toBeDefined();
			expect(typeof profile.updates.checkIntervalMs).toBe("number");
			expect(profile.updates.checkIntervalMs).toBeGreaterThanOrEqual(0);
		});
	});

	it("should have forge provider configuration", () => {
		Object.values(ENVIRONMENT_PROFILES).forEach((profile) => {
			expect(profile.forge.github).toBeDefined();
			expect(profile.forge.gitlab).toBeDefined();
			expect(profile.forge.bitbucket).toBeDefined();
			expect(profile.forge.azure).toBeDefined();
			expect(profile.forge.github.enabled).toBe(true);
			expect(profile.forge.gitlab.enabled).toBe(true);
		});
	});

	it("should have feature flags configuration", () => {
		Object.values(ENVIRONMENT_PROFILES).forEach((profile) => {
			expect(profile.featureFlags).toBeDefined();
			expect(typeof profile.featureFlags.fModeEnabled).toBe("boolean");
			expect(typeof profile.featureFlags.rewrapCommitMessage).toBe("boolean");
		});
	});

	it("should have persistence defaults configuration", () => {
		Object.values(ENVIRONMENT_PROFILES).forEach((profile) => {
			expect(profile.persistenceDefaults).toBeDefined();
			expect(["all", "selection", "none"]).toContain(profile.persistenceDefaults.stagingBehavior);
			expect(typeof profile.persistenceDefaults.disableAutoUpdateChecks).toBe("boolean");
			expect(["system", "light", "dark"]).toContain(profile.persistenceDefaults.theme);
		});
	});

	it("should disable analytics in development and testing environments", () => {
		expect(ENVIRONMENT_PROFILES.development.analytics.posthog.enabled).toBe(false);
		expect(ENVIRONMENT_PROFILES.development.analytics.sentry.enabled).toBe(false);
		expect(ENVIRONMENT_PROFILES.testing.analytics.posthog.enabled).toBe(false);
		expect(ENVIRONMENT_PROFILES.testing.analytics.sentry.enabled).toBe(false);
	});

	it("should enable analytics in production, preview and nightly environments", () => {
		expect(ENVIRONMENT_PROFILES.preview.analytics.posthog.enabled).toBe(true);
		expect(ENVIRONMENT_PROFILES.preview.analytics.sentry.enabled).toBe(true);
		expect(ENVIRONMENT_PROFILES.nightly.analytics.posthog.enabled).toBe(true);
		expect(ENVIRONMENT_PROFILES.nightly.analytics.sentry.enabled).toBe(true);
		expect(ENVIRONMENT_PROFILES.production.analytics.posthog.enabled).toBe(true);
		expect(ENVIRONMENT_PROFILES.production.analytics.sentry.enabled).toBe(true);
	});

	it("should disable auto-updates in development and testing environments", () => {
		expect(ENVIRONMENT_PROFILES.development.updates.enabled).toBe(false);
		expect(ENVIRONMENT_PROFILES.development.updates.checkIntervalMs).toBe(0);
		expect(ENVIRONMENT_PROFILES.testing.updates.enabled).toBe(false);
		expect(ENVIRONMENT_PROFILES.testing.updates.checkIntervalMs).toBe(0);
	});

	it("should enable auto-updates in production, preview and nightly environments", () => {
		expect(ENVIRONMENT_PROFILES.preview.updates.enabled).toBe(true);
		expect(ENVIRONMENT_PROFILES.preview.updates.checkIntervalMs).toBeGreaterThan(0);
		expect(ENVIRONMENT_PROFILES.nightly.updates.enabled).toBe(true);
		expect(ENVIRONMENT_PROFILES.nightly.updates.checkIntervalMs).toBeGreaterThan(0);
		expect(ENVIRONMENT_PROFILES.production.updates.enabled).toBe(true);
		expect(ENVIRONMENT_PROFILES.production.updates.checkIntervalMs).toBeGreaterThan(0);
	});

	it("should have production-like API URLs for production and nightly environments", () => {
		expect(ENVIRONMENT_PROFILES.production.api.baseUrl).toBe("https://app.gitbutler.com/");
		expect(ENVIRONMENT_PROFILES.production.api.cloudBaseUrl).toBe("https://gitbutler.com/");
		expect(ENVIRONMENT_PROFILES.nightly.api.baseUrl).toBe("https://app.gitbutler.com/");
		expect(ENVIRONMENT_PROFILES.nightly.api.cloudBaseUrl).toBe("https://gitbutler.com/");
	});

	it("should have staging API URLs for development and preview environments", () => {
		expect(ENVIRONMENT_PROFILES.development.api.baseUrl).toBe("https://app.staging.gitbutler.com/");
		expect(ENVIRONMENT_PROFILES.development.api.cloudBaseUrl).toBe("https://cloud.staging.gitbutler.com/");
		expect(ENVIRONMENT_PROFILES.preview.api.baseUrl).toBe("https://app.staging.gitbutler.com/");
		expect(ENVIRONMENT_PROFILES.preview.api.cloudBaseUrl).toBe("https://cloud.staging.gitbutler.com/");
	});

	it("should have sentry traces sample rate within valid range", () => {
		Object.values(ENVIRONMENT_PROFILES).forEach((profile) => {
			expect(profile.analytics.sentry.tracesSampleRate).toBeGreaterThanOrEqual(0);
			expect(profile.analytics.sentry.tracesSampleRate).toBeLessThanOrEqual(1);
		});
	});
});
