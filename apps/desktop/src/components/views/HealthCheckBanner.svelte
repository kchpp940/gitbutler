<script lang="ts">
	import { HEALTH_CHECK_SERVICE } from "$lib/project/healthCheckService.svelte";
	import type { HealthCheckItem, HealthCheckSeverity, HealthCheckFixAction } from "$lib/project/projectEndpoints";
	import { inject } from "@gitbutler/core/context";
	import { Button } from "@gitbutler/ui";
	import { Icon } from "@gitbutler/ui/icon";
	import { showToast } from "$lib/notifications/toasts";
	import AddRemoteModal from "$components/remotes/AddRemoteModal.svelte";

	type Props = {
		projectId: string;
	};

	let { projectId }: Props = $props();

	const healthService = inject(HEALTH_CHECK_SERVICE);
	const healthQuery = $derived(healthService.useReport(projectId));

	let expanded = $state(false);
	let fixing = $state<Set<string>>(new Set());
	let itemErrors = $state<Map<string, string>>(new Map());
	let addRemoteModal: ReturnType<typeof AddRemoteModal>;

	function severityIcon(severity: HealthCheckSeverity): string {
		switch (severity) {
			case "critical":
				return "danger";
			case "warning":
				return "warning";
			case "info":
				return "info";
		}
	}

	function severityColor(severity: HealthCheckSeverity): string {
		switch (severity) {
			case "critical":
				return "var(--fill-danger-bg)";
			case "warning":
				return "var(--fill-warn-bg)";
			case "info":
				return "var(--text-link)";
		}
	}

	function fixLabel(action: HealthCheckFixAction): string {
		switch (action.type) {
			case "add_safe_directory":
				return "Fix ownership";
			case "refresh_base_branch":
				return "Refresh sync";
			case "invalidate_health_cache":
				return "Recheck";
			case "add_remote":
				return "Add remote";
			case "run_lfs_pull":
				return "Run LFS pull";
		}
	}

	async function onFix(item: HealthCheckItem) {
		if (!item.fix_action) return;

		if (item.fix_action.type === "add_remote") {
			addRemoteModal.open();
			return;
		}

		fixing.update((s) => {
			const n = new Set(s);
			n.add(item.id);
			return n;
		});
		itemErrors.delete(item.id);

		try {
			const result = await healthService.executeFix(projectId, item.fix_action);
			if (result.success) {
				showToast({ style: "success", title: "Fixed", message: item.message });
			} else {
				const errorMsg = result.error || `Could not fix: ${item.message}`;
				itemErrors.set(item.id, errorMsg);
				showToast({ style: "error", title: "Fix failed", message: errorMsg });
			}
		} catch (e) {
			const errorMsg = e instanceof Error ? e.message : String(e);
			itemErrors.set(item.id, errorMsg);
			showToast({ style: "error", title: "Fix failed", message: errorMsg });
		} finally {
			fixing.update((s) => {
				const n = new Set(s);
				n.delete(item.id);
				return n;
			});
		}
	}

	function onRemoteAdded() {
		healthService.invalidate(projectId);
		showToast({ style: "success", title: "Remote added", message: "Successfully configured remote." });
	}

	$: summary = HealthCheckService_summarize(healthQuery.response);
	$: hasIssues = healthQuery.result.isSuccess && summary.total > 0;

	function HealthCheckService_summarize(report: any) {
		if (!report || report.items.length === 0) {
			return { critical: 0, warnings: 0, info: 0, total: 0, worst: "ok" as const };
		}
		const critical = report.items.filter((i: HealthCheckItem) => i.severity === "critical").length;
		const warnings = report.items.filter((i: HealthCheckItem) => i.severity === "warning").length;
		const info = report.items.filter((i: HealthCheckItem) => i.severity === "info").length;
		const worst = critical > 0
			? "critical" as const
			: warnings > 0
				? "warning" as const
				: info > 0
					? "info" as const
					: "ok" as const;
		return { critical, warnings, info, total: report.items.length, worst };
	}
</script>

<AddRemoteModal bind:this={addRemoteModal} projectId={projectId} on:close={onRemoteAdded} />

{#if hasIssues}
	<div class="health-banner">
		<div class="health-banner__header" onclick={() => (expanded = !expanded)}>
			<div class="health-banner__title">
				{#if summary.critical > 0}
					<Icon name={severityIcon("critical")} color={severityColor("critical")} />
					<span class="text-13 text-bold clr-text-danger">
						{summary.critical} critical{summary.critical > 1 ? "s" : ""}
					</span>
				{/if}
				{#if summary.warnings > 0}
					<Icon name={severityIcon("warning")} color={severityColor("warning")} />
					<span class="text-13 text-bold clr-text-warning">
						{summary.warnings} warning{summary.warnings > 1 ? "s" : ""}
					</span>
				{/if}
				{#if summary.info > 0 && summary.critical === 0 && summary.warnings === 0}
					<Icon name={severityIcon("info")} color={severityColor("info")} />
					<span class="text-13 text-bold clr-text-info">
						{summary.info} note{summary.info > 1 ? "s" : ""}
					</span>
				{/if}
			</div>
			<Icon name={expanded ? "chevron-up" : "chevron-down"} color="var(--text-2)" />
		</div>

		{#if expanded && healthQuery.response}
			<div class="health-banner__items">
				{#each healthQuery.response.items as item (item.id)}
					<div class="health-item">
						<div class="health-item__header">
							<Icon name={severityIcon(item.severity)} color={severityColor(item.severity)} />
							<span class="text-13 text-bold">{item.message}</span>
						</div>
						{#if item.fix_hint}
							<div class="health-item__fix">
								<div class="text-12 clr-text-2">{item.fix_hint}</div>
							</div>
						{/if}
						{#if itemErrors.get(item.id)}
							<div class="health-item__error">
								<Icon name="info" color="var(--danger)" />
								<span class="text-12 clr-text-danger">{itemErrors.get(item.id)}</span>
							</div>
						{/if}
						{#if item.fix_action}
							<div class="health-item__action">
								<Button
									kind="primary"
									size="small"
									style="pop"
									loading={$fixing.has(item.id)}
									onclick={() => onFix(item)}
								>
									{fixLabel(item.fix_action)}
								</Button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style lang="postcss">
	.health-banner {
		display: flex;
		flex-direction: column;
		border-bottom: 1px solid var(--border-2);
		background-color: var(--bg-1);
	}

	.health-banner__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		cursor: pointer;
		user-select: none;

		&:hover {
			background-color: var(--bg-2);
		}
	}

	.health-banner__title {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.health-banner__items {
		display: flex;
		flex-direction: column;
		padding: 0 14px 10px;
		gap: 10px;
		border-top: 1px solid var(--border-2);
		padding-top: 10px;
	}

	.health-item {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.health-item__header {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}

	.health-item__fix {
		margin-left: 24px;
	}

	.health-item__error {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		margin-left: 24px;
		padding: 6px 8px;
		background-color: var(--fill-danger-bg);
		border-radius: var(--radius-s);
	}

	.health-item__action {
		margin-left: 24px;
	}

	.clr-text-danger {
		color: var(--text-danger);
	}

	.clr-text-warning {
		color: var(--text-warn);
	}

	.clr-text-info {
		color: var(--text-link);
	}

	.clr-text-2 {
		color: var(--text-2);
	}
</style>
