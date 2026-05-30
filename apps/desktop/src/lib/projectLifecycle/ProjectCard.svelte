<script lang="ts">
	import type { Project } from "$lib/project/project";
	import type { ProjectLifecycleStore } from "./projectLifecycleStore";
	import { inject } from "@gitbutler/core/context";
	import { PROJECT_LIFECYCLE_STORE } from "./projectLifecycleStore";
	import { Button, Icon, chipToasts } from "@gitbutler/ui";

	type Props = {
		project: Project;
		selected?: boolean;
		onSelect?: () => void;
		onOpen?: () => void;
	};

	const { project, selected = false, onSelect, onOpen }: Props = $props();

	const lifecycleStore = inject(PROJECT_LIFECYCLE_STORE);

	const cardStore = $derived(lifecycleStore.createCardLifecycleStore(project));

	let isChecking = $derived(cardStore.status === "checking");
	let isRepairing = $derived(cardStore.status === "repairing");
	let hasError = $derived(cardStore.status === "error");
	let hasIssues = $derived(cardStore.hasIssues);
	let hasRecoverableIssues = $derived(cardStore.hasRecoverableIssues);
	let isOpenInOtherWindow = $derived(cardStore.isOpenInOtherWindow);

	async function onCheckHealth() {
		await lifecycleStore.checkCardProjectHealth(cardStore);
	}

	async function onRepair() {
		const result = await lifecycleStore.repairCardProject(cardStore);
		if (result.success) {
			chipToasts.success("Project repaired successfully");
		}
	}

	async function onOpenClick() {
		if (onOpen) {
			onOpen();
		} else {
			await lifecycleStore.switchToProject(project.id);
		}
	}

	function onCardClick() {
		if (onSelect) {
			onSelect();
		}
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onCardClick();
		}
	}

	$effect(() => {
		if (project) {
			cardStore.dispatch({
				type: "SET_ACTIVE",
				payload: { project, isOpenInOtherWindow: false },
			});
		}
	});
</script>

<div
	class="project-card"
	class:selected={selected}
	class:has-error={hasError}
	class:has-issues={hasIssues && !hasError}
	onclick={onCardClick}
	onkeydown={onKeyDown}
	tabindex={0}
	role="button"
>
	<div class="project-card__header">
		<div class="project-card__title">
			<Icon name="repo" color={hasError ? "var(--text-danger)" : "var(--text-2)"} />
			<span class="text-14 text-bold">{project.title}</span>
		</div>
		<div class="project-card__status">
			{#if isChecking}
				<span class="status-badge status-badge--checking">Checking...</span>
			{:else if isRepairing}
				<span class="status-badge status-badge--repairing">Repairing...</span>
			{:else if isOpenInOtherWindow}
				<span class="status-badge status-badge--info">Open in other window</span>
			{:else if hasError}
				<span class="status-badge status-badge--error">Error</span>
			{:else if hasIssues}
				<span class="status-badge status-badge--warning">Has issues</span>
			{/if}
		</div>
	</div>

	{#if hasIssues}
		<div class="project-card__issues">
			{#each cardStore.issues.slice(0, 2) as issue}
				<div class="issue-row">
					<Icon
						name={issue.recoverable ? "warning" : "danger"}
						size={14}
						color={issue.recoverable ? "var(--text-warning)" : "var(--text-danger)"}
					/>
					<span class="text-12">{issue.message}</span>
				</div>
			{/each}
			{#if cardStore.issues.length > 2}
				<span class="text-12 text-2">+{cardStore.issues.length - 2} more issues</span>
			{/if}
		</div>
	{/if}

	<div class="project-card__path">
		<span class="text-12 text-2">{project.path}</span>
	</div>

	<div class="project-card__actions">
		<Button
			kind="outline"
			loading={isChecking}
			disabled={isRepairing}
			onclick={(e) => {
				e.stopPropagation();
				onCheckHealth();
			}}
		>
			Check health
		</Button>

		{#if hasRecoverableIssues}
			<Button
				style="warning"
				loading={isRepairing}
				disabled={isChecking}
				onclick={(e) => {
					e.stopPropagation();
					onRepair();
				}}
			>
				Repair
			</Button>
		{/if}

		<Button
			style="pop"
			disabled={isChecking || isRepairing}
			onclick={(e) => {
				e.stopPropagation();
				onOpenClick();
			}}
		>
			Open
		</Button>
	</div>
</div>

<style lang="postcss">
	.project-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
		border-radius: var(--radius-m);
		background-color: var(--bg-2);
		border: 1px solid var(--border-1);
		cursor: pointer;
		transition: all 0.2s ease;

		&:hover {
			border-color: var(--border-2);
			background-color: var(--bg-3);
		}

		&.selected {
			border-color: var(--accent);
			background-color: var(--bg-accent);
		}

		&.has-error {
			border-color: var(--border-danger);
		}

		&.has-issues {
			border-color: var(--border-warning);
		}
	}

	.project-card__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.project-card__title {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.project-card__status {
		display: flex;
		gap: 8px;
	}

	.status-badge {
		padding: 4px 8px;
		border-radius: var(--radius-s);
		font-size: 11px;
		font-weight: 500;
	}

	.status-badge--checking,
	.status-badge--info {
		background-color: var(--bg-info);
		color: var(--text-info);
	}

	.status-badge--repairing,
	.status-badge--warning {
		background-color: var(--bg-warning);
		color: var(--text-warning);
	}

	.status-badge--error {
		background-color: var(--bg-danger);
		color: var(--text-danger);
	}

	.project-card__issues {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px;
		border-radius: var(--radius-s);
		background-color: var(--bg-1);
	}

	.issue-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.project-card__path {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.project-card__actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}
</style>
