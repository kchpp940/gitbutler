import {
	StartupPhase,
	createContainer,
	getContainer,
	type DIContainer,
	type BootstrapDiagnosticResult,
} from "@gitbutler/core/context";
import { dev } from "$app/environment";
import { logError } from "$lib/error/logError";

export type BootstrapArgs = {
	backend: import("$lib/backend").IBackend;
	appSettings: import("@gitbutler/but-sdk").AppSettings;
	settingsService: import("$lib/settings/appSettings").SettingsService;
	posthog: import("$lib/telemetry/posthog").PostHogWrapper;
	eventContext: import("$lib/telemetry/eventContext").EventContext;
	homeDir: string;
};

export type BootstrapResult = {
	container: DIContainer;
	validation: {
		valid: boolean;
		report: string;
		diagnostic: BootstrapDiagnosticResult;
	};
	duration: number;
};

export class BootstrapError extends Error {
	readonly diagnostic: BootstrapDiagnosticResult;

	constructor(message: string, diagnostic: BootstrapDiagnosticResult) {
		super(message);
		this.name = "BootstrapError";
		this.diagnostic = diagnostic;
	}
}

export class ProjectSwitchError extends Error {
	readonly diagnostic: BootstrapDiagnosticResult;
	readonly projectId: string;

	constructor(message: string, diagnostic: BootstrapDiagnosticResult, projectId: string) {
		super(message);
		this.name = "ProjectSwitchError";
		this.diagnostic = diagnostic;
		this.projectId = projectId;
	}
}

export async function bootstrap(args: BootstrapArgs): Promise<BootstrapResult> {
	const startTime = performance.now();

	if (dev) {
		const { enableDebugLogging } = await import("@gitbutler/core/context");
		enableDebugLogging();
	}

	const container = createContainer();

	if (dev) {
		console.debug("[Bootstrap] Starting application bootstrap...");
	}

	const { initDependencies } = await import("./deps");

	try {
		await runPhase(container, StartupPhase.FOUNDATION, async () => {
			await initDependencies(args, container);
		});

		const validation = container.validate();

		if (!validation.valid) {
			console.error("[Bootstrap] Dependency validation failed:", validation.report);
			for (const entry of validation.diagnostic.entries) {
				if (entry.severity === "error") {
					logError(new Error(`[${entry.code}] ${entry.message}`));
				}
			}
			throw new BootstrapError(
				`Bootstrap failed with ${validation.diagnostic.summary.errorCount} errors`,
				validation.diagnostic,
			);
		}

		const duration = performance.now() - startTime;

		if (dev) {
			console.debug(`[Bootstrap] Bootstrap completed in ${duration.toFixed(2)}ms`);
			console.debug(container.getDiagnosticReport());
		}

		return {
			container,
			validation: {
				valid: true,
				report: validation.report,
				diagnostic: validation.diagnostic,
			},
			duration,
		};
	} catch (error) {
		if (error instanceof BootstrapError) {
			throw error;
		}
		console.error("[Bootstrap] Bootstrap failed:", error);
		logError(error as Error);

		const diagnostic = container.diagnose();
		throw new BootstrapError(
			`Bootstrap failed: ${(error as Error).message}`,
			diagnostic,
		);
	}
}

async function runPhase(
	container: DIContainer,
	phase: StartupPhase,
	fn: () => Promise<void> | void,
): Promise<void> {
	container.startPhase(phase);
	try {
		await fn();
	} finally {
		container.endPhase();
	}
}

export function getActiveContainer(): DIContainer {
	return getContainer();
}

export async function handleProjectChange(projectId: string | undefined): Promise<void> {
	try {
		const container = getContainer();
		await container.setActiveProject(projectId);

		const diagnostic = container.diagnose();
		const staleErrors = diagnostic.entries.filter(
			(e) => e.code === "STALE_SERVICE" || e.code === "STALE_RTK_CACHE",
		);
		if (staleErrors.length > 0 && projectId) {
			throw new ProjectSwitchError(
				`Project switch to "${projectId}" detected ${staleErrors.length} stale service(s)/cache(s)`,
				diagnostic,
				projectId,
			);
		}
	} catch (error) {
		if (error instanceof ProjectSwitchError) {
			throw error;
		}
		console.error("[Bootstrap] Error handling project change:", error);
		logError(error as Error);
	}
}

export async function resetProjectServices(): Promise<void> {
	try {
		const container = getContainer();
		await container.resetProjectServices();
	} catch (error) {
		console.error("[Bootstrap] Error resetting project services:", error);
		logError(error as Error);
	}
}

export function getDiagnostic(): BootstrapDiagnosticResult {
	try {
		const container = getContainer();
		return container.diagnose();
	} catch {
		return {
			valid: false,
			timestamp: Date.now(),
			activeProjectId: undefined,
			services: [],
			rtkApis: [],
			dependencyGraph: [],
			startupOrder: [],
			entries: [
				{
					severity: "error",
					code: "CONTAINER_NOT_INITIALIZED",
					message: "DI Container not initialized",
				},
			],
			summary: {
				totalServices: 0,
				globalServices: 0,
				projectServices: 0,
				rtkApis: 0,
				endpointInjections: 0,
				errorCount: 1,
				warningCount: 0,
			},
		};
	}
}
