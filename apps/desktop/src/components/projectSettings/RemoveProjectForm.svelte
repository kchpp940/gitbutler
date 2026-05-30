<script lang="ts">
	import RemoveProjectButton from "$components/projectSettings/RemoveProjectButton.svelte";
	import ReduxResult from "$components/shared/ReduxResult.svelte";
	import { PROJECT_LIFECYCLE_STORE } from "$lib/projectLifecycle";
	import { PROJECTS_SERVICE } from "$lib/project/projectsService";
	import { inject } from "@gitbutler/core/context";

	import { CardGroup } from "@gitbutler/ui";

	const { projectId }: { projectId: string } = $props();

	const projectsService = inject(PROJECTS_SERVICE);
	const lifecycleStore = inject(PROJECT_LIFECYCLE_STORE);
	const projectQuery = $derived(projectsService.getProject(projectId));

	let isDeleting = $state(false);

	async function onDeleteClicked() {
		isDeleting = true;
		try {
			await lifecycleStore.deleteProject(projectId);
		} finally {
			isDeleting = false;
		}
	}
</script>

<ReduxResult {projectId} result={projectQuery.result}>
	{#snippet children(project)}
		<CardGroup.Item standalone>
			{#snippet title()}
				Remove project
			{/snippet}
			{#snippet caption()}
				Removing projects only clears configuration — your code stays safe.
			{/snippet}

			<div>
				<RemoveProjectButton projectTitle={project.title} {isDeleting} {onDeleteClicked} />
			</div>
		</CardGroup.Item>
	{/snippet}
</ReduxResult>
