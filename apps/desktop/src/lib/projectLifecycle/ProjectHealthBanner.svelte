<script lang="ts">
	import { Button, chipToasts, Spacer } from "@gitbutler/ui";
	import type { ProjectHealthIssue } from "./types";
	import type { ProjectLifecycleStore } from "./projectLifecycleStore";

	type Props = {
		projectId: string;
		lifecycleStore: ProjectLifecycleStore;
	};

	const { projectId, lifecycleStore }: Props = $props();

	let isRepairing = $derived(lifecycleStore.status.current === "repairing");
	let hasRecoverableIssues = $derived(lifecycleStore.hasRecoverableIssues.current);
	let issues = $derived(lifecycleStore.issues.current);

	async function onRepairClick() {
		const result = await lifecycleStore.repairProject(projectId);
		if (result.success) {
			chipToasts.success("Project repaired successfully");
		}
	}

	async function onDeleteClick() {
		await lifecycleStore.deleteProject(projectId);
	}

	function getIssueTitle(issue: ProjectHealthIssue): string {
		switch (issue.type) {
			case "db_corrupted":
				return "Database corrupted";
			case "not_git_repository":
				return "Not a Git repository";
			case "no_dot_git_directory":
				return "No .git directory";
			case "path_not_found":
				return "Path not found";
			case "bare_repository":
				return "Bare repository";
			case "non_main_worktree":
				return "Non-main worktree";
			case "no_workdir":
				return "No workdir";
			case "not_a_directory":
				return "Not a directory";
			case "exclusive_lock":
				return "Project in use";
			default:
				return "Project issue";
		}
	}

	let recoverableIssues = $derived(issues.filter((i) => i.recoverable));
	let unrecoverableIssues = $derived(issues.filter((i) => !i.recoverable));
</script>

{#if issues.length > 0}
	<div class="health-banner">
		<div class="issues">
			{#each recoverableIssues as issue}
				<div class="issue issue--warning">
					<div class="issue__content">
						<span class="issue__title">{getIssueTitle(issue)}</span>
						<span class="issue__message">{issue.message}</span>
					</div>
				</div>
			{/each}

			{#each unrecoverableIssues as issue}
				<div class="issue issue--error">
					<div class="issue__content">
						<span class="issue__title">{getIssueTitle(issue)}</span>
						<span class="issue__message">{issue.message}</span>
					</div>
				</div>
			{/each}
		</div>

		<Spacer dotted margin={0} />

		<div class="actions">
			{#if hasRecoverableIssues}
				<Button style="warning" loading={isRepairing} onclick={onRepairClick}>
					Repair project
				</Button>
			{/if}
			<Button style="danger" loading={isRepairing} onclick={onDeleteClick}>
				Delete project
			</Button>
		</div>
	</div>
{/if}

<style lang="postcss">
	.health-banner {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 16px;
		margin-bottom: 16px;
		border-radius: var(--radius-m);
		background-color: var(--bg-2);
		border: 1px solid var(--border-1);
	}

	.issues {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.issue {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px;
		border-radius: var(--radius-s);
	}

	.issue--warning {
		background-color: var(--bg-warning);
		border: 1px solid var(--border-warning);
	}

	.issue--error {
		background-color: var(--bg-danger);
		border: 1px solid var(--border-danger);
	}

	.issue__content {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.issue__title {
		font-weight: 600;
		font-size: 14px;
		color: var(--text-1);
	}

	.issue__message {
		font-size: 12px;
		color: var(--text-2);
	}

	.actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}
</style>
