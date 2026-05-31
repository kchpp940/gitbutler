import type { Code } from "@gitbutler/but-sdk";

export type DiagnosticLevel = "error" | "warn" | "info" | "debug";

export type DiagnosticSource =
	| "tauri:command"
	| "rust:backend"
	| "frontend:service"
	| "frontend:route"
	| "ui:toast"
	| "svelte:error"
	| "unhandled:rejection";

export interface DiagnosticContext {
	projectId?: string;
	userId?: string;
	command?: string;
	route?: string;
	service?: string;
	[key: string]: unknown;
}

export interface DiagnosticEvent {
	id: string;
	timestamp: number;
	level: DiagnosticLevel;
	source: DiagnosticSource;
	message: string;
	title: string;
	errorCode?: Code;
	ignored: boolean;
	silent: boolean;
	description?: string;
	context: DiagnosticContext;
	stack?: string;
	userVisible: boolean;
	raw: unknown;
}

export interface SerializedDiagnostic {
	id: string;
	timestamp: number;
	level: DiagnosticLevel;
	source: DiagnosticSource;
	message: string;
	title: string;
	errorCode?: Code;
	ignored: boolean;
	description?: string;
	context: DiagnosticContext;
	userVisible: boolean;
	stack?: string;
}

export function createDiagnosticId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

export function isDiagnosticEvent(value: unknown): value is DiagnosticEvent {
	return (
		typeof value === "object" &&
		value !== null &&
		"id" in value &&
		"level" in value &&
		"source" in value &&
		"message" in value &&
		"title" in value
	);
}

export function serializeForEnv(event: DiagnosticEvent): SerializedDiagnostic {
	const isDev = import.meta.env.DEV;
	const base: SerializedDiagnostic = {
		id: event.id,
		timestamp: event.timestamp,
		level: event.level,
		source: event.source,
		message: event.message,
		title: event.title,
		errorCode: event.errorCode,
		ignored: event.ignored,
		description: event.description,
		context: isDev || event.userVisible ? event.context : safeContext(event.context),
		userVisible: event.userVisible,
	};
	if (isDev && event.stack) {
		base.stack = event.stack;
	}
	return base;
}

function safeContext(ctx: DiagnosticContext): DiagnosticContext {
	const safe: DiagnosticContext = {};
	if (ctx.projectId) safe.projectId = ctx.projectId;
	if (ctx.command) safe.command = ctx.command;
	if (ctx.route) safe.route = ctx.route;
	if (ctx.service) safe.service = ctx.service;
	return safe;
}
