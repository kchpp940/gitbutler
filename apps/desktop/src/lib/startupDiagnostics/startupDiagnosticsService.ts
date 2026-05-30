import { writable, type Readable } from "svelte/store";
import { get as storeGet } from "svelte/store";
import type { IBackend } from "$lib/backend";
import type {
	DiagnosticCheck,
	DiagnosticResult,
	DiagnosticStatus,
	DiagnosticCategory,
	DiagnosticEnvironment,
	DiagnosticSeverity,
	DiagnosticErrorDetail,
	DiagnosticFix,
} from "$lib/startupDiagnostics/types";

export class StartupDiagnosticsService {
	private checks = writable<DiagnosticCheck[]>([]);
	private result = writable<DiagnosticResult | null>(null);
	private isRunning = writable(false);
	private backend: IBackend | null = null;
	private startupPhase = true;
	private injectedCheckCounter = 0;

	setBackend(backend: IBackend): void {
		this.backend = backend;
	}

	markStartupComplete(): void {
		this.startupPhase = false;
	}

	isInStartupPhase(): boolean {
		return this.startupPhase;
	}

	getChecksStore(): Readable<DiagnosticCheck[]> {
		return this.checks;
	}

	getResultStore(): Readable<DiagnosticResult | null> {
		return this.result;
	}

	getIsRunningStore(): Readable<boolean> {
		return this.isRunning;
	}

	injectRuntimeError(
		name: string,
		error: unknown,
		options?: {
			category?: DiagnosticCategory;
			fix?: DiagnosticFix;
		},
	): DiagnosticCheck {
		const id = `injected-${++this.injectedCheckCounter}`;
		const errorMessage = error instanceof Error ? error.message : String(error);
		const check: DiagnosticCheck = {
			id,
			name,
			category: options?.category ?? "backend",
			environment: "runtime",
			severity: "blocking",
			status: "failed",
			message: errorMessage,
			error: {
				message: errorMessage,
				raw_output: error instanceof Error ? error.stack : undefined,
				location: undefined,
			},
			fix: options?.fix,
		};

		const currentChecks = storeGet(this.checks);
		const newChecks = [...currentChecks, check];
		this.checks.set(newChecks);
		this.recomputeResult(newChecks);

		return check;
	}

	private recomputeResult(checks: DiagnosticCheck[]): void {
		const has_failed = checks.some((c) => c.status === "failed");
		const has_warnings = checks.some((c) => c.status === "warning");
		const has_blocking_failures = checks.some(
			(c) => c.status === "failed" && c.severity === "blocking",
		);
		const summary: Record<string, number> = {};
		for (const c of checks) {
			summary[c.status] = (summary[c.status] || 0) + 1;
		}

		const currentResult = storeGet(this.result);
		this.result.set({
			checks,
			total_duration_ms: currentResult?.total_duration_ms ?? 0,
			has_failed,
			has_warnings,
			has_blocking_failures,
			summary,
		});
	}

	private async ensureBackend(): Promise<IBackend> {
		if (!this.backend) {
			throw new Error("Backend not set for StartupDiagnosticsService");
		}
		return this.backend;
	}

	private updateCheckStatus(checkId: string, status: DiagnosticStatus, message?: string): void {
		const currentChecks = storeGet(this.checks);
		const updated = currentChecks.map((c) =>
			c.id === checkId
				? { ...c, status, message: message ?? c.message }
				: c,
		);
		this.checks.set(updated);
	}

	private updateCheck(check: DiagnosticCheck): void {
		const currentChecks = storeGet(this.checks);
		const updated = currentChecks.map((c) => (c.id === check.id ? check : c));
		this.checks.set(updated);

		const currentResult = storeGet(this.result);
		if (currentResult) {
			const newChecks = currentResult.checks.map((c) => (c.id === check.id ? check : c));
			this.recomputeResult(newChecks);
		}
	}

	async runAllChecks(
		nodeRequiredMajor = 20,
		pnpmRequiredMajor = 9,
		skipDevelopmentChecks?: boolean,
	): Promise<DiagnosticResult> {
		const backend = await this.ensureBackend();

		this.isRunning.set(true);
		try {
			const checkIds = await backend.invoke<string[]>("get_diagnostic_check_ids");
			const pendingChecks: DiagnosticCheck[] = checkIds.map((id) => ({
				id,
				name: id,
				category: "environment" as DiagnosticCategory,
				environment: "runtime" as DiagnosticEnvironment,
				severity: "blocking" as DiagnosticSeverity,
				status: "pending" as DiagnosticStatus,
				message: "Waiting to run...",
			}));
			this.checks.set(pendingChecks);

			const result = await backend.invoke<DiagnosticResult>("run_startup_diagnostics", {
				nodeRequiredMajor,
				pnpmRequiredMajor,
				skipDevelopmentChecks,
			});

			this.checks.set(result.checks);
			this.result.set(result);

			return result;
		} finally {
			this.isRunning.set(false);
		}
	}

	async runCheck(
		checkId: string,
		nodeRequiredMajor = 20,
		pnpmRequiredMajor = 9,
	): Promise<DiagnosticCheck | null> {
		const backend = await this.ensureBackend();

		this.updateCheckStatus(checkId, "running");

		try {
			const check = await backend.invoke<DiagnosticCheck>("run_single_diagnostic_check", {
				checkId,
				nodeRequiredMajor,
				pnpmRequiredMajor,
			});

			this.updateCheck(check);
			return check;
		} catch (error) {
			this.updateCheckStatus(
				checkId,
				"failed",
				`Failed to run check: ${error}`,
			);
			return null;
		}
	}

	hasFailedChecks(): boolean {
		return storeGet(this.result)?.has_failed ?? false;
	}

	hasWarnings(): boolean {
		return storeGet(this.result)?.has_warnings ?? false;
	}

	hasBlockingFailures(): boolean {
		return storeGet(this.result)?.has_blocking_failures ?? false;
	}

	shouldShowDiagnostics(): boolean {
		return this.startupPhase && this.hasBlockingFailures();
	}
}

export const STARTUP_DIAGNOSTICS_SERVICE = new StartupDiagnosticsService();
