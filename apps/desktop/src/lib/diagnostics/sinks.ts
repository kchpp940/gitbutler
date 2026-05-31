import { subscribe, serializeForEnv } from "$lib/diagnostics/service";
import type { DiagnosticEvent } from "$lib/diagnostics/types";
import * as Sentry from "@sentry/sveltekit";
import { tauriLogErrorToFile } from "$lib/backend/tauri";
import type { PostHogWrapper } from "$lib/telemetry/posthog";

let registered = {
	console: false,
	file: false,
	sentry: false,
	posthog: false,
	initialized: false,
};

let posthogInstance: PostHogWrapper | undefined;

export function initDiagnosticSinks(posthog: PostHogWrapper): void {
	if (registered.initialized) return;
	registered.initialized = true;

	registerConsoleSink();
	registerFileSink();
	registerSentryDiagnosticSink();
	registerPostHogDiagnosticSink(posthog);
}

export function registerConsoleSink(): void {
	if (registered.console) return;
	registered.console = true;

	subscribe((event) => {
		if (event.ignored) return;
		if (!import.meta.env.DEV && (event.level === "debug" || event.level === "info")) return;

		const serialized = serializeForEnv(event);
		const consoleMethod =
			event.level === "error"
				? console.error
				: event.level === "warn"
					? console.warn
					: event.level === "info"
						? console.info
						: console.debug;
		const prefix = `[${event.source}]`;
		const extra: Record<string, unknown> = {};
		if (serialized.errorCode) extra.code = serialized.errorCode;
		if (Object.keys(serialized.context).length > 0) extra.context = serialized.context;
		if (serialized.stack) extra.stack = serialized.stack;

		if (Object.keys(extra).length > 0) {
			consoleMethod(prefix, event.message, extra);
		} else {
			consoleMethod(prefix, event.message);
		}

		if (event.silent) {
			console.warn("SilentError suppressed from Sentry/toast", event.raw);
		}
	});
}

export function registerFileSink(): void {
	if (registered.file) return;
	registered.file = true;

	subscribe((event) => {
		if (event.ignored) return;
		if (event.level !== "error" && event.level !== "warn") return;

		try {
			const serialized = serializeForEnv(event);
			tauriLogErrorToFile(JSON.stringify(serialized, null, 2));
		} catch {
		}
	});
}

export function registerSentryDiagnosticSink(): void {
	if (registered.sentry) return;
	registered.sentry = true;

	subscribe((event) => {
		if (event.ignored || event.silent) return;
		if (event.level !== "error" && event.level !== "warn") return;

		try {
			let err: Error;
			if (event.raw instanceof Error) {
				err = event.raw;
			} else {
				err = new Error(event.message);
				err.name = event.title;
				if (event.errorCode) {
					(err as Error & { code?: string }).code = event.errorCode;
				}
			}
			const tags = {
				source: event.source,
				error_code: event.errorCode ?? "",
				user_visible: event.userVisible ? "true" : "false",
			};
			const extra: Record<string, unknown> = {
				diagnostic_id: event.id,
				context: event.context,
				description: event.description,
			};
			Sentry.captureException(err, {
				mechanism: { type: "diagnostic", handled: false },
				tags: tags as any,
				extra: extra as any,
			});
		} catch {
		}
	});
}

export function registerPostHogDiagnosticSink(wrapper: PostHogWrapper): void {
	if (registered.posthog) return;
	registered.posthog = true;
	posthogInstance = wrapper;

	subscribe((event) => {
		if (event.ignored || event.silent || !event.userVisible) return;

		try {
			const ph = posthogInstance;
			if (!ph) return;

			if (event.source === "ui:toast") {
				if (event.level === "error") {
					ph.capture("diagnostic_toast_error", {
						diagnostic_id: event.id,
						error_title: event.title,
						error_message: event.message,
						error_code: event.errorCode,
						source: event.source,
					});
				} else if (event.level === "warn") {
					ph.capture("diagnostic_toast_warning", {
						diagnostic_id: event.id,
						warning_title: event.title,
						warning_message: event.message,
						source: event.source,
					});
				}
			} else if (event.level === "error") {
				ph.capture("diagnostic_error", {
					diagnostic_id: event.id,
					error_title: event.title,
					error_message: event.message,
					error_code: event.errorCode,
					source: event.source,
				});
			}
		} catch {
		}
	});
}

export function registerDefaultDiagnosticSinks(): void {
	registerConsoleSink();
	registerFileSink();
}

export function areDiagnosticSinksRegistered(): {
	console: boolean;
	file: boolean;
	sentry: boolean;
	posthog: boolean;
	initialized: boolean;
} {
	return { ...registered };
}

export function unregisterDiagnosticSinks(): void {
	registered = { console: false, file: false, sentry: false, posthog: false, initialized: false };
	posthogInstance = undefined;
}
