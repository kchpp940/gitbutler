<script lang="ts">
	import { page } from "$app/state";
	import ProjectNotFound from "$components/onboarding/ProjectNotFound.svelte";
	import RouteErrorView from "$components/shared/RouteErrorView.svelte";
	import { fromUnknown, emitDiagnostic } from "$lib/diagnostics/service";

	const code = $derived(page.error?.errorCode);
	const status = $derived(page.status);

	$effect(() => {
		if (status !== 404 && page.error) {
			const event = fromUnknown("frontend:route", page.error, {
				context: { status, route: page.url.pathname },
			});
			emitDiagnostic(event);
		}
	});

	const errorMessage = $derived(
		page.error?.message ?? (status === 404 ? "Page not found" : "Unknown error"),
	);
</script>

{#if code === "ProjectMissing"}
	{@const projectId = page.params.projectId!}
	<ProjectNotFound {projectId} />
{:else}
	<RouteErrorView error={errorMessage} />
{/if}
