import { logErrorToFile } from "$lib/backend";
import { logError, setLogErrorToFile } from "$lib/error/logError";
import { STARTUP_DIAGNOSTICS_SERVICE } from "$lib/startupDiagnostics";
import { polyfillAbortSignalTimeout } from "$lib/polyfills/abortSignal";
import type { HandleClientError } from "@sveltejs/kit";

polyfillAbortSignalTimeout();

setLogErrorToFile(logErrorToFile);

function isStartupRelatedError(error: unknown): boolean {
	if (error instanceof Error) {
		const msg = error.message.toLowerCase();
		return (
			msg.includes("backend") ||
			msg.includes("connection refused") ||
			msg.includes("failed to fetch") ||
			msg.includes("network error") ||
			msg.includes("but") && msg.includes("not found") ||
			msg.includes("database") ||
			msg.includes("enoent")
		);
	}
	if (typeof error === "object" && error !== null && "message" in error) {
		const msg = String((error as { message: unknown }).message).toLowerCase();
		return (
			msg.includes("backend") ||
			msg.includes("connection refused") ||
			msg.includes("failed to fetch") ||
			msg.includes("network error")
		);
	}
	return false;
}

export function handleError({
	error,
	status,
}: {
	error: unknown;
	status: number;
}): ReturnType<HandleClientError> {
	const diagnostics = STARTUP_DIAGNOSTICS_SERVICE;

	if (diagnostics.isInStartupPhase() && status !== 404 && isStartupRelatedError(error)) {
		diagnostics.injectRuntimeError("Application Error", error, {
			category: "backend",
		});
		return { message: "A startup issue was detected. Please check the diagnostics panel." };
	}

	if (status !== 404) {
		logError(error);
	}
	return {
		message: String(error),
	};
}

window.onunhandledrejection = (e: PromiseRejectionEvent) => {
	e.preventDefault();

	const diagnostics = STARTUP_DIAGNOSTICS_SERVICE;

	if (diagnostics.isInStartupPhase() && isStartupRelatedError(e.reason)) {
		diagnostics.injectRuntimeError("Unhandled Promise Rejection", e.reason, {
			category: "backend",
		});
		return;
	}

	logError(e);
};
