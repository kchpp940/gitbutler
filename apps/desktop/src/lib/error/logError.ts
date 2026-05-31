import { fromUnknown, emitDiagnostic } from "$lib/diagnostics/service";
import type { DiagnosticSource, DiagnosticContext } from "$lib/diagnostics/types";
import { showErrorFromDiagnostic } from "$lib/error/showError";

type LogErrorOptions = {
	skipToast?: boolean;
	source?: DiagnosticSource;
	context?: DiagnosticContext;
};

export function logError(error: unknown, options?: LogErrorOptions) {
	const source = options?.source ?? "svelte:error";
	const event = fromUnknown(source, error, {
		context: options?.context,
		skipToast: options?.skipToast,
	});

	if (event.ignored || event.silent) return;

	emitDiagnostic(event);

	if (!options?.skipToast) {
		showErrorFromDiagnostic(event);
	}
}
