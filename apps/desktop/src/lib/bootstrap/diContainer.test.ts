import {
	InjectionToken,
	StartupPhase,
	DuplicateRegistrationError,
	MissingDependencyError,
	StaleServiceError,
	StaleRtkCacheError,
	EndpointInjectionError,
	DIContainer,
	ServiceRegistry,
	type RtkApiType,
	type ProjectScopedService,
	type DiagnosticEntry,
	type ServiceDiagnostic,
	type RtkApiDiagnostic,
} from "@gitbutler/core/context";
import { describe, expect, test, beforeEach, vi } from "vitest";

describe("DIContainer", () => {
	let container: DIContainer;
	let registry: ServiceRegistry;

	beforeEach(() => {
		container = new DIContainer();
		registry = container.getRegistry();
	});

	describe("service registration and retrieval", () => {
		test("registers and retrieves a service", () => {
			const TOKEN = new InjectionToken<string>("test-token");
			container.register(TOKEN, "test-value");

			expect(container.get(TOKEN)).toBe("test-value");
			expect(container.has(TOKEN)).toBe(true);
		});

		test("registerAll registers multiple services", () => {
			const TOKEN1 = new InjectionToken<string>("token-1");
			const TOKEN2 = new InjectionToken<number>("token-2");

			container.registerAll([
				{ token: TOKEN1, value: "value-1", scope: "global" },
				{ token: TOKEN2, value: 42, scope: "global" },
			]);

			expect(container.get(TOKEN1)).toBe("value-1");
			expect(container.get(TOKEN2)).toBe(42);
		});
	});

	describe("duplicate registration detection", () => {
		test("throws DuplicateRegistrationError on duplicate token", () => {
			const TOKEN = new InjectionToken<string>("test-token");
			container.register(TOKEN, "first-value");

			expect(() => container.register(TOKEN, "second-value")).toThrow(
				DuplicateRegistrationError,
			);
		});

		test("error contains token name and registration info", () => {
			const TOKEN = new InjectionToken<string>("my-service");
			container.register(TOKEN, "first-value");

			try {
				container.register(TOKEN, "second-value");
				expect.unreachable("Expected DuplicateRegistrationError");
			} catch (e) {
				expect(e).toBeInstanceOf(DuplicateRegistrationError);
				const error = e as DuplicateRegistrationError;
				expect(error.message).toContain("my-service");
				expect(error.name).toBe("DuplicateRegistrationError");
			}
		});
	});

	describe("missing dependency detection", () => {
		test("throws MissingDependencyError when dependency not registered", () => {
			const DEP_TOKEN = new InjectionToken<string>("dependency-token");
			const SERVICE_TOKEN = new InjectionToken<object>("service-token");

			container.register(SERVICE_TOKEN, {}, { dependencies: [DEP_TOKEN] });

			const result = container.validate();
			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors[0]!).toBeInstanceOf(MissingDependencyError);
			expect(result.errors[0]!.message).toContain("dependency-token");
			expect(result.errors[0]!.message).toContain("service-token");
		});

		test("diagnostic entries include MISSING_DEPENDENCY code and token name", () => {
			const DEP_TOKEN = new InjectionToken<string>("missing-dep");
			const SERVICE_TOKEN = new InjectionToken<object>("my-service");

			container.register(SERVICE_TOKEN, {}, { dependencies: [DEP_TOKEN] });

			const diagnostic = container.diagnose();
			const missingEntry = diagnostic.entries.find(
				(e: DiagnosticEntry) => e.code === "MISSING_DEPENDENCY",
			);
			expect(missingEntry).toBeDefined();
			expect(missingEntry!.tokenName).toBe("my-service");
			expect(missingEntry!.severity).toBe("error");
			expect(missingEntry!.message).toContain("missing-dep");
		});

		test("diagnostic includes MISSING_RTK_DEPENDENCY for missing RTK API", () => {
			const SERVICE_TOKEN = new InjectionToken<object>("pr-service");

			container.register(SERVICE_TOKEN, {}, { rtkDependencies: ["github"] });

			const diagnostic = container.diagnose();
			const rtkMissingEntry = diagnostic.entries.find(
				(e: DiagnosticEntry) => e.code === "MISSING_RTK_DEPENDENCY",
			);
			expect(rtkMissingEntry).toBeDefined();
			expect(rtkMissingEntry!.tokenName).toBe("pr-service");
			expect(rtkMissingEntry!.apiType).toBe("github");
			expect(rtkMissingEntry!.severity).toBe("error");
			expect(rtkMissingEntry!.message).toContain("pr-service");
			expect(rtkMissingEntry!.message).toContain("github");
		});
	});

	describe("RTK API and endpoint injection order", () => {
		test("trackEndpointInjection throws EndpointInjectionError if API not registered", () => {
			expect(() =>
				container.trackEndpointInjection("github", ["getPr", "listPrs"]),
			).toThrow(EndpointInjectionError);

			try {
				container.trackEndpointInjection("github", ["getPr"]);
				expect.unreachable("Expected EndpointInjectionError");
			} catch (e) {
				expect(e).toBeInstanceOf(EndpointInjectionError);
				const error = e as EndpointInjectionError;
				expect(error.message).toContain("github");
				expect(error.message).toContain("getPr");
				expect(error.name).toBe("EndpointInjectionError");
			}
		});

		test("diagnostic detects ENDPOINT_BEFORE_API when API registered after injection", async () => {
			const registry = container.getRegistry();

			try {
				registry.trackEndpointInjection("github", ["getPr"]);
			} catch (e) {
				expect(e).toBeInstanceOf(EndpointInjectionError);
			}

			await new Promise((resolve) => setTimeout(resolve, 5));

			container.registerRtkApi("github", "github");

			const diagnostic = container.diagnose();
			const endpointErrors = diagnostic.entries.filter(
				(e: DiagnosticEntry) => e.code === "ENDPOINT_BEFORE_API",
			);
			expect(endpointErrors.length).toBeGreaterThan(0);
			expect(endpointErrors[0]!.apiType).toBe("github");
			expect(endpointErrors[0]!.endpointName).toBe("getPr");
			expect(endpointErrors[0]!.severity).toBe("error");
		});

		test("diagnostic includes RTK API registration info", () => {
			container.registerRtkApi("backend", "backend", { isProjectScoped: true });
			container.registerRtkApi("github", "github", { isProjectScoped: true });

			const diagnostic = container.diagnose();
			expect(diagnostic.rtkApis.length).toBe(2);
			expect(diagnostic.rtkApis.map((a: RtkApiDiagnostic) => a.apiType)).toEqual(
				expect.arrayContaining(["backend", "github"]),
			);
			expect(diagnostic.summary.rtkApis).toBe(2);

			const backendApi = diagnostic.rtkApis.find(
				(a: RtkApiDiagnostic) => a.apiType === "backend",
			);
			expect(backendApi!.reducerPath).toBe("backend");
			expect(backendApi!.isProjectScoped).toBe(true);
		});

		test("diagnostic tracks endpoint injections with source service", () => {
			container.registerRtkApi("github", "github");

			const registry = container.getRegistry();
			registry.trackEndpointInjection("github", ["getPr", "listPrs"], "GitHubPrService");
			registry.trackEndpointInjection("github", ["addComment"], "CommentService");

			const diagnostic = container.diagnose();
			const githubApi = diagnostic.rtkApis.find(
				(a: RtkApiDiagnostic) => a.apiType === "github",
			);
			expect(githubApi).toBeDefined();
			expect(githubApi!.endpointInjections.length).toBe(2);
			expect(githubApi!.endpointInjections[0]!.sourceService).toBe("GitHubPrService");
			expect(githubApi!.endpointInjections[0]!.endpointNames).toEqual(["getPr", "listPrs"]);
			expect(githubApi!.endpointInjections[1]!.endpointNames).toEqual(["addComment"]);
			expect(githubApi!.endpointInjections[1]!.sourceService).toBe("CommentService");
			expect(diagnostic.summary.endpointInjections).toBe(2);
		});

		test("tracks RTK API creation in startup log when in phase", () => {
			container.startPhase(StartupPhase.RTK_API_CREATION);
			container.registerRtkApi("backend", "backend");
			container.endPhase();

			const diagnostic = container.diagnose();
			const backendEntry = diagnostic.startupOrder.find(
				(l) => l.token === "RTK_API:backend",
			);
			expect(backendEntry).toBeDefined();
			expect(backendEntry!.phase).toBe(StartupPhase.RTK_API_CREATION);
		});

		test("tracks endpoint injection in startup log when in phase", () => {
			container.registerRtkApi("github", "github");

			container.startPhase(StartupPhase.RTK_ENDPOINT_INJECTION);
			container.trackEndpointInjection("github", ["getPr"]);
			container.endPhase();

			const diagnostic = container.diagnose();
			const epEntry = diagnostic.startupOrder.find(
				(l) => l.token === "ENDPOINT:github:getPr",
			);
			expect(epEntry).toBeDefined();
			expect(epEntry!.phase).toBe(StartupPhase.RTK_ENDPOINT_INJECTION);
		});

		test("diagnostic detects phase order violation with phase info", async () => {
			container.startPhase(StartupPhase.FOUNDATION);
			try {
				container.trackEndpointInjection("github", ["getPr"]);
			} catch (e) {
				expect(e).toBeInstanceOf(EndpointInjectionError);
			}
			container.endPhase();

			await new Promise((resolve) => setTimeout(resolve, 5));

			container.startPhase(StartupPhase.RTK_API_CREATION);
			container.registerRtkApi("github", "github");
			container.endPhase();

			const diagnostic = container.diagnose();
			const phaseErrors = diagnostic.entries.filter(
				(e: DiagnosticEntry) =>
					e.code === "ENDPOINT_BEFORE_API" &&
					e.phase !== undefined &&
					e.message.includes(StartupPhase.RTK_API_CREATION),
			);
			expect(phaseErrors.length).toBeGreaterThan(0);
			expect(phaseErrors[0]!.endpointName).toBe("getPr");
			expect(phaseErrors[0]!.apiType).toBe("github");
			expect(phaseErrors[0]!.phase).toBe(StartupPhase.FOUNDATION);
			expect(phaseErrors[0]!.message).toContain(StartupPhase.FOUNDATION);
			expect(phaseErrors[0]!.message).toContain(StartupPhase.RTK_API_CREATION);
		});
	});

	describe("project-scoped service lifecycle", () => {
		test("setActiveProject calls onProjectChange on ProjectScopedServices", async () => {
			const SERVICE_TOKEN = new InjectionToken<TestProjectService>("test-service");
			const service = new TestProjectService();

			container.register(SERVICE_TOKEN, service, { scope: "project" });

			await container.setActiveProject("project-1");
			expect(service.lastProjectId).toBe("project-1");
			expect(service.projectChangeCount).toBe(1);

			await container.setActiveProject("project-2");
			expect(service.lastProjectId).toBe("project-2");
			expect(service.projectChangeCount).toBe(2);
		});

		test("setActiveProject with undefined clears project binding", async () => {
			const SERVICE_TOKEN = new InjectionToken<TestProjectService>("test-service");
			const service = new TestProjectService();

			container.register(SERVICE_TOKEN, service, { scope: "project" });

			await container.setActiveProject("project-1");
			await container.setActiveProject(undefined);

			expect(service.lastProjectId).toBeUndefined();
		});

		test("diagnostic detects STALE_SERVICE when service bound to different project", async () => {
			const STALE_TOKEN = new InjectionToken<object>("stale-service");
			const registry = container.getRegistry();

			container.register(STALE_TOKEN, {}, { scope: "project" });

			const reg = registry.get(STALE_TOKEN)!;
			reg.boundProjectId = "old-project";

			await container.setActiveProject("new-project");

			const diagnostic = container.diagnose();
			const staleEntries = diagnostic.entries.filter(
				(e: DiagnosticEntry) => e.code === "STALE_SERVICE",
			);
			expect(staleEntries.length).toBeGreaterThan(0);
			expect(staleEntries[0]!.tokenName).toBe("stale-service");
			expect(staleEntries[0]!.severity).toBe("error");
			expect(staleEntries[0]!.message).toContain("old-project");
			expect(staleEntries[0]!.message).toContain("new-project");
		});

		test("diagnostic detects STALE_RTK_CACHE with apiType", async () => {
			container.registerRtkApi("backend", "backend", { isProjectScoped: true });
			const registry = container.getRegistry();

			registry.bindRtkCacheToProject("backend", "old-project");
			await container.setActiveProject("new-project");

			const diagnostic = container.diagnose();
			const staleRtkEntries = diagnostic.entries.filter(
				(e: DiagnosticEntry) => e.code === "STALE_RTK_CACHE",
			);
			expect(staleRtkEntries.length).toBeGreaterThan(0);
			expect(staleRtkEntries[0]!.apiType).toBe("backend");
			expect(staleRtkEntries[0]!.severity).toBe("error");
			expect(staleRtkEntries[0]!.message).toContain("old-project");
			expect(staleRtkEntries[0]!.message).toContain("new-project");
		});

		test("get() throws StaleServiceError for stale project-scoped service", async () => {
			const STALE_TOKEN = new InjectionToken<object>("stale-service");
			const registry = container.getRegistry();

			container.register(STALE_TOKEN, {}, { scope: "project" });
			const reg = registry.get(STALE_TOKEN)!;
			reg.boundProjectId = "project-a";

			await container.setActiveProject("project-b");

			expect(() => container.get(STALE_TOKEN)).toThrow(StaleServiceError);

			try {
				container.get(STALE_TOKEN);
				expect.unreachable("Expected StaleServiceError");
			} catch (e) {
				expect(e).toBeInstanceOf(StaleServiceError);
				const error = e as StaleServiceError;
				expect(error.message).toContain("stale-service");
				expect(error.message).toContain("project-a");
				expect(error.message).toContain("project-b");
				expect(error.name).toBe("StaleServiceError");
			}
		});

		test("checkRtkCacheStale throws StaleRtkCacheError for stale cache", () => {
			container.registerRtkApi("github", "github", { isProjectScoped: true });
			const registry = container.getRegistry();

			registry.bindRtkCacheToProject("github", "project-alpha");

			(container as any).activeProjectId = "project-beta";

			expect(() => container.checkRtkCacheStale("github")).toThrow(StaleRtkCacheError);

			try {
				container.checkRtkCacheStale("github");
				expect.unreachable("Expected StaleRtkCacheError");
			} catch (e) {
				expect(e).toBeInstanceOf(StaleRtkCacheError);
				const error = e as StaleRtkCacheError;
				expect(error.message).toContain("github");
				expect(error.message).toContain("project-alpha");
				expect(error.message).toContain("project-beta");
				expect(error.name).toBe("StaleRtkCacheError");
			}
		});

		test("resetProjectServices calls reset() on all project services", async () => {
			const TOKEN1 = new InjectionToken<TestProjectService>("service-1");
			const TOKEN2 = new InjectionToken<TestProjectService>("service-2");

			const svc1 = new TestProjectService();
			const svc2 = new TestProjectService();

			container.register(TOKEN1, svc1, { scope: "project" });
			container.register(TOKEN2, svc2, { scope: "project" });

			await container.resetProjectServices();

			expect(svc1.resetCount).toBe(1);
			expect(svc2.resetCount).toBe(1);
		});

		test("project-scoped services include RTK dependencies in diagnostic", () => {
			const STACK_SERVICE = new InjectionToken<object>("STACK_SERVICE");

			container.registerRtkApi("backend", "backend");
			container.register(STACK_SERVICE, {}, { scope: "project", rtkDependencies: ["backend"] });

			const diagnostic = container.diagnose();
			const stackSvc = diagnostic.services.find(
				(s: ServiceDiagnostic) => s.tokenName === "STACK_SERVICE",
			);
			expect(stackSvc).toBeDefined();
			expect(stackSvc!.scope).toBe("project");
			expect(stackSvc!.rtkDependencies).toEqual(["backend"]);
		});
	});

	describe("startup phases and trace", () => {
		test("startPhase groups registrations in startup log", () => {
			const TOKEN_A = new InjectionToken<string>("service-a");
			const TOKEN_B = new InjectionToken<string>("service-b");
			const TOKEN_C = new InjectionToken<string>("service-c");

			container.startPhase(StartupPhase.FOUNDATION);
			container.register(TOKEN_A, "a");
			container.register(TOKEN_B, "b");
			container.endPhase();

			container.startPhase(StartupPhase.CORE_SERVICES);
			container.register(TOKEN_C, "c");
			container.endPhase();

			const diagnostic = container.diagnose();
			expect(diagnostic.startupOrder.length).toBe(3);
			expect(diagnostic.startupOrder[0]!.phase).toBe(StartupPhase.FOUNDATION);
			expect(diagnostic.startupOrder[0]!.token).toBe("service-a");
			expect(diagnostic.startupOrder[1]!.phase).toBe(StartupPhase.FOUNDATION);
			expect(diagnostic.startupOrder[2]!.phase).toBe(StartupPhase.CORE_SERVICES);
		});

		test("diagnostic includes dependency graph edges with correct types", () => {
			const DEP = new InjectionToken<string>("dep-service");
			const SVC = new InjectionToken<object>("main-service");

			container.register(DEP, "dep");
			container.register(SVC, {}, { dependencies: [DEP], rtkDependencies: ["backend"] });
			container.registerRtkApi("backend", "backend");

			const diagnostic = container.diagnose();
			const serviceEdges = diagnostic.dependencyGraph.filter((e) => e.type === "service");
			const rtkEdges = diagnostic.dependencyGraph.filter((e) => e.type === "rtk");

			expect(serviceEdges.length).toBe(1);
			expect(serviceEdges[0]!.from).toBe("main-service");
			expect(serviceEdges[0]!.to).toBe("dep-service");

			expect(rtkEdges.length).toBe(1);
			expect(rtkEdges[0]!.from).toBe("main-service");
			expect(rtkEdges[0]!.to).toBe("RTK:backend");
		});

		test("service diagnostic includes phase information", () => {
			const TOKEN = new InjectionToken<string>("phased-service");

			container.startPhase(StartupPhase.UI_SERVICES);
			container.register(TOKEN, "value");
			container.endPhase();

			const diagnostic = container.diagnose();
			const svc = diagnostic.services.find(
				(s: ServiceDiagnostic) => s.tokenName === "phased-service",
			);
			expect(svc).toBeDefined();
			expect(svc!.phase).toBe(StartupPhase.UI_SERVICES);
		});
	});

	describe("diagnostic report structure", () => {
		test("validate returns diagnostic with proper structure", () => {
			const TOKEN = new InjectionToken<string>("test-token");

			container.startPhase(StartupPhase.CORE_SERVICES);
			container.register(TOKEN, "value");
			container.endPhase();

			container.startPhase(StartupPhase.RTK_API_CREATION);
			container.registerRtkApi("backend", "backend");
			container.endPhase();

			const result = container.validate();

			expect(result.diagnostic).toBeDefined();
			expect(result.diagnostic.valid).toBe(true);
			expect(result.diagnostic.summary.totalServices).toBe(1);
			expect(result.diagnostic.summary.rtkApis).toBe(1);
			expect(result.diagnostic.summary.errorCount).toBe(0);
			expect(result.diagnostic.summary.warningCount).toBe(0);
			expect(result.diagnostic.services.length).toBe(1);
			expect(result.diagnostic.rtkApis.length).toBe(1);
			expect(result.diagnostic.startupOrder.length).toBeGreaterThan(0);
			expect(typeof result.diagnostic.timestamp).toBe("number");
		});

		test("diagnostic entries include all relevant fields for each error type", () => {
			const MISSING_DEP = new InjectionToken<string>("missing-dep");
			const SVC_TOKEN = new InjectionToken<object>("error-prone-service");

			container.register(SVC_TOKEN, {}, {
				dependencies: [MISSING_DEP],
				rtkDependencies: ["github"],
			});

			const registry = container.getRegistry();
			try {
				registry.trackEndpointInjection("gitlab", ["listMr"]);
			} catch (e) {
				expect(e).toBeInstanceOf(EndpointInjectionError);
			}

			const diagnostic = container.diagnose();

			const missingDep = diagnostic.entries.find(
				(e: DiagnosticEntry) => e.code === "MISSING_DEPENDENCY",
			);
			expect(missingDep).toMatchObject({
				severity: "error",
				code: "MISSING_DEPENDENCY",
				tokenName: "error-prone-service",
				message: expect.stringContaining("missing-dep"),
			});

			const missingRtk = diagnostic.entries.find(
				(e: DiagnosticEntry) => e.code === "MISSING_RTK_DEPENDENCY",
			);
			expect(missingRtk).toMatchObject({
				severity: "error",
				code: "MISSING_RTK_DEPENDENCY",
				tokenName: "error-prone-service",
				apiType: "github" as RtkApiType,
			});

			const beforeApi = diagnostic.entries.find(
				(e: DiagnosticEntry) => e.code === "ENDPOINT_BEFORE_API",
			);
			expect(beforeApi).toMatchObject({
				severity: "error",
				code: "ENDPOINT_BEFORE_API",
				apiType: "gitlab" as RtkApiType,
				endpointName: "listMr",
			});
		});
	});

	describe("RTK cache reset handlers", () => {
		test("resetRtkApi calls registered reset handler", () => {
			let resetCalled = false;
			container.registerRtkApi("backend", "backend", {
				isProjectScoped: true,
				resetHandler: () => {
					resetCalled = true;
				},
			});

			container.resetRtkApi("backend");
			expect(resetCalled).toBe(true);
		});

		test("resetProjectScopedRtkApis only resets project-scoped APIs", () => {
			const resetCalls: string[] = [];

			container.registerRtkApi("backend", "backend", {
				isProjectScoped: true,
				resetHandler: () => resetCalls.push("backend"),
			});
			container.registerRtkApi("github", "github", {
				isProjectScoped: true,
				resetHandler: () => resetCalls.push("github"),
			});
			container.registerRtkApi("gitlab", "gitlab", {
				isProjectScoped: false,
				resetHandler: () => resetCalls.push("gitlab"),
			});

			container.resetProjectScopedRtkApis();

			expect(resetCalls).toEqual(expect.arrayContaining(["backend", "github"]));
			expect(resetCalls).not.toContain("gitlab");
		});

		test("setRtkApiResetHandler allows setting reset handler after registration", () => {
			let resetCalled = false;
			container.registerRtkApi("backend", "backend", { isProjectScoped: true });
			container.setRtkApiResetHandler("backend", () => {
				resetCalled = true;
			});

			container.resetRtkApi("backend");
			expect(resetCalled).toBe(true);
		});

		test("setActiveProject automatically resets project-scoped RTK APIs", async () => {
			const resetCalls: string[] = [];

			container.registerRtkApi("backend", "backend", {
				isProjectScoped: true,
				resetHandler: () => resetCalls.push("backend"),
			});
			container.registerRtkApi("github", "github", {
				isProjectScoped: true,
				resetHandler: () => resetCalls.push("github"),
			});

			await container.setActiveProject("project-1");

			expect(resetCalls).toEqual(expect.arrayContaining(["backend", "github"]));
			expect(resetCalls.length).toBe(2);
		});
	});

	describe("regression: structured error identifiers", () => {
		test("MissingDependencyError carries specific dependency and service token", () => {
			const DEP_TOKEN = new InjectionToken<string>("config-store");
			const SVC_TOKEN = new InjectionToken<object>("auth-service");

			container.register(SVC_TOKEN, {}, { dependencies: [DEP_TOKEN] });

			const result = container.validate();
			expect(result.valid).toBe(false);

			const error = result.errors.find(
				(e) => e instanceof MissingDependencyError && e.message.includes("config-store"),
			);
			expect(error).toBeInstanceOf(MissingDependencyError);
			expect(error!.name).toBe("MissingDependencyError");
			expect(error!.message).toContain("config-store");
			expect(error!.message).toContain("auth-service");

			const entry = container.diagnose().entries.find(
				(e: DiagnosticEntry) => e.code === "MISSING_DEPENDENCY",
			);
			expect(entry).toBeDefined();
			expect(entry!.tokenName).toBe("auth-service");
			expect(entry!.message).toContain("config-store");
		});

		test("DuplicateRegistrationError carries specific token name", () => {
			const TOKEN = new InjectionToken<string>("cache-service");
			container.register(TOKEN, "first");

			try {
				container.register(TOKEN, "second");
				expect.unreachable("Expected DuplicateRegistrationError");
			} catch (e) {
				expect(e).toBeInstanceOf(DuplicateRegistrationError);
				expect((e as DuplicateRegistrationError).name).toBe("DuplicateRegistrationError");
				expect((e as DuplicateRegistrationError).message).toContain("cache-service");
			}
		});

		test("EndpointInjectionError carries specific apiType and endpointName", () => {
			try {
				container.trackEndpointInjection("gitlab", ["listMr"]);
				expect.unreachable("Expected EndpointInjectionError");
			} catch (e) {
				expect(e).toBeInstanceOf(EndpointInjectionError);
				const error = e as EndpointInjectionError;
				expect(error.name).toBe("EndpointInjectionError");
				expect(error.message).toContain("gitlab");
				expect(error.message).toContain("listMr");
			}

			try {
				container.trackEndpointInjection("gitlab", ["getRepo", "listCommits"]);
				expect.unreachable("Expected EndpointInjectionError");
			} catch (e) {
				expect(e).toBeInstanceOf(EndpointInjectionError);
				const error = e as EndpointInjectionError;
				expect(error.message).toContain("gitlab");
				expect(error.message).toContain("getRepo");
			}
		});

		test("ENDPOINT_BEFORE_API diagnostic entry has apiType, endpointName, and phase", async () => {
			container.startPhase(StartupPhase.CORE_SERVICES);
			try {
				container.trackEndpointInjection("github", ["getPr"]);
			} catch (_e) {}
			container.endPhase();

			await new Promise((resolve) => setTimeout(resolve, 5));

			container.startPhase(StartupPhase.RTK_API_CREATION);
			container.registerRtkApi("github", "github");
			container.endPhase();

			const diagnostic = container.diagnose();
			const entry = diagnostic.entries.find(
				(e: DiagnosticEntry) =>
					e.code === "ENDPOINT_BEFORE_API" &&
					e.endpointName === "getPr" &&
					e.apiType === "github" &&
					e.phase !== undefined,
			);
			expect(entry).toBeDefined();
			expect(entry!.apiType).toBe("github");
			expect(entry!.endpointName).toBe("getPr");
			expect(entry!.phase).toBe(StartupPhase.CORE_SERVICES);
			expect(entry!.message).toContain("github");
			expect(entry!.message).toContain("getPr");
			expect(entry!.message).toContain(StartupPhase.CORE_SERVICES);
		});

		test("StaleServiceError carries specific token and project IDs", async () => {
			const TOKEN = new InjectionToken<object>("pr-cache-service");
			container.register(TOKEN, {}, { scope: "project" });

			const reg = container.getRegistry().get(TOKEN)!;
			reg.boundProjectId = "proj-old";

			await container.setActiveProject("proj-new");

			try {
				container.get(TOKEN);
				expect.unreachable("Expected StaleServiceError");
			} catch (e) {
				expect(e).toBeInstanceOf(StaleServiceError);
				const error = e as StaleServiceError;
				expect(error.name).toBe("StaleServiceError");
				expect(error.message).toContain("pr-cache-service");
				expect(error.message).toContain("proj-old");
				expect(error.message).toContain("proj-new");
			}
		});

		test("STALE_SERVICE diagnostic entry has tokenName and phase", async () => {
			const TOKEN = new InjectionToken<object>("branch-service");
			container.startPhase(StartupPhase.FEATURE_SERVICES);
			container.register(TOKEN, {}, { scope: "project" });
			container.endPhase();

			const reg = container.getRegistry().get(TOKEN)!;
			reg.boundProjectId = "proj-alpha";

			await container.setActiveProject("proj-beta");

			const diagnostic = container.diagnose();
			const entry = diagnostic.entries.find(
				(e: DiagnosticEntry) => e.code === "STALE_SERVICE" && e.tokenName === "branch-service",
			);
			expect(entry).toBeDefined();
			expect(entry!.tokenName).toBe("branch-service");
			expect(entry!.phase).toBe(StartupPhase.FEATURE_SERVICES);
			expect(entry!.message).toContain("proj-alpha");
			expect(entry!.message).toContain("proj-beta");
		});

		test("StaleRtkCacheError carries specific apiType and project IDs", () => {
			container.registerRtkApi("github", "github", { isProjectScoped: true });
			const registry = container.getRegistry();

			registry.bindRtkCacheToProject("github", "proj-stale");

			(container as any).activeProjectId = "proj-current";

			try {
				container.checkRtkCacheStale("github");
				expect.unreachable("Expected StaleRtkCacheError");
			} catch (e) {
				expect(e).toBeInstanceOf(StaleRtkCacheError);
				const error = e as StaleRtkCacheError;
				expect(error.name).toBe("StaleRtkCacheError");
				expect(error.message).toContain("github");
				expect(error.message).toContain("proj-stale");
				expect(error.message).toContain("proj-current");
			}
		});

		test("STALE_RTK_CACHE diagnostic entry has apiType and phase", async () => {
			container.startPhase(StartupPhase.RTK_API_CREATION);
			container.registerRtkApi("backend", "backend", { isProjectScoped: true });
			container.endPhase();

			const registry = container.getRegistry();
			registry.bindRtkCacheToProject("backend", "proj-old");

			await container.setActiveProject("proj-new");

			const diagnostic = container.diagnose();
			const entry = diagnostic.entries.find(
				(e: DiagnosticEntry) => e.code === "STALE_RTK_CACHE" && e.apiType === "backend",
			);
			expect(entry).toBeDefined();
			expect(entry!.apiType).toBe("backend");
			expect(entry!.phase).toBe(StartupPhase.RTK_API_CREATION);
			expect(entry!.message).toContain("backend");
			expect(entry!.message).toContain("proj-old");
			expect(entry!.message).toContain("proj-new");
		});
	});
});

class TestProjectService implements ProjectScopedService {
	lastProjectId: string | undefined;
	projectChangeCount = 0;
	resetCount = 0;

	async onProjectChange(projectId: string | undefined): Promise<void> {
		this.lastProjectId = projectId;
		this.projectChangeCount++;
	}

	async reset(): Promise<void> {
		this.resetCount++;
	}
}
