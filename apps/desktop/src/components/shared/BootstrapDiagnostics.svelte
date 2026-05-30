<script lang="ts">
	import type {
		BootstrapDiagnosticResult,
		DiagnosticEntry,
		ServiceDiagnostic,
		RtkApiDiagnostic,
	} from "@gitbutler/core/context";

	type Props = {
		diagnostic: BootstrapDiagnosticResult;
	};

	const { diagnostic }: Props = $props();

	let activeTab = $state<"errors" | "services" | "rtk" | "graph">("errors");
	let searchFilter = $state("");
	let expandedServices = $state<Set<string>>(new Set());

	const errors = $derived(diagnostic.entries.filter((e) => e.severity === "error"));
	const warnings = $derived(diagnostic.entries.filter((e) => e.severity === "warning"));

	const filteredServices = $derived(
		diagnostic.services.filter((s) =>
			searchFilter
				? s.tokenName.toLowerCase().includes(searchFilter.toLowerCase()) ||
					s.dependencies.some((d) => d.toLowerCase().includes(searchFilter.toLowerCase()))
				: true,
		),
	);

	const filteredRtkApis = $derived(
		diagnostic.rtkApis.filter((a) =>
			searchFilter
				? a.apiType.toLowerCase().includes(searchFilter.toLowerCase()) ||
					a.endpointInjections.some((e) =>
						e.endpointNames.some((n) => n.toLowerCase().includes(searchFilter.toLowerCase())),
					)
				: true,
		),
	);

	function toggleService(name: string) {
		const next = new Set(expandedServices);
		if (next.has(name)) {
			next.delete(name);
		} else {
			next.add(name);
		}
		expandedServices = next;
	}

	function formatTime(ts: number): string {
		return new Date(ts).toISOString().split("T")[1]?.slice(0, 12) ?? String(ts);
	}

	function severityIcon(s: string): string {
		return s === "error" ? "✗" : "⚠";
	}

	function codeColor(code: string): string {
		if (code.startsWith("STALE")) return "var(--color-orange-500, #f97316)";
		if (code.startsWith("MISSING")) return "var(--color-red-500, #ef4444)";
		if (code.startsWith("DUPLICATE")) return "var(--color-red-500, #ef4444)";
		if (code.startsWith("ENDPOINT")) return "var(--color-amber-500, #f59e0b)";
		return "var(--text-2)";
	}
</script>

<div class="diagnostic-panel">
	<div class="diagnostic-header">
		<div class="header-row">
			<h2 class="title">Bootstrap Diagnostic</h2>
			<span class="badge" class:error={errors.length > 0} class:ok={errors.length === 0}>
				{errors.length === 0 ? "PASSED" : `${errors.length} ERROR${errors.length > 1 ? "S" : ""}`}
			</span>
		</div>
		<p class="subtitle">
			{diagnostic.summary.totalServices} services
			({diagnostic.summary.globalServices} global, {diagnostic.summary.projectServices} project)
			· {diagnostic.summary.rtkApis} RTK APIs
			· {diagnostic.summary.endpointInjections} endpoint injections
			{#if diagnostic.activeProjectId}
				· project: {diagnostic.activeProjectId}
			{/if}
		</p>
	</div>

	<div class="tab-bar">
		<button class="tab" class:active={activeTab === "errors"} onclick={() => (activeTab = "errors")}>
			Errors {errors.length > 0 ? `(${errors.length})` : ""}
		</button>
		<button class="tab" class:active={activeTab === "services"} onclick={() => (activeTab = "services")}>
			Services ({diagnostic.summary.totalServices})
		</button>
		<button class="tab" class:active={activeTab === "rtk"} onclick={() => (activeTab = "rtk")}>
			RTK APIs ({diagnostic.summary.rtkApis})
		</button>
		<button class="tab" class:active={activeTab === "graph"} onclick={() => (activeTab = "graph")}>
			Dependency Graph
		</button>
	</div>

	<div class="tab-content">
		{#if activeTab === "errors"}
			<div class="errors-list">
				{#if diagnostic.entries.length === 0}
					<div class="empty-state">No diagnostic issues found.</div>
				{:else}
					{#each diagnostic.entries as entry}
						<div class="entry-row" class:error-entry={entry.severity === "error"} class:warn-entry={entry.severity === "warning"}>
							<span class="severity-icon">{severityIcon(entry.severity)}</span>
							<span class="entry-code" style="color: {codeColor(entry.code)}">[{entry.code}]</span>
							<span class="entry-message">{entry.message}</span>
							{#if entry.tokenName}
								<span class="entry-tag">token: {entry.tokenName}</span>
							{/if}
							{#if entry.apiType}
								<span class="entry-tag">api: {entry.apiType}</span>
							{/if}
							{#if entry.endpointName}
								<span class="entry-tag">endpoint: {entry.endpointName}</span>
							{/if}
							{#if entry.phase}
								<span class="entry-tag">phase: {entry.phase}</span>
							{/if}
							{#if entry.detail}
								<details class="entry-detail">
									<summary>Stack trace</summary>
									<pre>{entry.detail}</pre>
								</details>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		{:else if activeTab === "services"}
			<div class="filter-bar">
				<input
					type="text"
					placeholder="Filter services..."
					bind:value={searchFilter}
					class="filter-input"
				/>
			</div>
			<div class="services-list">
				{#each filteredServices as svc}
					<div class="service-row" class:project-scope={svc.scope === "project"}>
						<button class="service-toggle" onclick={() => toggleService(svc.tokenName)}>
							<span class="toggle-arrow" class:expanded={expandedServices.has(svc.tokenName)}>▶</span>
							<span class="scope-badge" class:global={svc.scope === "global"} class:project={svc.scope === "project"}>
								{svc.scope}
							</span>
							<span class="service-name">{svc.tokenName}</span>
							{#if svc.phase}
								<span class="phase-tag">{svc.phase}</span>
							{/if}
							{#if svc.rtkDependencies.length > 0}
								<span class="rtk-tag">RTK: {svc.rtkDependencies.join(", ")}</span>
							{/if}
							{#if svc.boundProjectId}
								<span class="bound-tag">bound: {svc.boundProjectId}</span>
							{/if}
						</button>
						{#if expandedServices.has(svc.tokenName)}
							<div class="service-detail">
								<div class="detail-section">
									<span class="detail-label">Registered:</span>
									<span>{formatTime(svc.registeredAt)}</span>
								</div>
								{#if svc.dependencies.length > 0}
									<div class="detail-section">
										<span class="detail-label">Dependencies:</span>
										<div class="dep-list">
											{#each svc.dependencies as dep}
												<span class="dep-chip">{dep}</span>
											{/each}
										</div>
									</div>
								{/if}
								{#if svc.rtkDependencies.length > 0}
									<div class="detail-section">
										<span class="detail-label">RTK Dependencies:</span>
										<div class="dep-list">
											{#each svc.rtkDependencies as rtk}
												<span class="dep-chip rtk">{rtk}</span>
											{/each}
										</div>
									</div>
								{/if}
								{#if svc.endpointSources.length > 0}
									<div class="detail-section">
										<span class="detail-label">Endpoint Sources:</span>
										<div class="dep-list">
											{#each svc.endpointSources as src}
												<span class="dep-chip endpoint"
													>{src.apiType}: {src.endpointNames.join(", ")}</span
												>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else if activeTab === "rtk"}
			<div class="filter-bar">
				<input
					type="text"
					placeholder="Filter RTK APIs..."
					bind:value={searchFilter}
					class="filter-input"
				/>
			</div>
			<div class="rtk-list">
				{#each filteredRtkApis as api}
					<div class="rtk-row">
						<div class="rtk-header">
							<span class="scope-badge" class:global={!api.isProjectScoped} class:project={api.isProjectScoped}>
								{api.isProjectScoped ? "project" : "global"}
							</span>
							<span class="rtk-name">{api.apiType}</span>
							<span class="rtk-path">reducerPath: {api.reducerPath}</span>
							{#if api.boundProjectId}
								<span class="bound-tag">bound: {api.boundProjectId}</span>
							{/if}
						</div>
						{#if api.endpointInjections.length > 0}
							<div class="rtk-endpoints">
								<span class="detail-label">Injected endpoints:</span>
								{#each api.endpointInjections as injection}
									<div class="endpoint-row">
										<span class="endpoint-names">{injection.endpointNames.join(", ")}</span>
										{#if injection.sourceService}
											<span class="endpoint-source">from {injection.sourceService}</span>
										{/if}
										<span class="endpoint-time">{formatTime(injection.injectedAt)}</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else if activeTab === "graph"}
			<div class="graph-view">
				<div class="graph-legend">
					<span class="legend-item"><span class="legend-line service-line"></span> service dependency</span>
					<span class="legend-item"><span class="legend-line rtk-line"></span> RTK API dependency</span>
				</div>
				<pre class="graph-content">{#each diagnostic.dependencyGraph as edge}{edge.from} --{edge.type}--> {edge.to}\n{/each}</pre>
			</div>
		{/if}
	</div>
</div>

<style lang="postcss">
	.diagnostic-panel {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
		font-family: var(--font-family-mono, monospace);
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-1);
		background: var(--bg-1);
		border: 1px solid var(--border-2);
		border-radius: 8px;
		max-height: 80vh;
		overflow-y: auto;
	}

	.diagnostic-header {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.header-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.title {
		font-size: 16px;
		font-weight: 600;
		margin: 0;
	}

	.badge {
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 600;
		&.ok {
			color: var(--color-green-600, #16a34a);
			background: var(--color-green-100, #dcfce7);
		}
		&.error {
			color: var(--color-red-600, #dc2626);
			background: var(--color-red-100, #fee2e2);
		}
	}

	.subtitle {
		margin: 0;
		color: var(--text-2);
		font-size: 12px;
	}

	.tab-bar {
		display: flex;
		gap: 2px;
		border-bottom: 1px solid var(--border-2);
	}

	.tab {
		padding: 6px 12px;
		border: none;
		background: none;
		cursor: pointer;
		font-size: 12px;
		color: var(--text-2);
		border-bottom: 2px solid transparent;
		&.active {
			color: var(--text-1);
			border-bottom-color: var(--color-blue-500, #3b82f6);
		}
		&:hover {
			color: var(--text-1);
		}
	}

	.tab-content {
		min-height: 200px;
	}

	.errors-list,
	.services-list,
	.rtk-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.entry-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 6px;
		padding: 6px 8px;
		border-radius: 4px;
		&.error-entry {
			background: var(--color-red-50, #fef2f2);
			border-left: 3px solid var(--color-red-500, #ef4444);
		}
		&.warn-entry {
			background: var(--color-amber-50, #fffbeb);
			border-left: 3px solid var(--color-amber-500, #f59e0b);
		}
	}

	.severity-icon {
		font-weight: 700;
	}

	.entry-code {
		font-weight: 600;
		white-space: nowrap;
	}

	.entry-message {
		flex: 1;
	}

	.entry-tag {
		padding: 1px 6px;
		border-radius: 3px;
		font-size: 10px;
		background: var(--bg-3, #f5f5f5);
		white-space: nowrap;
	}

	.entry-detail {
		width: 100%;
		margin-top: 4px;
		& pre {
			margin: 4px 0 0;
			padding: 8px;
			font-size: 10px;
			overflow-x: auto;
			background: var(--bg-3, #f5f5f5);
			border-radius: 4px;
		}
	}

	.filter-bar {
		margin-bottom: 8px;
	}

	.filter-input {
		width: 100%;
		padding: 6px 8px;
		border: 1px solid var(--border-2);
		border-radius: 4px;
		font-size: 12px;
		background: var(--bg-2);
		color: var(--text-1);
		outline: none;
		&:focus {
			border-color: var(--color-blue-500, #3b82f6);
		}
	}

	.service-row {
		border: 1px solid var(--border-2);
		border-radius: 4px;
		overflow: hidden;
		&.project-scope {
			border-left: 3px solid var(--color-blue-400, #60a5fa);
		}
	}

	.service-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 6px 8px;
		border: none;
		background: none;
		cursor: pointer;
		text-align: left;
		font-size: 12px;
		color: var(--text-1);
		&:hover {
			background: var(--bg-2);
		}
	}

	.toggle-arrow {
		font-size: 10px;
		transition: transform 0.15s;
		&.expanded {
			transform: rotate(90deg);
		}
	}

	.scope-badge {
		padding: 1px 6px;
		border-radius: 3px;
		font-size: 10px;
		font-weight: 600;
		&.global {
			color: var(--color-green-600, #16a34a);
			background: var(--color-green-100, #dcfce7);
		}
		&.project {
			color: var(--color-blue-600, #2563eb);
			background: var(--color-blue-100, #dbeafe);
		}
	}

	.service-name {
		font-weight: 500;
	}

	.phase-tag,
	.rtk-tag,
	.bound-tag {
		padding: 1px 6px;
		border-radius: 3px;
		font-size: 10px;
		background: var(--bg-3, #f5f5f5);
		white-space: nowrap;
	}

	.bound-tag {
		color: var(--color-orange-600, #ea580c);
		background: var(--color-orange-100, #fff7ed);
	}

	.service-detail {
		padding: 6px 8px 6px 28px;
		border-top: 1px solid var(--border-2);
		background: var(--bg-2);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.detail-section {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px;
	}

	.detail-label {
		font-weight: 600;
		color: var(--text-2);
		white-space: nowrap;
	}

	.dep-list {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.dep-chip {
		padding: 1px 6px;
		border-radius: 3px;
		font-size: 10px;
		background: var(--bg-3, #f5f5f5);
		&.rtk {
			color: var(--color-purple-600, #9333ea);
			background: var(--color-purple-100, #f3e8ff);
		}
		&.endpoint {
			color: var(--color-teal-600, #0d9488);
			background: var(--color-teal-100, #f0fdfa);
		}
	}

	.rtk-row {
		border: 1px solid var(--border-2);
		border-radius: 4px;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.rtk-header {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.rtk-name {
		font-weight: 600;
	}

	.rtk-path {
		color: var(--text-2);
	}

	.rtk-endpoints {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-left: 12px;
	}

	.endpoint-row {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}

	.endpoint-names {
		font-weight: 500;
	}

	.endpoint-source {
		color: var(--text-2);
		font-style: italic;
	}

	.endpoint-time {
		color: var(--text-3);
		font-size: 10px;
	}

	.graph-view {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.graph-legend {
		display: flex;
		gap: 16px;
		font-size: 11px;
		color: var(--text-2);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.legend-line {
		display: inline-block;
		width: 20px;
		height: 2px;
		&.service-line {
			background: var(--color-blue-500, #3b82f6);
		}
		&.rtk-line {
			background: var(--color-purple-500, #a855f7);
		}
	}

	.graph-content {
		padding: 12px;
		font-size: 11px;
		background: var(--bg-2);
		border-radius: 4px;
		overflow-x: auto;
		margin: 0;
	}

	.empty-state {
		padding: 20px;
		text-align: center;
		color: var(--text-2);
	}
</style>
