import {
	bootstrap,
	handleProjectChange,
	getDiagnostic,
	BootstrapError,
	ProjectSwitchError,
} from "$lib/bootstrap/bootstrap";
import {
	createContainer,
	getContainer,
	InjectionToken,
	StartupPhase,
	type DIContainer,
	type BootstrapDiagnosticResult,
} from "@gitbutler/core/context";
import { describe, expect, test, beforeEach, vi, afterEach } from "vitest";

describe("bootstrap", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		const win = window as any;
		delete win.__DI_CONTAINER__;
		delete win.__DI_REGISTRY__;
	});

	describe("getDiagnostic", () => {
		test("returns fallback diagnostic when container not initialized", () => {
			const diagnostic = getDiagnostic();

			expect(diagnostic.valid).toBe(false);
			expect(diagnostic.summary.errorCount).toBe(1);
			expect(diagnostic.entries[0]!.code).toBe("CONTAINER_NOT_INITIALIZED");
			expect(diagnostic.entries[0]!.message).toContain("DI Container not initialized");
		});

		test("returns real diagnostic when container is initialized", () => {
			const container = createContainer();
			const TOKEN = new InjectionToken<string>("test-svc");
			container.register(TOKEN, "value");

			const diagnostic = getDiagnostic();

			expect(diagnostic.valid).toBe(true);
			expect(diagnostic.summary.totalServices).toBe(1);
			expect(diagnostic.services[0]!.tokenName).toBe("test-svc");
		});
	});

	describe("BootstrapError", () => {
		test("carries diagnostic information", () => {
			const container = createContainer();
			const DEP = new InjectionToken<string>("missing-dep");
			const SVC = new InjectionToken<object>("my-service");
			container.register(SVC, {}, { dependencies: [DEP] });

			const diagnostic = container.diagnose();
			const error = new BootstrapError("Bootstrap failed", diagnostic);

			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("BootstrapError");
			expect(error.message).toBe("Bootstrap failed");
			expect(error.diagnostic).toBe(diagnostic);
			expect(error.diagnostic.valid).toBe(false);
			expect(error.diagnostic.entries[0]!.code).toBe("MISSING_DEPENDENCY");
			expect(error.diagnostic.entries[0]!.tokenName).toBe("my-service");
		});

		test("diagnostic includes complete error details", () => {
			const container = createContainer();
			const MISSING_1 = new InjectionToken<string>("db-connection");
			const MISSING_2 = new InjectionToken<object>("auth-service");
			const MAIN_SVC = new InjectionToken<object>("main-service");

			container.register(MAIN_SVC, {}, { dependencies: [MISSING_1, MISSING_2] });

			const diagnostic = container.diagnose();
			const error = new BootstrapError("Validation failed", diagnostic);

			expect(error.diagnostic.summary.errorCount).toBeGreaterThanOrEqual(2);
			expect(error.diagnostic.summary.totalServices).toBe(1);

			const missingEntries = error.diagnostic.entries.filter(
				(e) => e.code === "MISSING_DEPENDENCY",
			);
			expect(missingEntries.length).toBe(2);
			expect(missingEntries.every((e) => e.tokenName === "main-service")).toBe(true);
			expect(missingEntries.some((e) => e.message.includes("db-connection"))).toBe(true);
			expect(missingEntries.some((e) => e.message.includes("auth-service"))).toBe(true);
		});
	});

	describe("ProjectSwitchError", () => {
		test("carries diagnostic and projectId", () => {
			const container = createContainer();
			const diagnostic = container.diagnose();

			const error = new ProjectSwitchError(
				"Project switch failed",
				diagnostic,
				"project-123",
			);

			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("ProjectSwitchError");
			expect(error.message).toBe("Project switch failed");
			expect(error.projectId).toBe("project-123");
			expect(error.diagnostic).toBe(diagnostic);
		});

		test("diagnostic includes stale service details", () => {
			const container = createContainer();
			const STALE_TOKEN = new InjectionToken<object>("pr-cache-service");
			container.register(STALE_TOKEN, {}, { scope: "project" });

			const reg = container.getRegistry().get(STALE_TOKEN)!;
			reg.boundProjectId = "project-old";

			container.setActiveProject("project-new");

			const diagnostic = container.diagnose();
			const error = new ProjectSwitchError(
				"Stale services detected",
				diagnostic,
				"project-new",
			);

			expect(error.projectId).toBe("project-new");
			expect(error.diagnostic.valid).toBe(false);
			expect(error.diagnostic.entries.some((e) => e.code === "STALE_SERVICE")).toBe(
				true,
			);

			const staleEntry = error.diagnostic.entries.find(
				(e) => e.code === "STALE_SERVICE",
			);
			expect(staleEntry!.tokenName).toBe("pr-cache-service");
			expect(staleEntry!.message).toContain("project-old");
			expect(staleEntry!.message).toContain("project-new");
		});

		test("diagnostic includes stale RTK cache details", () => {
			const container = createContainer();
			container.registerRtkApi("github", "github", { isProjectScoped: true });

			const registry = container.getRegistry();
			registry.bindRtkCacheToProject("github", "project-alpha");
			(container as any).activeProjectId = "project-beta";

			const diagnostic = container.diagnose();
			const error = new ProjectSwitchError(
				"Stale cache detected",
				diagnostic,
				"project-beta",
			);

			expect(error.projectId).toBe("project-beta");
			expect(error.diagnostic.entries.some((e) => e.code === "STALE_RTK_CACHE")).toBe(
				true,
			);

			const staleRtkEntry = error.diagnostic.entries.find(
				(e) => e.code === "STALE_RTK_CACHE" && e.apiType === "github",
			);
			expect(staleRtkEntry).toBeDefined();
			expect(staleRtkEntry!.apiType).toBe("github");
			expect(staleRtkEntry!.message).toContain("project-alpha");
			expect(staleRtkEntry!.message).toContain("project-beta");
		});
	});

	describe("handleProjectChange", () => {
		test("notifies container about project change", async () => {
			const container = createContainer();
			const TOKEN = new InjectionToken<TestService>("test-svc");
			const service = new TestService();
			container.register(TOKEN, service, { scope: "project" });

			await handleProjectChange("project-42");

			expect(service.lastProjectId).toBe("project-42");
			expect(service.projectChangeCount).toBe(1);
		});

		test("throws ProjectSwitchError when stale service detected", async () => {
			const container = createContainer();
			const STALE_TOKEN = new InjectionToken<object>("stale-svc");
			container.register(STALE_TOKEN, {}, { scope: "project" });

			const registry = container.getRegistry();
			const reg = registry.get(STALE_TOKEN)!;
			reg.boundProjectId = "old-project";

			await expect(handleProjectChange("new-project")).rejects.toThrow(ProjectSwitchError);

			try {
				await handleProjectChange("new-project");
				expect.unreachable("Expected ProjectSwitchError");
			} catch (e) {
				expect(e).toBeInstanceOf(ProjectSwitchError);
				const error = e as ProjectSwitchError;
				expect(error.projectId).toBe("new-project");
				expect(error.diagnostic.valid).toBe(false);
				expect(error.diagnostic.entries.some((e) => e.code === "STALE_SERVICE")).toBe(
					true,
				);

				const staleEntry = error.diagnostic.entries.find(
					(e) => e.code === "STALE_SERVICE",
				);
				expect(staleEntry!.tokenName).toBe("stale-svc");
				expect(staleEntry!.message).toContain("old-project");
				expect(staleEntry!.message).toContain("new-project");
			}
		});

		test("ProjectSwitchError diagnostic includes phase information", async () => {
			const container = createContainer();

			container.startPhase(StartupPhase.FEATURE_SERVICES);
			const STALE_TOKEN = new InjectionToken<object>("feature-cache");
			container.register(STALE_TOKEN, {}, { scope: "project" });
			container.endPhase();

			container.startPhase(StartupPhase.RTK_API_CREATION);
			container.registerRtkApi("backend", "backend", { isProjectScoped: true });
			container.endPhase();

			const registry = container.getRegistry();
			registry.get(STALE_TOKEN)!.boundProjectId = "proj-a";
			registry.bindRtkCacheToProject("backend", "proj-a");

			try {
				await handleProjectChange("proj-b");
				expect.unreachable("Expected ProjectSwitchError");
			} catch (e) {
				expect(e).toBeInstanceOf(ProjectSwitchError);
				const error = e as ProjectSwitchError;

				const staleService = error.diagnostic.entries.find(
					(entry) => entry.code === "STALE_SERVICE",
				);
				expect(staleService!.phase).toBe(StartupPhase.FEATURE_SERVICES);
				expect(staleService!.tokenName).toBe("feature-cache");

				const staleRtk = error.diagnostic.entries.find(
					(entry) => entry.code === "STALE_RTK_CACHE",
				);
				expect(staleRtk!.phase).toBe(StartupPhase.RTK_API_CREATION);
				expect(staleRtk!.apiType).toBe("backend");
			}
		});
	});

	describe("bootstrap failure scenarios", () => {
		test("BootstrapError wraps container validation failures with full diagnostic", () => {
			const container = createContainer();

			const DEP_A = new InjectionToken<string>("redis-connection");
			const DEP_B = new InjectionToken<object>("queue-service");
			const API_SVC = new InjectionToken<object>("api-gateway");

			container.register(API_SVC, {}, {
				dependencies: [DEP_A, DEP_B],
				rtkDependencies: ["github"],
			});

			const validation = container.validate();
			expect(validation.valid).toBe(false);

			const error = new BootstrapError(
				`Bootstrap failed with ${validation.diagnostic.summary.errorCount} errors`,
				validation.diagnostic,
			);

			expect(error.name).toBe("BootstrapError");
			expect(error.message).toContain(String(validation.diagnostic.summary.errorCount));
			expect(error.diagnostic).toBe(validation.diagnostic);
			expect(error.diagnostic.valid).toBe(false);

			const missingDepEntries = error.diagnostic.entries.filter(
				(e) => e.code === "MISSING_DEPENDENCY",
			);
			expect(missingDepEntries.length).toBe(2);
			expect(missingDepEntries[0]!.tokenName).toBe("api-gateway");
			expect(missingDepEntries.some((e) => e.message.includes("redis-connection"))).toBe(true);
			expect(missingDepEntries.some((e) => e.message.includes("queue-service"))).toBe(true);

			const missingRtkEntries = error.diagnostic.entries.filter(
				(e) => e.code === "MISSING_RTK_DEPENDENCY",
			);
			expect(missingRtkEntries.length).toBeGreaterThanOrEqual(1);
			expect(missingRtkEntries[0]!.apiType).toBe("github");
			expect(missingRtkEntries[0]!.tokenName).toBe("api-gateway");
		});
	});
});

class TestService {
	lastProjectId: string | undefined;
	projectChangeCount = 0;

	async onProjectChange(projectId: string | undefined): Promise<void> {
		this.lastProjectId = projectId;
		this.projectChangeCount++;
	}
}
