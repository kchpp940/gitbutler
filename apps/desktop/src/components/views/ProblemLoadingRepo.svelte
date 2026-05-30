<script lang="ts">
	import RemoveProjectButton from "$components/projectSettings/RemoveProjectButton.svelte";
	import IllustrationSplitLayout from "$components/shared/IllustrationSplitLayout.svelte";
	import ProjectNameLabel from "$components/shared/ProjectNameLabel.svelte";
	import ProjectSwitcher from "$components/shared/ProjectSwitcher.svelte";
	import AppLayout from "$components/views/AppLayout.svelte";
	import loadErrorSvg from "$lib/assets/illustrations/load-error.svg?raw";
	import { PROJECT_LIFECYCLE_STORE } from "$lib/projectLifecycle";
	import { POSTHOG_WRAPPER } from "$lib/telemetry/posthog";
	import { inject } from "@gitbutler/core/context";

	import { Icon, Spacer } from "@gitbutler/ui";
	import { onMount } from "svelte";

	type Props = {
		projectId: string;
		error?: string;
		projectTitle?: string;
	};

	const { projectId, error = undefined, projectTitle: fallbackTitle = undefined }: Props = $props();

	const lifecycleStore = inject(PROJECT_LIFECYCLE_STORE);
	const posthog = inject(POSTHOG_WRAPPER);

	let isRepairing = $derived(lifecycleStore.status.current === "repairing");
	let isDeleting = $derived(lifecycleStore.status.current === "loading");
	let hasRecoverableIssues = $derived(lifecycleStore.hasRecoverableIssues.current);
	let issues = $derived(lifecycleStore.issues.current);
	let primaryError = $derived(error || issues[0]?.message || "An unknown error occurred");
	let projectTitle = $derived(fallbackTitle || lifecycleStore.project.current?.title);

	let deleteConfirmationModal: ReturnType<typeof RemoveProjectButton> | undefined = $state();

	async function onDeleteClicked() {
		deleteConfirmationModal?.close();
		await lifecycleStore.deleteProjectWithErrorHandling(projectId);
	}

	async function onRepairClicked() {
		await lifecycleStore.repairProject(projectId);
	}

	onMount(() => {
		posthog.capture("repo:load_failed", { error_message: primaryError });
	});
</script>

<AppLayout {projectId} sidebarDisabled>
	<IllustrationSplitLayout img={loadErrorSvg}>
		<div class="problem">
			<div class="project-name">
				<ProjectNameLabel projectName={projectTitle} />
			</div>
			<h2 class="problem__title text-18 text-body text-bold">
				There was a problem loading this repo
			</h2>

			<div class="problem__error text-12 text-body">
				<Icon name="danger" color="var(--fill-danger-bg)" />
				{primaryError}
			</div>

			{#if hasRecoverableIssues}
				<div class="problem__repair">
					<button
						class="repair-btn"
						disabled={isRepairing || isDeleting}
						onclick={onRepairClicked}
					>
						{#if isRepairing}
							<span>Repairing...</span>
						{:else}
							<span>Repair project</span>
						{/if}
					</button>
				</div>
			{/if}

			<div class="remove-project-btn">
				<RemoveProjectButton
					bind:this={deleteConfirmationModal}
					isDeleting={isDeleting}
					{onDeleteClicked}
				/>
			</div>

			<Spacer dotted margin={0} />

			<div class="problem__switcher">
				<ProjectSwitcher {projectId} />
			</div>
		</div>
	</IllustrationSplitLayout>
</AppLayout>

<style lang="postcss">
	.project-name {
		margin-bottom: 12px;
	}

	.problem__title {
		margin-bottom: 12px;
		color: var(--text-1);
	}

	.problem__switcher {
		margin-top: 24px;
		text-align: right;
	}

	.problem__error {
		display: flex;
		margin-bottom: 12px;
		padding: 20px;
		gap: 12px;
		border-radius: var(--radius-m);
		background-color: var(--bg-danger);
		color: var(--text-1);
	}

	.problem__repair {
		margin-bottom: 12px;
	}

	.repair-btn {
		width: 100%;
		padding: 12px 20px;
		border: none;
		border-radius: var(--radius-s);
		background-color: var(--fill-warning-bg);
		color: var(--text-1);
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.repair-btn:hover:not(:disabled) {
		background-color: var(--fill-warning-bg-hover);
	}

	.repair-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.remove-project-btn {
		display: flex;
		justify-content: flex-end;
		padding-bottom: 24px;
	}
</style>
