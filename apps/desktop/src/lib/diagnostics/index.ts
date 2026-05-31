export type { DiagnosticEvent, DiagnosticSource, DiagnosticLevel, DiagnosticContext, SerializedDiagnostic } from "$lib/diagnostics/types";
export { serializeForEnv, isDiagnosticEvent } from "$lib/diagnostics/types";
export {
	fromUnknown,
	emitDiagnostic,
	captureAndEmit,
	isReduxError,
	subscribe,
	getRecentDiagnostics,
	getDiagnosticsBySource,
	getDiagnosticsByLevel,
	diagnosticEvents,
} from "$lib/diagnostics/service";
export type { ReduxErrorShape } from "$lib/diagnostics/service";
export {
	initDiagnosticSinks,
	registerDefaultDiagnosticSinks,
	registerConsoleSink,
	registerFileSink,
	registerSentryDiagnosticSink,
	registerPostHogDiagnosticSink,
	areDiagnosticSinksRegistered,
	unregisterDiagnosticSinks,
} from "$lib/diagnostics/sinks";
