export type DiagnosticStatus = "pending" | "running" | "passed" | "failed" | "warning";

export type DiagnosticCategory =
	| "environment"
	| "toolchain"
	| "backend"
	| "dependencies"
	| "configuration";

export type DiagnosticEnvironment = "development" | "runtime";

export type DiagnosticSeverity = "blocking" | "warning";

export interface DiagnosticFix {
	type: "command" | "link" | "instructions";
	label: string;
	command?: string;
	url?: string;
	instructions?: string;
}

export interface DiagnosticErrorDetail {
	message: string;
	raw_output?: string;
	exit_code?: number;
	location?: string;
}

export interface DiagnosticCheck {
	id: string;
	name: string;
	category: DiagnosticCategory;
	environment: DiagnosticEnvironment;
	severity: DiagnosticSeverity;
	status: DiagnosticStatus;
	message: string;
	details?: string;
	error?: DiagnosticErrorDetail;
	fix?: DiagnosticFix;
	duration_ms?: number;
}

export interface DiagnosticResult {
	checks: DiagnosticCheck[];
	total_duration_ms: number;
	has_failed: boolean;
	has_warnings: boolean;
	has_blocking_failures: boolean;
	summary: Record<string, number>;
}

export const DIAGNOSTIC_CHECK_IDS = {
	NODE_VERSION: "node-version",
	PNPM_VERSION: "pnpm-version",
	RUST_TOOLCHAIN: "rust-toolchain",
	TAURI_CLI: "tauri-cli",
	BACKEND_COMMAND: "backend-command",
	FRONTEND_DEPS: "frontend-deps",
	LOCAL_CONFIG: "local-config",
} as const;

export type DiagnosticCheckId = (typeof DIAGNOSTIC_CHECK_IDS)[keyof typeof DIAGNOSTIC_CHECK_IDS];
