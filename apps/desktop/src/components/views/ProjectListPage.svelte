<script lang="ts">
	import { goto } from "$app/navigation";
	import HealthCheckSummary from "$components/shared/HealthCheckSummary.svelte";
	import { handleAddProjectOutcome } from "$lib/project/project";
	import { PROJECTS_SERVICE } from "$lib/project/projectsService";
	import { projectPath } from "$lib/routes/routes.svelte";
	import { inject } from "@gitbutler/core/context";
	import { Button, Icon, TestId } from "@gitbutler/ui";
	import type { Project } from "$lib/project/project";

	type Props = {
		projects: Project[];
	};

	const { projects }: Props = $props();

	const projectsService = inject(PROJECTS_SERVICE);
	const serverCapabilitiesQuery = $derived(projectsService.serverCapabilities());
	const canAddProjects = $derived(serverCapabilitiesQuery.response?.canAddProjects ?? true);

	let addLoading = $state(false);

	async function addProject() {
		addLoading = true;
		try {
			const outcome = await projectsService.addProject();
			if (outcome) {
				handleAddProjectOutcome(outcome, (project) => goto(projectPath(project.id)));
			}
		} finally {
			addLoading = false;
		}
	}
</script>

<div class="project-list">
	<div class="project-list__header">
		<h2 class="text-20 text-semibold">Your Projects</h2>
		{#if canAddProjects}
			<Button kind="primary" icon="plus" onclick={addProject} loading={addLoading}>
				Add project
			</Button>
		{/if}
	</div>

	<div class="project-list__grid">
		{#each projects as project (project.id)}
			<button
				class="project-card"
				onclick={() => goto(projectPath(project.id))}
				data-testid={TestId.ProjectCard}
			>
				<div class="project-card__top">
					<div class="project-card__icon">
						<Icon name="repo" color="var(--text-2)" />
					</div>
					<div class="project-card__info">
						<span class="text-14 text-semibold project-card__title">{project.title}</span>
						<span class="text-12 clr-text-2 project-card__path">{project.path}</span>
					</div>
				</div>
				<div class="project-card__bottom">
					<HealthCheckSummary projectId={project.id} />
				</div>
			</button>
		{/each}
	</div>
</div>

<style lang="postcss">
	.project-list {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 40px;
		max-width: 840px;
		margin: 0 auto;
		width: 100%;
	}

	.project-list__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.project-list__grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
		gap: 12px;
	}

	.project-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
		border: 1px solid var(--border-2);
		border-radius: var(--radius-m);
		background: var(--bg-1);
		cursor: pointer;
		text-align: left;
		transition: background-color 0.1s, border-color 0.1s;

		&:hover {
			background: var(--bg-2);
			border-color: var(--border-3);
		}
	}

	.project-card__top {
		display: flex;
		align-items: flex-start;
		gap: 10px;
	}

	.project-card__icon {
		flex-shrink: 0;
		margin-top: 2px;
	}

	.project-card__info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.project-card__title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.project-card__path {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.project-card__bottom {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding-left: 26px;
	}

	.clr-text-2 {
		color: var(--text-2);
	}
</style>
