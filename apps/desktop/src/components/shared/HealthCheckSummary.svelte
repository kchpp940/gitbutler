<script lang="ts">
	import { HEALTH_CHECK_SERVICE } from "$lib/project/healthCheckService.svelte";
	import { HealthCheckService } from "$lib/project/healthCheckService.svelte";
	import { Icon } from "@gitbutler/ui/icon";
	import { inject } from "@gitbutler/core/context";

	type Props = {
		projectId: string;
	};

	const { projectId }: Props = $props();

	const healthService = inject(HEALTH_CHECK_SERVICE);
	const healthQuery = $derived(healthService.useReport(projectId));

	$: summary = $derived(HealthCheckService.summarize(healthQuery.response));
</script>

{#if summary.total > 0}
	<span class="health-summary" data-worst={summary.worst}>
		<Icon
			name={summary.worst === "critical" ? "danger" : summary.worst === "warning" ? "warning" : "info"}
			size={12}
		/>
		<span class="health-summary__count">{summary.total}</span>
	</span>
{/if}

<style lang="postcss">
	.health-summary {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 1px 5px;
		border-radius: var(--radius-s);
		font-size: 11px;
		line-height: 1;

		&[data-worst="critical"] {
			color: var(--text-danger);
			background: var(--fill-danger-bg);
		}

		&[data-worst="warning"] {
			color: var(--text-warn);
			background: var(--fill-warn-bg);
		}

		&[data-worst="info"] {
			color: var(--text-link);
			background: var(--fill-info-bg, var(--bg-mute));
		}
	}

	.health-summary__count {
		font-weight: 600;
	}
</style>
