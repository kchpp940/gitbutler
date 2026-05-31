import {
	createDiagnosticId,
	isDiagnosticEvent,
	serializeForEnv,
	type DiagnosticContext,
	type DiagnosticEvent,
	type DiagnosticLevel,
	type DiagnosticSource,
} from "$lib/diagnostics/types";
import type { Code } from "@gitbutler/but-sdk";
import { KNOWN_ERRORS } from "$lib/error/knownErrors";
import { SilentError } from "$lib/error/error";
import { isStr } from "@gitbutler/ui/utils/string";
import { isErrorlike } from "@gitbutler/ui/utils/typeguards";
import { writable } from "svelte/store";

const MAX_BUFFER_SIZE = import.meta.env.DEV ? 2000 : 500;

const E2E_MESSAGES_TO_IGNORE_DURING_E2E = [
	"Unable to autolaunch a dbus-daemon without a $DISPLAY for X11",
];
const E2E_MESSAGES_TO_IGNORE = [
	"undefined is not an object (evaluating '[callbackId, data]')",
];
const BUNDLING_ERROR_PREFIX = "undefined is not an object (evaluating 'first_child_getter.call')";
const GH_ORG_AUTH_ERROR = "GitHub Organizations OAuth Error";

interface DiagnosticBuffer {
	events: DiagnosticEvent[];
	subscribers: Set<(event: DiagnosticEvent) => void>;
}

const buffer: DiagnosticBuffer = {
	events: [],
	subscribers: new Set(),
};

export const diagnosticEvents = writable<DiagnosticEvent[]>([]);

export type ReduxErrorShape = { name?: string; message: string; code?: Code };

export function isReduxError(value: unknown): value is ReduxErrorShape {
	if (!value || typeof value !== "object") return false;
	const r = value as ReduxErrorShape;
	return (
		typeof r.message === "string" &&
		(r.name === undefined || typeof r.name === "string") &&
		(r.code === undefined || typeof r.code === "string")
	);
}

function isPromiseRejection(err: unknown): err is { reason: Error; message: string } {
	return (
		typeof err === "object" && err !== null && "reason" in err && typeof err.reason === "object"
	);
}

function isHttpError(err: unknown): err is { message: string; status: number } {
	return (
		typeof err === "object" &&
		err !== null &&
		"message" in err &&
		typeof err.message === "string" &&
		"status" in err &&
		typeof err.status === "number"
	);
}

function isReduxActionError(err: unknown): err is { type: string; payload: string; error: { message: string }; meta?: unknown } {
	return (
		typeof err === "object" &&
		err !== null &&
		"error" in err &&
		typeof err.error === "object" &&
		"meta" in err &&
		typeof err.meta === "object" &&
		"payload" in err &&
		typeof err.payload === "string" &&
		"type" in err &&
		typeof err.type === "string"
	);
}

function isBundlingError(message: string): boolean {
	return message.startsWith(BUNDLING_ERROR_PREFIX);
}

function getTitleFromCommonErrorMessage(errorMessage: string): string | undefined {
	if (errorMessage.startsWith("Although you appear to have the correct authorization credentials,")) {
		return GH_ORG_AUTH_ERROR;
	}
	return undefined;
}

export function fromUnknown(
	source: DiagnosticSource,
	error: unknown,
	options?: {
		title?: string;
		context?: DiagnosticContext;
		userVisible?: boolean;
		skipToast?: boolean;
		level?: DiagnosticLevel;
	},
): DiagnosticEvent {
	if (isDiagnosticEvent(error)) {
		return error;
	}

	if (error instanceof PromiseRejectionEvent) {
		error = error.reason;
	}

	const silent = error instanceof SilentError;
	let message = "Unknown error";
	let name: string | undefined;
	let code: Code | undefined;
	let description: string | undefined;
	let ignored = false;
	let stack: string | undefined;

	if (isStr(error)) {
		message = error;
	} else if (isReduxError(error)) {
		name = error.name;
		message = error.message;
		code = error.code;
		description = code ? KNOWN_ERRORS[code] : undefined;
	} else if (isPromiseRejection(error)) {
		name = "A promise had an unhandled exception.";
		message = String(error.reason);
		if (error.reason instanceof Error) {
			stack = error.reason.stack;
		}
	} else if (isReduxActionError(error)) {
		message = error.error?.message ? `${error.error.message}\n\n${error.payload}` : String(error.payload);
	} else if (isHttpError(error)) {
		message = error.message;
		if (error.status === 500 && error.message === "Load failed") {
			ignored = true;
		}
	} else if (isErrorlike(error)) {
		message = error.message;
		stack = "stack" in error && typeof error.stack === "string" ? error.stack : undefined;
		if ("code" in error && typeof error.code === "string") {
			code = error.code as unknown as Code;
		}
	} else if (typeof error === "object" && error !== null) {
		if ("message" in error && typeof (error as { message: unknown }).message === "string") {
			message = (error as { message: string }).message;
		}
		if ("code" in error && typeof (error as { code: unknown }).code === "string") {
			code = ((error as { code: string }).code) as unknown as Code;
		}
		if ("stack" in error && typeof (error as { stack: unknown }).stack === "string") {
			stack = (error as { stack: string }).stack;
		}
		if ("name" in error && typeof (error as { name: unknown }).name === "string") {
			name = (error as { name: string }).name;
		}
		if (code) {
			description = KNOWN_ERRORS[code];
		}
	} else {
		message = JSON.stringify(error, null, 2);
	}

	if (isBundlingError(message)) {
		ignored = true;
	}

	const commonTitle = getTitleFromCommonErrorMessage(message);
	const resolvedTitle = options?.title ?? name ?? commonTitle ?? "Error";

	let level: DiagnosticLevel = options?.level ?? "error";
	if (!options?.level && (code === "PreconditionFailed" || code === "Validation")) {
		level = "warn";
	}

	const event: DiagnosticEvent = {
		id: createDiagnosticId(),
		timestamp: Date.now(),
		level,
		source,
		message,
		title: resolvedTitle,
		errorCode: code,
		ignored,
		silent,
		description,
		context: options?.context ?? {},
		stack,
		userVisible: options?.userVisible ?? (!silent && !ignored && !options?.skipToast),
		raw: error,
	};
	return event;
}

export function emitDiagnostic(event: DiagnosticEvent): void {
	if (event.ignored) return;

	buffer.events.push(event);
	if (buffer.events.length > MAX_BUFFER_SIZE) {
		buffer.events.shift();
	}
	diagnosticEvents.set([...buffer.events]);

	for (const subscriber of buffer.subscribers) {
		try {
			subscriber(event);
		} catch {
		}
	}
}

export function captureAndEmit(
	source: DiagnosticSource,
	error: unknown,
	options?: {
		title?: string;
		context?: DiagnosticContext;
		userVisible?: boolean;
		skipToast?: boolean;
		level?: DiagnosticLevel;
	},
): DiagnosticEvent {
	const event = fromUnknown(source, error, options);
	emitDiagnostic(event);
	return event;
}

export function subscribe(callback: (event: DiagnosticEvent) => void): () => void {
	buffer.subscribers.add(callback);
	return () => {
		buffer.subscribers.delete(callback);
	};
}

export function getRecentDiagnostics(limit: number = 100): DiagnosticEvent[] {
	return buffer.events.slice(-limit);
}

export function getDiagnosticsBySource(source: DiagnosticSource): DiagnosticEvent[] {
	return buffer.events.filter((e) => e.source === source);
}

export function getDiagnosticsByLevel(level: DiagnosticLevel): DiagnosticEvent[] {
	return buffer.events.filter((e) => e.level === level);
}

export { serializeForEnv };
