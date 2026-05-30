import { initAnalyticsIfEnabled } from "$lib/analytics/analytics";
import createBackend from "$lib/backend";
import {
	STARTUP_DIAGNOSTICS_SERVICE,
	type DiagnosticResult,
} from "$lib/startupDiagnostics";
import { SettingsService } from "$lib/settings/appSettings";
import { EventContext } from "$lib/telemetry/eventContext";
import { PostHogWrapper } from "$lib/telemetry/posthog";
import lscache from "lscache";
import type { LayoutLoad } from "./$types";

// call on startup so we don't accumulate old items
lscache.flushExpired();

export const ssr = false;
export const prerender = false;
export const csr = true;

// eslint-disable-next-line
export const load: LayoutLoad = async () => {
	// Awaited and will block initial render, but it is necessary in order to respect the user
	// settings on telemetry.
	const backend = createBackend();

	const homeDir = await backend.homeDirectory();

	const eventContext = new EventContext();

	const settingsService = new SettingsService(backend);
	const appSettings = await settingsService.fetchAppSettings();

	const posthog = new PostHogWrapper(settingsService, backend, eventContext);
	initAnalyticsIfEnabled(appSettings, posthog);

	const diagnostics = STARTUP_DIAGNOSTICS_SERVICE;
	diagnostics.setBackend(backend);

	const isProduction = import.meta.env.PROD;
	const skipDevelopmentChecks = isProduction;

	let startupDiagnostics: DiagnosticResult | undefined;
	let startupDiagnosticsFailed = false;

	try {
		startupDiagnostics = await diagnostics.runAllChecks(
			20,
			9,
			skipDevelopmentChecks,
		);
		startupDiagnosticsFailed = diagnostics.hasBlockingFailures();
	} catch (diagnosticsError) {
		console.warn("Startup diagnostics failed to run:", diagnosticsError);
	}

	return {
		homeDir,
		backend,
		settingsService,
		appSettings,
		posthog,
		eventContext,
		startupDiagnostics,
		startupDiagnosticsFailed,
	};
};
