import { initSentry } from "$lib/analytics/sentry";
import { PostHogWrapper } from "$lib/telemetry/posthog";
import posthog from "posthog-js";
import type { AppSettings } from "@gitbutler/but-sdk";
import type { EnvironmentProfile } from "$lib/config/environmentProfile";

export async function initAnalyticsIfEnabled(
	appSettings: AppSettings,
	postHog: PostHogWrapper,
	profile: EnvironmentProfile,
	confirmedOverride?: boolean,
) {
	if (profile.isDevelopment || profile.isTesting || profile.isCI) {
		return;
	}

	const confirmed = confirmedOverride ?? appSettings.onboardingComplete;

	if (confirmed) {
		if (appSettings.telemetry.appErrorReportingEnabled && profile.analytics.sentry.enabled) {
			initSentry(profile);
		}
		if (appSettings.telemetry.appMetricsEnabled && profile.analytics.posthog.enabled) {
			await postHog.init();
		}
		if (appSettings.telemetry.appNonAnonMetricsEnabled) {
			posthog.capture("nonAnonMetricsEnabled");
		} else {
			posthog.capture("nonAnonMetricsDisabled");
		}
	}
}
