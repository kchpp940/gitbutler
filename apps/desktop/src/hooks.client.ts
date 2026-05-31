import { polyfillAbortSignalTimeout } from "$lib/polyfills/abortSignal";
import { fromUnknown, emitDiagnostic } from "$lib/diagnostics/service";
import { showErrorFromDiagnostic } from "$lib/error/showError";
import type { HandleClientError } from "@sveltejs/kit";

polyfillAbortSignalTimeout();

export function handleError({
	error,
	status,
}: {
	error: unknown;
	status: number;
}): ReturnType<HandleClientError> {
	if (status !== 404) {
		const event = fromUnknown("svelte:error", error, { context: { status } });
		emitDiagnostic(event);
		showErrorFromDiagnostic(event);
	}
	return {
		message: String(error),
	};
}

window.onunhandledrejection = (e: PromiseRejectionEvent) => {
	e.preventDefault();
	const event = fromUnknown("unhandled:rejection", e.reason, { skipToast: true });
	emitDiagnostic(event);
};
