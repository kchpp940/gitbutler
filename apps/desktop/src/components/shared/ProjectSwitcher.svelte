<script lang="ts">
	import { PROJECT_LIFECYCLE_STORE, ProjectCard } from "$lib/projectLifecycle";
	import { PROJECTS_SERVICE } from "$lib/project/projectsService";
	import { inject } from "@gitbutler/core/context";
	import { Button, OptionsGroup, Select, SelectItem } from "@gitbutler/ui";
	import { untrack } from "svelte";

	const { projectId }: { projectId?: string } = $props();

	const projectsService = inject(PROJECTS_SERVICE);
	const lifecycleStore = inject(PROJECT_LIFECYCLE_STORE);
	const projectsQuery = $derived(projectsService.projects());
	const serverCapabilitiesQuery = $derived(projectsService.serverCapabilities());
	const canAddProjects = $derived(serverCapabilitiesQuery.response?.canAddProjects ?? true);

	let newProjectLoading = $state(false);
	let cloneProjectLoading = $state(false);
</script>

<div class="project-switcher">
	<div class="project-switcher__cards">
		{#if projectsQuery.response}
			{#each projectsQuery.response as project}
				<ProjectCard
					{project}
					selected={project.id === projectId}
					onOpen={() => lifecycleStore.switchToProject(project.id)}
				/>
			{/each}
		{/if}
	</div>

	<div class="project-switcher__actions">
		{#if canAddProjects}
			<Button
				icon="plus"
				loading={newProjectLoading}
				onclick={async () => {
					newProjectLoading = true;
					try {
						await lifecycleStore.addProjectAndNavigate();
					} finally {
						newProjectLoading = false;
					}
				}}
			>
				Add local repository
			</Button>
		{/if}
		<Button
			icon="clone"
			loading={cloneProjectLoading}
			onclick={async () => {
				cloneProjectLoading = true;
				try {
					lifecycleStore.navigateToClone();
				} finally {
					cloneProjectLoading = false;
				}
			}}
		>
			Clone repository
		</Button>
	</div>
</div>

<style lang="postcss">
	.project-switcher {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.project-switcher__cards {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.project-switcher__actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
</style>
