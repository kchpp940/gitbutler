import { isStr } from "@gitbutler/ui/utils/string";
import type { PostHogWrapper } from "$lib/telemetry/posthog";
import { fromUnknown, emitDiagnostic } from "$lib/diagnostics/service";
import type { DiagnosticContext } from "$lib/diagnostics/types";

/**
 * Error type that has both a message and a status. These errors are primarily
 * thrown by AI services and the Octokit GitHub client.
 */
export interface HttpError {
	message: string;
	status: number;
}

/**
 * Error type for unhandled Promise rejections.
 */
export interface UnhandledPromiseError {
	reason: Error;
	message: string;
}

/**
 * A subclass of `Error` that won't have a toast shown for it.
 *
 * This is useful for errors that are get handled elsewhere but should still
 * throw to stop execution.
 */
export class SilentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SilentError";
	}

	static from(error: Error): SilentError {
		const e = new SilentError(error.message);
		e.stack = error.stack;
		return e;
	}
}

const QUERY_ERROR_EVENT_NAME = "query:error";
const DEFAULT_ERROR_NAME = "QUERY:UnknownError";
const DEFAULT_ERROR_MESSAGE = "QUERY:An unknown error occurred";

const QUERY_ERROR_CAPTURE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const QUERY_ERROR_CAPTURE_LIMIT = 200;
const QUERY_ERROR_PER_KEY_LIMIT = 5;
const queryErrorCaptureTimestamps: number[] = [];
const queryErrorPerKeyTimestamps = new Map<string, number[]>();

function pruneTimestamps(timestamps: number[], cutoff: number) {
	while (timestamps.length > 0 && timestamps[0]! <= cutoff) {
		timestamps.shift();
	}
}

function shouldCaptureQueryError(key: string): boolean {
	const now = Date.now();
	const cutoff = now - QUERY_ERROR_CAPTURE_WINDOW_MS;

	pruneTimestamps(queryErrorCaptureTimestamps, cutoff);
	if (queryErrorCaptureTimestamps.length >= QUERY_ERROR_CAPTURE_LIMIT) return false;

	let perKey = queryErrorPerKeyTimestamps.get(key);
	if (perKey) {
		pruneTimestamps(perKey, cutoff);
		if (perKey.length === 0) {
			// Drop the bucket so the per-key map doesn't grow without
			// bound across long sessions where commands/error titles vary.
			queryErrorPerKeyTimestamps.delete(key);
			perKey = undefined;
		} else if (perKey.length >= QUERY_ERROR_PER_KEY_LIMIT) {
			return false;
		}
	}
	if (!perKey) {
		perKey = [];
		queryErrorPerKeyTimestamps.set(key, perKey);
	}

	perKey.push(now);
	queryErrorCaptureTimestamps.push(now);
	return true;
}

interface QueryError {
	name: string;
	message: string;
	code: string | undefined;
}

function isUnknownObject(error: unknown): error is Record<string, unknown> {
	return typeof error === "object" && error !== null;
}

function getBestName(error: unknown): string {
	if (isStr(error)) return error;

	if (isUnknownObject(error) && "name" in error && typeof error.name === "string") {
		return error.name;
	}
	if (error instanceof Error) {
		return error.name;
	}

	return DEFAULT_ERROR_NAME;
}

function getBestMessage(error: unknown): string {
	if (isUnknownObject(error) && "message" in error && typeof error.message === "string") {
		return error.message;
	}

	if (error instanceof Error) {
		return error.message;
	}

	return DEFAULT_ERROR_MESSAGE;
}

function getBestCode(error: unknown): string | undefined {
	if (isUnknownObject(error) && "code" in error && typeof error.code === "string") {
		return error.code;
	}

	return undefined;
}

export function parseQueryError(error: unknown): QueryError {
	const event = fromUnknown("rust:backend", error, { skipToast: true });
	return {
		name: event.title,
		message: event.message,
		code: event.errorCode,
	};
}

export function emitQueryError(
	posthog: PostHogWrapper | undefined,
	error: unknown,
	context?: { command?: string; actionName?: string },
) {
	const diagnosticContext: DiagnosticContext = {
		command: context?.command,
		actionName: context?.actionName,
	};
	const event = fromUnknown("rust:backend", error, {
		context: diagnosticContext,
		skipToast: true,
	});

	if (event.silent) {
		return;
	}
	if (!posthog) return;

	emitDiagnostic(event);

	const key = `${context?.command ?? ""}|${event.title}`;
	if (!shouldCaptureQueryError(key)) return;

	posthog.capture(QUERY_ERROR_EVENT_NAME, {
		error_title: event.title,
		error_message: event.message,
		error_code: event.errorCode,
		command: context?.command,
		actionName: context?.actionName,
		diagnostic_id: event.id,
	});
}
