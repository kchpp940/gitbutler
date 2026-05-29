<script lang="ts">
	import { goto } from "$app/navigation";
	import FullviewLoading from "$components/shared/FullviewLoading.svelte";
	import ProjectListPage from "$components/views/ProjectListPage.svelte";
	import { PROJECTS_SERVICE } from "$lib/project/projectsService";
	import { inject } from "@gitbutler/core/context";

	const projectsService = inject(PROJECTS_SERVICE);

	const projectsQuery = projectsService.projects();

	type State =
		| { type: "loading" }
		| { type: "no-projects" }
		| { type: "single"; projectId: string }
		| { type: "list" };

	const persistedId = projectsService.getLastOpenedProject();
	const state: State = $derived.by(() => {
		const projects = projectsQuery.response;
		if (projects === undefined) return { type: "loading" };
		if (projects.length === 0) return { type: "no-projects" };
		if (projects.length === 1) return { type: "single", projectId: projects[0].id };
		const lastOpened = projects.find((p) => p.id === persistedId);
		if (lastOpened) return { type: "single", projectId: lastOpened.id };
		return { type: "list" };
	});

	$effect(() => {
		if (state.type === "single") {
			goto(`/${state.projectId}`);
		} else if (state.type === "no-projects") {
			goto("/onboarding");
		}
	});
</script>

{#if state.type === "loading"}
	<FullviewLoading />
{:else if state.type === "list"}
	<ProjectListPage projects={projectsQuery.response!} />
{/if}
