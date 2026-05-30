import { setContext, getContext as svelteGetContext } from "svelte";

/**
 * Angular inspired injection token.
 *
 * @example
 * const STACK_SERVICE = new InjectionToken<StackService>('StackService');
 * provide(STACK_SERVICE, stackService);
 * const stackService = inject(STACK_SERVICE); // of type `StackService`
 */
export class InjectionToken<_T> {
	private readonly _desc: string;
	private readonly _symbol: symbol;

	constructor(desc: string) {
		this._desc = desc;
		this._symbol = Symbol(desc);
	}

	get description(): string {
		return this._desc;
	}

	toString(): string {
		return `InjectionToken(${this._desc})`;
	}

	get _key(): symbol {
		return this._symbol;
	}
}

/**
 * Service lifecycle interface for project-scoped services.
 * Services that cache project-specific state should implement this
 * to properly handle project switches.
 */
export interface ProjectScopedService {
	/**
	 * Called when the active project changes.
	 * Should clear all project-specific cached state.
	 */
	onProjectChange?(projectId: string | undefined): void | Promise<void>;

	/**
	 * Called when the service should reset to its initial state.
	 */
	reset?(): void | Promise<void>;
}

/**
 * Scope of a service registration.
 * - `global`: Service is a singleton for the entire application lifetime
 * - `project`: Service should be reset when the active project changes
 */
export type ServiceScope = "global" | "project";

export type RtkApiType = "backend" | "github" | "gitlab";

export type DiagnosticSeverity = "error" | "warning";

export interface DiagnosticEntry {
	severity: DiagnosticSeverity;
	code: string;
	message: string;
	tokenName?: string;
	apiType?: RtkApiType;
	endpointName?: string;
	phase?: StartupPhase;
	detail?: string;
}

export interface ServiceDiagnostic {
	tokenName: string;
	scope: ServiceScope;
	phase: StartupPhase | null;
	registeredAt: number;
	dependencies: string[];
	rtkDependencies: RtkApiType[];
	boundProjectId?: string;
	endpointSources: EndpointInjection[];
}

export interface RtkApiDiagnostic {
	apiType: RtkApiType;
	reducerPath: string;
	isProjectScoped: boolean;
	createdAt: number;
	boundProjectId?: string;
	endpointInjections: EndpointInjection[];
}

export interface DependencyEdge {
	from: string;
	to: string;
	type: "service" | "rtk";
}

export interface BootstrapDiagnosticResult {
	valid: boolean;
	timestamp: number;
	activeProjectId: string | undefined;
	services: ServiceDiagnostic[];
	rtkApis: RtkApiDiagnostic[];
	dependencyGraph: DependencyEdge[];
	startupOrder: Array<{ phase: StartupPhase; token: string; timestamp: number }>;
	entries: DiagnosticEntry[];
	summary: {
		totalServices: number;
		globalServices: number;
		projectServices: number;
		rtkApis: number;
		endpointInjections: number;
		errorCount: number;
		warningCount: number;
	};
}

/**
 * Metadata about a registered RTK Query API.
 */
export interface RtkApiRegistration {
	apiType: RtkApiType;
	reducerPath: string;
	createdAt: number;
	creationStack?: string;
	isProjectScoped: boolean;
}

/**
 * Metadata about an injected RTK Query endpoint.
 */
export interface EndpointInjection {
	apiType: RtkApiType;
	endpointNames: string[];
	injectedAt: number;
	injectionStack?: string;
	sourceService?: string;
}

/**
 * Metadata about a registered service for debugging and tracing.
 */
export interface ServiceRegistration<T = unknown> {
	token: InjectionToken<T>;
	value: T;
	scope: ServiceScope;
	dependencies: InjectionToken<unknown>[];
	registeredAt: number;
	registrationStack?: string;
	boundProjectId?: string;
	/** RTK APIs this service depends on */
	rtkDependencies: RtkApiType[];
}

/**
 * Startup phase for ordering service initialization.
 */
export enum StartupPhase {
	FOUNDATION = "foundation",
	RTK_API_CREATION = "rtk_api_creation",
	RTK_ENDPOINT_INJECTION = "rtk_endpoint_injection",
	STATE_MANAGEMENT = "state_management",
	CONFIGURATION = "configuration",
	AUTHENTICATION = "authentication",
	CORE_SERVICES = "core_services",
	FEATURE_SERVICES = "feature_services",
	UI_SERVICES = "ui_services",
}

/**
 * Error thrown when a duplicate service registration is detected.
 */
export class DuplicateRegistrationError extends Error {
	constructor(token: InjectionToken<unknown>, existing: ServiceRegistration, newValue: unknown) {
		super(
			`Duplicate registration detected for ${token.toString()}.\n` +
				`Existing registration at: ${existing.registrationStack ?? "unknown"}\n` +
				`New value type: ${typeof newValue}`,
		);
		this.name = "DuplicateRegistrationError";
	}
}

/**
 * Error thrown when a required dependency is missing during startup.
 */
export class MissingDependencyError extends Error {
	constructor(
		token: InjectionToken<unknown>,
		dependentToken?: InjectionToken<unknown>,
	) {
		const msg = dependentToken
			? `Missing dependency ${token.toString()} required by ${dependentToken.toString()}`
			: `Missing required dependency: ${token.toString()}`;
		super(msg);
		this.name = "MissingDependencyError";
	}
}

/**
 * Error thrown when a stale project-scoped service is accessed after project change.
 */
export class StaleServiceError extends Error {
	constructor(token: InjectionToken<unknown>, previousProjectId: string, currentProjectId: string) {
		super(
			`Stale service access detected: ${token.toString()} was created for project ${previousProjectId} ` +
				`but is being accessed in project ${currentProjectId}. ` +
				`Ensure project-scoped services implement ProjectScopedService and reset their state on project change.`,
		);
		this.name = "StaleServiceError";
	}
}

/**
 * Error thrown when RTK cache for a project-scoped API is accessed after project change.
 */
export class StaleRtkCacheError extends Error {
	constructor(apiType: RtkApiType, previousProjectId: string, currentProjectId: string) {
		super(
			`Stale RTK cache access detected: ${apiType} API was used for project ${previousProjectId} ` +
				`but is being accessed in project ${currentProjectId}. ` +
				`RTK cache should be reset when project changes.`,
		);
		this.name = "StaleRtkCacheError";
	}
}

/**
 * Error thrown when endpoint injection order is violated.
 */
export class EndpointInjectionError extends Error {
	constructor(apiType: RtkApiType, endpointName: string, reason: string) {
		super(
			`Endpoint injection error for ${apiType}.${endpointName}: ${reason}`,
		);
		this.name = "EndpointInjectionError";
	}
}

const REGISTRY_TOKEN = Symbol("di_registry");
const CONTAINER_TOKEN = Symbol("di_container");

/**
 * Registry that tracks all service registrations for debugging and validation.
 */
export class ServiceRegistry {
	private registrations = new Map<symbol, ServiceRegistration>();
	private rtkApis = new Map<RtkApiType, RtkApiRegistration>();
	private endpointInjections: EndpointInjection[] = [];
	private rtkCacheProjectBindings = new Map<RtkApiType, string>();
	private staleRtkCacheRecords: Array<{
		apiType: RtkApiType;
		previousProjectId: string;
		currentProjectId: string;
		detectedAt: number;
	}> = [];
	private staleServiceRecords: Array<{
		token: InjectionToken<unknown>;
		previousProjectId: string;
		currentProjectId: string;
		detectedAt: number;
	}> = [];

	register<T>(
		token: InjectionToken<T>,
		value: T,
		scope: ServiceScope = "global",
		dependencies: InjectionToken<unknown>[] = [],
		rtkDependencies: RtkApiType[] = [],
	): void {
		const existing = this.registrations.get(token._key);
		if (existing) {
			throw new DuplicateRegistrationError(token, existing, value);
		}

		const registration: ServiceRegistration<T> = {
			token,
			value,
			scope,
			dependencies,
			rtkDependencies,
			registeredAt: Date.now(),
			registrationStack: new Error().stack?.split("\n").slice(2, 5).join("\n"),
		};

		this.registrations.set(token._key, registration);

		if (typeof window !== "undefined" && (window as any).__DI_DEBUG__) {
			console.debug(`[DI] Registered ${token.toString()} (scope: ${scope})`, {
				dependencies: dependencies.map((d) => d.toString()),
				rtkDependencies,
			});
		}
	}

	/**
	 * Register an RTK Query API for tracking.
	 */
	registerRtkApi(
		apiType: RtkApiType,
		reducerPath: string,
		isProjectScoped: boolean = true,
	): void {
		if (this.rtkApis.has(apiType)) {
			throw new Error(`RTK API ${apiType} already registered`);
		}

		this.rtkApis.set(apiType, {
			apiType,
			reducerPath,
			isProjectScoped,
			createdAt: Date.now(),
			creationStack: new Error().stack?.split("\n").slice(2, 5).join("\n"),
		});

		if (typeof window !== "undefined" && (window as any).__DI_DEBUG__) {
			console.debug(`[DI] Registered RTK API: ${apiType} (project-scoped: ${isProjectScoped})`);
		}
	}

	/**
	 * Track an endpoint injection for an RTK API.
	 */
	trackEndpointInjection(
		apiType: RtkApiType,
		endpointNames: string[],
		sourceService?: string,
	): void {
		const api = this.rtkApis.get(apiType);

		this.endpointInjections.push({
			apiType,
			endpointNames,
			sourceService,
			injectedAt: Date.now(),
			injectionStack: new Error().stack?.split("\n").slice(2, 5).join("\n"),
		});

		if (!api) {
			throw new EndpointInjectionError(
				apiType,
				endpointNames[0] ?? "unknown",
				`RTK API ${apiType} not registered before endpoint injection`,
			);
		}

		if (typeof window !== "undefined" && (window as any).__DI_DEBUG__) {
			console.debug(`[DI] Injected endpoints for ${apiType}:`, endpointNames, {
				source: sourceService ?? "unknown",
			});
		}
	}

	/**
	 * Bind an RTK API cache to a specific project.
	 * Used for stale cache detection.
	 */
	bindRtkCacheToProject(apiType: RtkApiType, projectId: string): void {
		this.rtkCacheProjectBindings.set(apiType, projectId);
	}

	/**
	 * Check if an RTK API cache is stale for the current project.
	 */
	checkRtkCacheStale(apiType: RtkApiType, currentProjectId: string): boolean {
		const boundProjectId = this.rtkCacheProjectBindings.get(apiType);
		if (!boundProjectId) return false;
		return boundProjectId !== currentProjectId;
	}

	/**
	 * Get the project ID bound to an RTK API cache.
	 */
	getRtkCacheBoundProject(apiType: RtkApiType): string | undefined {
		return this.rtkCacheProjectBindings.get(apiType);
	}

	/**
	 * Clear all RTK cache project bindings.
	 */
	clearRtkCacheBindings(): void {
		this.rtkCacheProjectBindings.clear();
	}

	/**
	 * Record a stale RTK cache detection for diagnostic purposes.
	 */
	recordStaleRtkCache(
		apiType: RtkApiType,
		previousProjectId: string,
		currentProjectId: string,
	): void {
		this.staleRtkCacheRecords.push({
			apiType,
			previousProjectId,
			currentProjectId,
			detectedAt: Date.now(),
		});
	}

	/**
	 * Record a stale service detection for diagnostic purposes.
	 */
	recordStaleService(
		token: InjectionToken<unknown>,
		previousProjectId: string,
		currentProjectId: string,
	): void {
		this.staleServiceRecords.push({
			token,
			previousProjectId,
			currentProjectId,
			detectedAt: Date.now(),
		});
	}

	/**
	 * Get all stale RTK cache records.
	 */
	getStaleRtkCacheRecords() {
		return [...this.staleRtkCacheRecords];
	}

	/**
	 * Get all stale service records.
	 */
	getStaleServiceRecords() {
		return [...this.staleServiceRecords];
	}

	get<T>(token: InjectionToken<T>): ServiceRegistration<T> | undefined {
		return this.registrations.get(token._key) as ServiceRegistration<T> | undefined;
	}

	has(token: InjectionToken<unknown>): boolean {
		return this.registrations.has(token._key);
	}

	getAllRegistrations(): ServiceRegistration[] {
		return Array.from(this.registrations.values());
	}

	getByScope(scope: ServiceScope): ServiceRegistration[] {
		return this.getAllRegistrations().filter((r) => r.scope === scope);
	}

	getRtkApis(): RtkApiRegistration[] {
		return Array.from(this.rtkApis.values());
	}

	getEndpointInjections(): EndpointInjection[] {
		return [...this.endpointInjections];
	}

	getEndpointInjectionsForApi(apiType: RtkApiType): EndpointInjection[] {
		return this.endpointInjections.filter((e) => e.apiType === apiType);
	}

	/**
	 * Validate that all required dependencies are present for a given token.
	 * Throws MissingDependencyError if any dependency is missing.
	 */
	validateDependencies(token: InjectionToken<unknown>): void {
		const registration = this.get(token);
		if (!registration) return;

		for (const dep of registration.dependencies) {
			if (!this.has(dep)) {
				throw new MissingDependencyError(dep, token);
			}
		}

		for (const rtkDep of registration.rtkDependencies) {
			if (!this.rtkApis.has(rtkDep)) {
				throw new MissingDependencyError(
					new InjectionToken(`RTK API: ${rtkDep}`) as InjectionToken<unknown>,
					token,
				);
			}
		}
	}

	/**
	 * Validate all registrations have their dependencies satisfied.
	 * Returns list of missing dependencies.
	 */
	validateAll(): MissingDependencyError[] {
		const errors: MissingDependencyError[] = [];
		for (const registration of this.registrations.values()) {
			try {
				this.validateDependencies(registration.token);
			} catch (e) {
				if (e instanceof MissingDependencyError) {
					errors.push(e);
				}
			}
		}
		return errors;
	}

	clear(): void {
		this.registrations.clear();
		this.rtkApis.clear();
		this.endpointInjections = [];
		this.rtkCacheProjectBindings.clear();
	}
}

/**
 * DI Container that manages service registration, lifecycle, and dependency tracking.
 */
export class DIContainer {
	private registry = new ServiceRegistry();
	private startupLog: { phase: StartupPhase; token: string; timestamp: number }[] = [];
	private currentPhase: StartupPhase | null = null;
	private activeProjectId: string | undefined;
	private rtkApiResetHandlers = new Map<RtkApiType, () => void>();

	constructor() {
		if (typeof window !== "undefined") {
			(window as any).__DI_REGISTRY__ = this.registry;
			(window as any).__DI_CONTAINER__ = this;
		}
	}

	/**
	 * Begin a startup phase. All registrations within this phase will be logged together.
	 */
	startPhase(phase: StartupPhase): void {
		this.currentPhase = phase;
		if (typeof window !== "undefined" && (window as any).__DI_DEBUG__) {
			console.debug(`[DI] === Starting phase: ${phase} ===`);
		}
	}

	/**
	 * End the current startup phase.
	 */
	endPhase(): void {
		if (this.currentPhase && typeof window !== "undefined" && (window as any).__DI_DEBUG__) {
			console.debug(`[DI] === Completed phase: ${this.currentPhase} ===`);
		}
		this.currentPhase = null;
	}

	/**
	 * Register a service with the container.
	 */
	register<T>(
		token: InjectionToken<T>,
		value: T,
		options: {
			scope?: ServiceScope;
			dependencies?: InjectionToken<unknown>[];
			rtkDependencies?: RtkApiType[];
			boundProjectId?: string;
		} = {},
	): void {
		const {
			scope = "global",
			dependencies = [],
			rtkDependencies = [],
			boundProjectId,
		} = options;

		this.registry.register(token, value, scope, dependencies, rtkDependencies);

		const registration = this.registry.get(token);
		if (registration && boundProjectId) {
			registration.boundProjectId = boundProjectId;
		}

		if (this.currentPhase) {
			this.startupLog.push({
				phase: this.currentPhase,
				token: token.description,
				timestamp: Date.now(),
			});
		}

		provide(token, value);
	}

	/**
	 * Register an RTK Query API with the container.
	 */
	registerRtkApi(
		apiType: RtkApiType,
		reducerPath: string,
		options: {
			isProjectScoped?: boolean;
			resetHandler?: () => void;
		} = {},
	): void {
		const { isProjectScoped = true, resetHandler } = options;

		this.registry.registerRtkApi(apiType, reducerPath, isProjectScoped);

		if (resetHandler) {
			this.rtkApiResetHandlers.set(apiType, resetHandler);
		}

		if (this.currentPhase) {
			this.startupLog.push({
				phase: this.currentPhase,
				token: `RTK_API:${apiType}`,
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Track an endpoint injection for an RTK API.
	 */
	trackEndpointInjection(
		apiType: RtkApiType,
		endpointNames: string[],
		sourceService?: string,
	): void {
		if (this.currentPhase) {
			this.startupLog.push({
				phase: this.currentPhase,
				token: `ENDPOINT:${apiType}:${endpointNames.join(",")}`,
				timestamp: Date.now(),
			});
		}

		this.registry.trackEndpointInjection(apiType, endpointNames, sourceService);
	}

	/**
	 * Register a reset handler for an RTK API.
	 */
	setRtkApiResetHandler(apiType: RtkApiType, handler: () => void): void {
		this.rtkApiResetHandlers.set(apiType, handler);
	}

	/**
	 * Reset a specific RTK API cache.
	 */
	resetRtkApi(apiType: RtkApiType): void {
		const handler = this.rtkApiResetHandlers.get(apiType);
		if (handler) {
			handler();
		}

		const api = this.registry.getRtkApis().find((a) => a.apiType === apiType);
		if (api?.isProjectScoped) {
			if (this.activeProjectId) {
				this.registry.bindRtkCacheToProject(apiType, this.activeProjectId);
			}
		}

		if (typeof window !== "undefined" && (window as any).__DI_DEBUG__) {
			console.debug(`[DI] Reset RTK API cache: ${apiType}`);
		}
	}

	/**
	 * Reset all project-scoped RTK API caches.
	 */
	resetProjectScopedRtkApis(): void {
		const projectScopedApis = this.registry.getRtkApis().filter((a) => a.isProjectScoped);
		for (const api of projectScopedApis) {
			this.resetRtkApi(api.apiType);
		}
	}

	/**
	 * Check if an RTK API cache is stale for the current project.
	 * Throws StaleRtkCacheError if stale.
	 */
	checkRtkCacheStale(apiType: RtkApiType): void {
		if (!this.activeProjectId) return;

		if (this.registry.checkRtkCacheStale(apiType, this.activeProjectId)) {
			const previousProjectId = this.registry.getRtkCacheBoundProject(apiType);
			throw new StaleRtkCacheError(apiType, previousProjectId ?? "unknown", this.activeProjectId);
		}
	}

	/**
	 * Register multiple services at once.
	 */
	registerAll(
		entries: Array<{
			token: InjectionToken<unknown>;
			value: unknown;
			scope?: ServiceScope;
			dependencies?: InjectionToken<unknown>[];
			rtkDependencies?: RtkApiType[];
		}>,
	): void {
		for (const entry of entries) {
			this.register(entry.token, entry.value, {
				scope: entry.scope,
				dependencies: entry.dependencies,
				rtkDependencies: entry.rtkDependencies,
			});
		}
	}

	/**
	 * Get a service from the container.
	 * Throws if the service is not registered or is stale.
	 */
	get<T>(token: InjectionToken<T>): T {
		const registration = this.registry.get(token);
		if (!registration) {
			throw new MissingDependencyError(token);
		}
		if (registration.scope === "project" && registration.boundProjectId) {
			if (this.activeProjectId && registration.boundProjectId !== this.activeProjectId) {
				throw new StaleServiceError(token, registration.boundProjectId, this.activeProjectId);
			}
		}
		return inject(token);
	}

	/**
	 * Check if a service is registered.
	 */
	has(token: InjectionToken<unknown>): boolean {
		return this.registry.has(token);
	}

	/**
	 * Validate all dependencies are satisfied.
	 * Should be called after all registrations are complete.
	 */
	validate(): { valid: boolean; errors: MissingDependencyError[]; report: string; diagnostic: BootstrapDiagnosticResult } {
		const diagnostic = this.diagnose();
		const errors = this.registry.validateAll();

		const report = this.formatDiagnosticReport(diagnostic);

		if (typeof window !== "undefined" && (window as any).__DI_DEBUG__) {
			console.log(report);
		}

		return { valid: errors.length === 0, errors, report, diagnostic };
	}

	/**
	 * Produce a full structured diagnostic of the container state.
	 */
	diagnose(): BootstrapDiagnosticResult {
		const registrations = this.registry.getAllRegistrations();
		const rtkApis = this.registry.getRtkApis();
		const endpointInjections = this.registry.getEndpointInjections();
		const entries: DiagnosticEntry[] = [];

		const phaseMap = new Map<string, StartupPhase | null>();
		for (const log of this.startupLog) {
			phaseMap.set(log.token, log.phase);
		}

		const services: ServiceDiagnostic[] = registrations.map((r) => {
			const tokenName = r.token.description;
			const rtkDeps = r.rtkDependencies;
			for (const rtkDep of rtkDeps) {
				if (!this.registry.getRtkApis().find((a) => a.apiType === rtkDep)) {
					entries.push({
						severity: "error",
						code: "MISSING_RTK_DEPENDENCY",
						message: `Service "${tokenName}" depends on RTK API "${rtkDep}" which is not registered`,
						tokenName,
						apiType: rtkDep,
						phase: phaseMap.get(tokenName) ?? undefined,
					});
				}
			}

			const epSources = endpointInjections.filter((e) => e.sourceService === tokenName);

			return {
				tokenName,
				scope: r.scope,
				phase: phaseMap.get(tokenName) ?? null,
				registeredAt: r.registeredAt,
				dependencies: r.dependencies.map((d) => d.description),
				rtkDependencies: rtkDeps,
				boundProjectId: r.boundProjectId,
				endpointSources: epSources,
			};
		});

		for (const injection of endpointInjections) {
			const apiReg = rtkApis.find((a) => a.apiType === injection.apiType);
			if (!apiReg) {
				for (const epName of injection.endpointNames) {
					entries.push({
						severity: "error",
						code: "ENDPOINT_BEFORE_API",
						message: `Endpoint "${epName}" injected before RTK API "${injection.apiType}" was created`,
						apiType: injection.apiType,
						endpointName: epName,
						detail: injection.injectionStack,
					});
				}
			} else if (injection.injectedAt < apiReg.createdAt) {
				const epPhase = phaseMap.get(`ENDPOINT:${injection.apiType}:${injection.endpointNames.join(",")}`);
				for (const epName of injection.endpointNames) {
					const phaseMsg = epPhase ? ` during phase "${epPhase}"` : "";
					entries.push({
						severity: "error",
						code: "ENDPOINT_BEFORE_API",
						message: `Endpoint "${epName}" was injected${phaseMsg} at ${new Date(injection.injectedAt).toISOString()} but RTK API "${injection.apiType}" was created later at ${new Date(apiReg.createdAt).toISOString()}`,
						apiType: injection.apiType,
						endpointName: epName,
						phase: epPhase ?? undefined,
						detail: injection.injectionStack,
					});
				}
			}
			const apiPhase = phaseMap.get(`RTK_API:${injection.apiType}`);
			const epPhase = phaseMap.get(`ENDPOINT:${injection.apiType}:${injection.endpointNames.join(",")}`);
			if (apiPhase && epPhase) {
				const phaseOrder = Object.values(StartupPhase);
				if (phaseOrder.indexOf(epPhase) < phaseOrder.indexOf(apiPhase)) {
					for (const epName of injection.endpointNames) {
						entries.push({
							severity: "error",
							code: "ENDPOINT_BEFORE_API",
							message: `Endpoint "${epName}" was injected during phase "${epPhase}" but API "${injection.apiType}" was created in phase "${apiPhase}"`,
							apiType: injection.apiType,
							endpointName: epName,
							phase: epPhase,
						});
					}
				}
			}
		}

		if (this.activeProjectId) {
			for (const reg of registrations) {
				if (reg.scope === "project" && reg.boundProjectId && reg.boundProjectId !== this.activeProjectId) {
					entries.push({
						severity: "error",
						code: "STALE_SERVICE",
						message: `Service "${reg.token.description}" is bound to project "${reg.boundProjectId}" but active project is "${this.activeProjectId}"`,
						tokenName: reg.token.description,
						phase: phaseMap.get(reg.token.description) ?? undefined,
					});
				}
			}

			for (const api of rtkApis) {
				if (api.isProjectScoped) {
					const boundProject = this.registry.getRtkCacheBoundProject(api.apiType);
					if (boundProject && boundProject !== this.activeProjectId) {
						entries.push({
							severity: "error",
							code: "STALE_RTK_CACHE",
							message: `RTK API "${api.apiType}" cache is bound to project "${boundProject}" but active project is "${this.activeProjectId}"`,
							apiType: api.apiType,
							phase: phaseMap.get(`RTK_API:${api.apiType}`) ?? undefined,
						});
					}
				}
			}
		}

		for (const record of this.registry.getStaleServiceRecords()) {
			entries.push({
				severity: "error",
				code: "STALE_SERVICE",
				message: `Service "${record.token.description}" was bound to project "${record.previousProjectId}" but was accessed in project "${record.currentProjectId}"`,
				tokenName: record.token.description,
				phase: phaseMap.get(record.token.description) ?? undefined,
			});
		}

		for (const record of this.registry.getStaleRtkCacheRecords()) {
			entries.push({
				severity: "error",
				code: "STALE_RTK_CACHE",
				message: `RTK API "${record.apiType}" cache was bound to project "${record.previousProjectId}" but was accessed in project "${record.currentProjectId}"`,
				apiType: record.apiType,
				phase: phaseMap.get(`RTK_API:${record.apiType}`) ?? undefined,
			});
		}

		for (const reg of registrations) {
			for (const dep of reg.dependencies) {
				if (!this.registry.has(dep)) {
					entries.push({
						severity: "error",
						code: "MISSING_DEPENDENCY",
						message: `Service "${reg.token.description}" depends on "${dep.description}" which is not registered`,
						tokenName: reg.token.description,
						phase: phaseMap.get(reg.token.description) ?? undefined,
					});
				}
			}
		}

		const rtkApiDiagnostics: RtkApiDiagnostic[] = rtkApis.map((api) => ({
			apiType: api.apiType,
			reducerPath: api.reducerPath,
			isProjectScoped: api.isProjectScoped,
			createdAt: api.createdAt,
			boundProjectId: this.registry.getRtkCacheBoundProject(api.apiType),
			endpointInjections: endpointInjections.filter((e) => e.apiType === api.apiType),
		}));

		const dependencyGraph: DependencyEdge[] = [];
		for (const reg of registrations) {
			for (const dep of reg.dependencies) {
				dependencyGraph.push({
					from: reg.token.description,
					to: dep.description,
					type: "service",
				});
			}
			for (const rtkDep of reg.rtkDependencies) {
				dependencyGraph.push({
					from: reg.token.description,
					to: `RTK:${rtkDep}`,
					type: "rtk",
				});
			}
		}

		const globalServices = registrations.filter((r) => r.scope === "global");
		const projectServices = registrations.filter((r) => r.scope === "project");
		const errorCount = entries.filter((e) => e.severity === "error").length;
		const warningCount = entries.filter((e) => e.severity === "warning").length;

		return {
			valid: errorCount === 0,
			timestamp: Date.now(),
			activeProjectId: this.activeProjectId,
			services,
			rtkApis: rtkApiDiagnostics,
			dependencyGraph,
			startupOrder: [...this.startupLog],
			entries,
			summary: {
				totalServices: registrations.length,
				globalServices: globalServices.length,
				projectServices: projectServices.length,
				rtkApis: rtkApis.length,
				endpointInjections: endpointInjections.length,
				errorCount,
				warningCount,
			},
		};
	}

	private formatDiagnosticReport(d: BootstrapDiagnosticResult): string {
		const lines = [
			"=== DI Container Validation Report ===",
			`Total services: ${d.summary.totalServices}`,
			`  Global scope: ${d.summary.globalServices}`,
			`  Project scope: ${d.summary.projectServices}`,
			`RTK APIs: ${d.summary.rtkApis}`,
			...d.rtkApis.map((a) => {
				const scope = a.isProjectScoped ? "project" : "global";
				const bound = a.boundProjectId ? ` [bound: ${a.boundProjectId}]` : "";
				return `  [${scope}] ${a.apiType} (${a.reducerPath})${bound}`;
			}),
			`Endpoint injections: ${d.summary.endpointInjections}`,
			...d.rtkApis.flatMap((a) =>
				a.endpointInjections.map((e) => {
					const src = e.sourceService ? ` (from ${e.sourceService})` : "";
					return `  ${a.apiType}: ${e.endpointNames.join(", ")}${src}`;
				}),
			),
			`Validation: ${d.valid ? "PASSED" : "FAILED"} (${d.summary.errorCount} errors, ${d.summary.warningCount} warnings)`,
			...d.entries.map((e) => `  ${e.severity === "error" ? "✗" : "⚠"} [${e.code}] ${e.message}`),
			"",
			"=== Startup Order ===",
			...d.startupOrder.map(
				(log) => `  [${log.phase}] ${log.token} @ ${new Date(log.timestamp).toISOString()}`,
			),
			"",
			"=== Dependency Graph ===",
			...d.dependencyGraph.map((e) => `  ${e.from} --${e.type}--> ${e.to}`),
		];
		return lines.join("\n");
	}

	/**
	 * Get the current active project ID.
	 */
	getActiveProjectId(): string | undefined {
		return this.activeProjectId;
	}

	/**
	 * Set the active project and notify all project-scoped services.
	 * Also resets all project-scoped RTK API caches.
	 */
	async setActiveProject(projectId: string | undefined): Promise<void> {
		const previousProjectId = this.activeProjectId;
		this.activeProjectId = projectId;

		if (typeof window !== "undefined" && (window as any).__DI_DEBUG__) {
			console.debug(`[DI] Project change: ${previousProjectId ?? "none"} -> ${projectId ?? "none"}`);
		}

		if (projectId) {
			for (const api of this.registry.getRtkApis()) {
				if (api.isProjectScoped) {
					const boundProject = this.registry.getRtkCacheBoundProject(api.apiType);
					if (boundProject && boundProject !== projectId) {
						this.registry.recordStaleRtkCache(api.apiType, boundProject, projectId);
					}
				}
			}
			this.resetProjectScopedRtkApis();
		} else {
			this.registry.clearRtkCacheBindings();
		}

		const projectServices = this.registry.getByScope("project");
		for (const registration of projectServices) {
			if (
				registration.boundProjectId &&
				projectId &&
				registration.boundProjectId !== projectId
			) {
				this.registry.recordStaleService(
					registration.token,
					registration.boundProjectId,
					projectId,
				);
			}
			const service = registration.value as ProjectScopedService;
			if (typeof service.onProjectChange === "function") {
				try {
					await service.onProjectChange(projectId);
				} catch (e) {
					console.error(
						`[DI] Error in onProjectChange for ${registration.token.toString()}:`,
						e,
					);
				}
			}
		}
	}

	/**
	 * Reset all project-scoped services to their initial state.
	 * Also resets all project-scoped RTK API caches.
	 */
	async resetProjectServices(): Promise<void> {
		this.resetProjectScopedRtkApis();

		const projectServices = this.registry.getByScope("project");
		for (const registration of projectServices) {
			const service = registration.value as ProjectScopedService;
			if (typeof service.reset === "function") {
				try {
					await service.reset();
				} catch (e) {
					console.error(`[DI] Error resetting ${registration.token.toString()}:`, e);
				}
			}
		}
	}

	/**
	 * Get a diagnostic report of the container state.
	 */
	getDiagnosticReport(): string {
		const registrations = this.registry.getAllRegistrations();
		const rtkApis = this.registry.getRtkApis();
		const endpointInjections = this.registry.getEndpointInjections();

		const lines = [
			"=== DI Container Diagnostic Report ===",
			`Active Project: ${this.activeProjectId ?? "none"}`,
			`Current Phase: ${this.currentPhase ?? "none"}`,
			"",
			"Registered Services:",
			...registrations.map((r) => {
				const deps = r.dependencies.length > 0 ? ` -> [${r.dependencies.map((d) => d.description).join(", ")}]` : "";
				const rtkDeps = r.rtkDependencies.length > 0 ? ` [RTK: ${r.rtkDependencies.join(", ")}]` : "";
				const projectBinding = r.boundProjectId ? ` [bound: ${r.boundProjectId}]` : "";
				return `  [${r.scope}] ${r.token.description}${deps}${rtkDeps}${projectBinding}`;
			}),
			"",
			"RTK APIs:",
			...rtkApis.map((a) => {
				const boundProject = this.registry.getRtkCacheBoundProject(a.apiType);
				const bound = boundProject ? ` [bound: ${boundProject}]` : "";
				return `  [${a.isProjectScoped ? "project" : "global"}] ${a.apiType} (${a.reducerPath})${bound}`;
			}),
			"",
			"Endpoint Injections:",
			...endpointInjections.map((e) => {
				const source = e.sourceService ? ` (from ${e.sourceService})` : "";
				return `  ${e.apiType}: ${e.endpointNames.join(", ")}${source}`;
			}),
		];
		return lines.join("\n");
	}

	/**
	 * Get the underlying registry for advanced operations.
	 */
	getRegistry(): ServiceRegistry {
		return this.registry;
	}
}

/**
 * Provides a value for an injection token
 */
export function provide<T>(token: InjectionToken<T>, value: T): void {
	try {
		setContext(token._key, value);
	} catch (e) {
		if (typeof window !== "undefined" && (window as any).__DI_DEBUG__) {
			console.debug(`[DI] Skipping setContext for ${token.description}: not in component initialization`);
		}
	}
}

/**
 * Provides many injectables in one call.
 */
export function provideAll(entries: [InjectionToken<any>, any][]) {
	for (const [token, value] of entries) {
		provide(token, value);
	}
}

/**
 * An injector for use with `InjectionToken` rather than `Constructor`.
 */
export function inject<T>(token: InjectionToken<T>): T {
	try {
		const value = svelteGetContext<T>(token._key);
		if (value !== undefined) {
			return value;
		}
	} catch (e) {
		if (typeof window !== "undefined" && (window as any).__DI_DEBUG__) {
			console.debug(`[DI] getContext failed for ${token.description}:`, e);
		}
	}
	const registry =
		typeof window !== "undefined" ? (window as any).__DI_REGISTRY__ as ServiceRegistry | undefined : undefined;
	if (registry) {
		const reg = registry.get(token);
		if (reg) {
			return reg.value as T;
		}
	}
	const registered = registry?.getAllRegistrations().map((r) => r.token.toString()).join(", ");
	throw new Error(
		`No provider found for ${token.toString()}.\n` +
			(registered ? `Registered services: ${registered}` : "No services registered yet."),
	);
}

/**
 * Injects a value using an injection token with a fallback
 * Returns the default value if the token is not found
 */
export function injectOptional<T>(token: InjectionToken<T>, defaultValue: T): T {
	const value = svelteGetContext<T>(token._key);
	return value !== undefined ? value : defaultValue;
}

/**
 * Create a new DI Container and register it in the context.
 * This should be called once at application startup.
 */
export function createContainer(): DIContainer {
	const container = new DIContainer();
	setContext(CONTAINER_TOKEN, container);
	setContext(REGISTRY_TOKEN, container.getRegistry());
	return container;
}

/**
 * Get the current DI Container from the context.
 */
export function getContainer(): DIContainer {
	const container = svelteGetContext<DIContainer | undefined>(CONTAINER_TOKEN);
	if (!container) {
		throw new Error("DI Container not initialized. Call createContainer() first.");
	}
	return container;
}

/**
 * Enable DI debug logging.
 */
export function enableDebugLogging(): void {
	if (typeof window !== "undefined") {
		(window as any).__DI_DEBUG__ = true;
	}
}

/**
 * Wraps an RTK Query API to track endpoint injections.
 * This should be used when creating RTK Query APIs to ensure all
 * endpoint injections are tracked in the DI container.
 */
export function trackRtkEndpointInjections<TApi extends { injectEndpoints: any }>(
	api: TApi,
	apiType: RtkApiType,
): TApi {
	const originalInjectEndpoints = api.injectEndpoints.bind(api);

	api.injectEndpoints = function (options: any) {
		const result = originalInjectEndpoints(options);
		const endpointNames = Object.keys(options.endpoints({}));

		try {
			const container = getContainer();
			const stack = new Error().stack;
			let sourceService: string | undefined;
			if (stack) {
				const match = stack.match(/at new (\w+)/);
				if (match) {
					sourceService = match[1];
				}
			}
			container.trackEndpointInjection(apiType, endpointNames, sourceService);
		} catch (e) {
			// Container might not be initialized yet during testing
			if (typeof window !== "undefined" && (window as any).__DI_DEBUG__) {
				console.debug(`[DI] Could not track endpoint injection for ${apiType}:`, e);
			}
		}

		return result;
	};

	return api;
}
