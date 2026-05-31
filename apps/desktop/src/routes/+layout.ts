import { initAnalyticsIfEnabled } from "$lib/analytics/analytics";
import { createBackendFromProfile } from "$lib/backend";
import { loadEnvironmentProfile } from "$lib/config/environmentLoader";
import { SettingsService } from "$lib/settings/appSettings";
import { EventContext } from "$lib/telemetry/eventContext";
import { PostHogWrapper } from "$lib/telemetry/posthog";
import lscache from "lscache";
import type { LayoutLoad } from "./$types";

lscache.flushExpired();

export const ssr = false;
export const prerender = false;
export const csr = true;

export const load: LayoutLoad = async () => {
	const environmentProfile = loadEnvironmentProfile();

	const backend = createBackendFromProfile(environmentProfile);

	const homeDir = await backend.homeDirectory();

	const eventContext = new EventContext();

	const settingsService = new SettingsService(backend);
	const appSettings = await settingsService.fetchAppSettings();

	const posthog = new PostHogWrapper(settingsService, backend, eventContext, environmentProfile);
	initAnalyticsIfEnabled(appSettings, posthog, environmentProfile);

	return {
		homeDir,
		backend,
		settingsService,
		appSettings,
		posthog,
		eventContext,
		environmentProfile,
	};
};
