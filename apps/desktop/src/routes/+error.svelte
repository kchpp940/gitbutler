<script lang="ts">
	import { page } from "$app/state";
	import ProjectNotFound from "$components/onboarding/ProjectNotFound.svelte";
	import RouteErrorView from "$components/shared/RouteErrorView.svelte";
	import { STARTUP_DIAGNOSTICS_SERVICE } from "$lib/startupDiagnostics";
	import { get } from "svelte/store";

	const code = $derived(page.error?.errorCode);
	const status = $derived(page.status);
	const message = $derived(page.error?.message);

	const error = $derived(message ? message : status === 404 ? "Page not found" : "Unknown error");

	const shouldShowDiagnostics = $derived.by(() => {
		const result = get(STARTUP_DIAGNOSTICS_SERVICE.getResultStore());
		return STARTUP_DIAGNOSTICS_SERVICE.isInStartupPhase() && result?.has_blocking_failures === true;
	});
</script>

{#if shouldShowDiagnostics}
	<RouteErrorView error="A startup check failed. Please review the diagnostics panel." />
{:else if code === "ProjectMissing"}
	{@const projectId = page.params.projectId!}
	<ProjectNotFound {projectId} />
{:else}
	<RouteErrorView {error} />
{/if}
