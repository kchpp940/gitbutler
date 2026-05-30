<script lang="ts">
	import { Icon, Button } from "@gitbutler/ui";
	import StartupDiagnosticCheck from "$components/startupDiagnostics/StartupDiagnosticCheck.svelte";
	import loadErrorSvg from "$lib/assets/illustrations/load-error.svg?raw";
	import IllustrationSplitLayout from "$components/shared/IllustrationSplitLayout.svelte";
	import {
		STARTUP_DIAGNOSTICS_SERVICE,
		type DiagnosticCategory,
		type DiagnosticCheck,
		type DiagnosticResult,
		type DiagnosticStatus,
	} from "$lib/startupDiagnostics";
	import type { Readable } from "svelte/store";
	import { get } from "svelte/store";

	interface Props {
		showCloseButton?: boolean;
		onClose?: () => void;
		onContinue?: () => void;
	}

	const { showCloseButton = false, onClose, onContinue }: Props = $props();

	const diagnostics = STARTUP_DIAGNOSTICS_SERVICE;

	const checksStore = diagnostics.getChecksStore();
	const isRunningStore = diagnostics.getIsRunningStore();
	const resultStore = diagnostics.getResultStore();

	let checks = $state<DiagnosticCheck[]>([]);
	let isRunning = $state<boolean>(false);
	let result = $state<DiagnosticResult | null>(null);

	$effect(() => {
		const unsubscribeChecks = checksStore.subscribe((value) => {
			checks = value;
		});
		const unsubscribeIsRunning = isRunningStore.subscribe((value) => {
			isRunning = value;
		});
		const unsubscribeResult = resultStore.subscribe((value) => {
			result = value;
		});

		return () => {
			unsubscribeChecks();
			unsubscribeIsRunning();
			unsubscribeResult();
		};
	});

	const categoryLabels: Record<DiagnosticCategory, string> = {
		environment: "Environment",
		toolchain: "Toolchain",
		backend: "Backend",
		dependencies: "Dependencies",
		configuration: "Configuration",
	};

	const groupedChecks = $derived.by(() => {
		const groups = new Map<DiagnosticCategory, DiagnosticCheck[]>();
		for (const check of checks) {
			if (!groups.has(check.category)) {
				groups.set(check.category, []);
			}
			groups.get(check.category)!.push(check);
		}
		return groups;
	});

	const failedChecks = $derived(checks.filter((c: DiagnosticCheck) => c.status === "failed"));
	const warningChecks = $derived(checks.filter((c: DiagnosticCheck) => c.status === "warning"));
	const passedChecks = $derived(checks.filter((c: DiagnosticCheck) => c.status === "passed"));

	const overallStatus = $derived.by(() => {
		if (isRunning) return "running" as DiagnosticStatus;
		if (failedChecks.length > 0) return "failed" as DiagnosticStatus;
		if (warningChecks.length > 0) return "warning" as DiagnosticStatus;
		if (passedChecks.length === checks.length && checks.length > 0) return "passed" as DiagnosticStatus;
		return "pending" as DiagnosticStatus;
	});

	const statusTitle = $derived.by(() => {
		switch (overallStatus) {
			case "running":
				return "Running Diagnostics...";
			case "passed":
				return "All Checks Passed";
			case "failed":
				return "Some Checks Failed";
			case "warning":
				return "Checks Completed with Warnings";
			default:
				return "Startup Diagnostics";
		}
	});

	const canContinue = $derived(!result?.has_blocking_failures);

	async function runAll() {
		await diagnostics.runAllChecks();
	}

	async function rerunCheck(checkId: string) {
		await diagnostics.runCheck(checkId);
	}

	function handleContinue() {
		onContinue?.();
	}

	$effect(() => {
		if (checks.length > 0 && !isRunning) {
			runAll();
		}
	});
</script>

<IllustrationSplitLayout img={loadErrorSvg}>
	<div class="diagnostics-container">
		<div class="diagnostics-header">
			<div class="diagnostics-title">
				<Icon
					name={
						overallStatus === "running"
							? "spinner"
							: overallStatus === "failed"
								? "cross-circle"
								: overallStatus === "warning"
									? "warning"
									: "tick-circle"
					}
					color={
						overallStatus === "failed"
							? "var(--text-danger)"
							: overallStatus === "warning"
								? "var(--text-warning)"
								: overallStatus === "passed"
									? "var(--text-success)"
									: "var(--text-1)"
					}
				/>
				<h2>{statusTitle}</h2>
			</div>
			<p class="diagnostics-subtitle">
				{#if overallStatus === "running"}
					Checking your environment and dependencies...
				{:else if overallStatus === "failed"}
					{failedChecks.length} issue{failedChecks.length === 1 ? "" : "s"} found that need attention
				{:else if overallStatus === "warning"}
					{warningChecks.length} warning{warningChecks.length === 1 ? "" : "s"}
				{:else}
					Your environment is ready
				{/if}
			</p>
		</div>

		<div class="diagnostics-stats">
			<div class="stat">
				<span class="stat-value">{passedChecks.length}</span>
				<span class="stat-label">Passed</span>
			</div>
			<div class="stat">
				<span class="stat-value stat-warning">{warningChecks.length}</span>
				<span class="stat-label">Warnings</span>
			</div>
			<div class="stat">
				<span class="stat-value stat-danger">{failedChecks.length}</span>
				<span class="stat-label">Failed</span>
			</div>
		</div>

		<div class="diagnostics-checks">
			{#each Array.from(groupedChecks.entries()) as [category, categoryChecks]}
				<div class="check-group">
					<div class="check-group-title">{categoryLabels[category]}</div>
					<div class="check-group-items">
						{#each categoryChecks as check (check.id)}
							<StartupDiagnosticCheck {check} onRerun={rerunCheck} />
						{/each}
					</div>
				</div>
			{/each}
		</div>

		<div class="diagnostics-actions">
			<Button kind="outline" onclick={runAll} disabled={isRunning}>
				{isRunning ? "Running..." : "Rerun All"}
			</Button>
			{#if showCloseButton}
				<Button kind="outline" onclick={onClose}>
					Close
				</Button>
			{/if}
			{#if canContinue && onContinue}
				<Button style="pop" onclick={handleContinue} icon="chevron-right">
					Continue
				</Button>
			{/if}
		</div>

		{#if result}
			<div class="diagnostics-footer">
				<span class="footer-text">
					Completed in {(result.total_duration_ms ? (result.total_duration_ms / 1000).toFixed(2) : 0)}s
				</span>
			</div>
		{/if}
	</div>
</IllustrationSplitLayout>

<style lang="postcss">
	.diagnostics-container {
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 600px;
	}

	.diagnostics-header {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.diagnostics-title {
		display: flex;
		align-items: center;
		gap: 12px;

		& h2 {
			font-size: 20px;
			font-weight: 600;
			color: var(--text-1);
			margin: 0;
		}
	}

	.diagnostics-subtitle {
		font-size: 14px;
		color: var(--text-2);
		margin: 0;
	}

	.diagnostics-stats {
		display: flex;
		gap: 24px;
		padding: 16px;
		border-radius: var(--radius-m);
		background-color: var(--bg-2);
		border: 1px solid var(--border-1);
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.stat-value {
		font-size: 24px;
		font-weight: 600;
		color: var(--text-success);
	}

	.stat-warning {
		color: var(--text-warning);
	}

	.stat-danger {
		color: var(--text-danger);
	}

	.stat-label {
		font-size: 12px;
		color: var(--text-3);
	}

	.diagnostics-checks {
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-height: 400px;
		overflow-y: auto;
	}

	.check-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.check-group-title {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.check-group-items {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.diagnostics-actions {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
		padding-top: 8px;
		border-top: 1px solid var(--border-1);
	}

	.diagnostics-footer {
		display: flex;
		justify-content: center;
	}

	.footer-text {
		font-size: 11px;
		color: var(--text-3);
	}
</style>
