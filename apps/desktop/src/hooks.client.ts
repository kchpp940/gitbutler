import { logErrorToFileFromProfile } from "$lib/backend";
import { loadEnvironmentProfile } from "$lib/config/environmentLoader";
import { initErrorHandling, logError } from "$lib/error/logError";
import { polyfillAbortSignalTimeout } from "$lib/polyfills/abortSignal";
import type { HandleClientError } from "@sveltejs/kit";

polyfillAbortSignalTimeout();

const profile = loadEnvironmentProfile();
initErrorHandling(profile, (error) => logErrorToFileFromProfile(profile, error));

export function handleError({
	error,
	status,
}: {
	error: unknown;
	status: number;
}): ReturnType<HandleClientError> {
	if (status !== 404) {
		logError(error);
	}
	return {
		message: String(error),
	};
}

window.onunhandledrejection = (e: PromiseRejectionEvent) => {
	e.preventDefault();
	logError(e);
};
