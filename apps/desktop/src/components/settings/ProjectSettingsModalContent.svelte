<script lang="ts">
	import CloudForm from "$components/projectSettings/CloudForm.svelte";
	import GeneralSettings from "$components/projectSettings/GeneralSettings.svelte";
	import GitForm from "$components/projectSettings/GitForm.svelte";
	import PreferencesForm from "$components/projectSettings/PreferencesForm.svelte";
	import SettingsModalLayout from "$components/settings/SettingsModalLayout.svelte";
	import { SETTINGS_ORCHESTRATOR } from "$lib/settings/settingsOrchestrator";
	import { PROJECT_DRAFT_STORE } from "$lib/settings/projectDraftStore";
	import { projectSettingsPages } from "$lib/settings/projectSettingsPages";
	import { PROJECTS_SERVICE } from "$lib/project/projectsService";
	import { inject } from "@gitbutler/core/context";
	import { Button, InfoMessage } from "@gitbutler/ui";
	import type { ProjectSettingsModalState, ProjectSettingsPageId } from "$lib/state/uiState.svelte";
	import { onMount } from "svelte";

	type Props = {
		data: ProjectSettingsModalState;
	};

	const { data }: Props = $props();

	const pages = projectSettingsPages;
	const settingsOrchestrator = inject(SETTINGS_ORCHESTRATOR);
	const projectDraftStore = PROJECT_DRAFT_STORE;
	const projectsService = inject(PROJECTS_SERVICE);

	let currentSelectedId = $derived(data.selectedId || pages.at(0)?.id);
	let projectPath = $state<string>("");

	function selectPage(pageId: ProjectSettingsPageId) {
		currentSelectedId = pageId;
	}

	onMount(async () => {
		const [_, project] = await Promise.all([
			settingsOrchestrator.loadProjectSettings(data.projectId),
			projectsService.fetchProject(data.projectId, true),
		]);
		projectPath = project.path;
	});

	async function onSave() {
		await settingsOrchestrator.saveProjectSettings(data.projectId);
	}

	function onCancel() {
		settingsOrchestrator.cancelProjectSettings(data.projectId);
	}
</script>

<SettingsModalLayout
	title="Project settings"
	{pages}
	selectedId={currentSelectedId}
	onSelectPage={selectPage}
>
	{#snippet content({ currentPage })}
		{#if currentPage}
			{#if currentPage.id === "project"}
				<GeneralSettings projectId={data.projectId} {projectPath} />
			{:else if currentPage.id === "git"}
				<GitForm projectId={data.projectId} />
			{:else if currentPage.id === "ai"}
				<CloudForm projectId={data.projectId} />
			{:else if currentPage.id === "experimental"}
				<PreferencesForm projectId={data.projectId} />
			{:else}
				Settings page {currentPage.id} not Found.
			{/if}
		{:else}
			Settings page {currentSelectedId} not Found.
		{/if}
	{/snippet}

	{#snippet actionBar()}
		{#if settingsOrchestrator.hasError}
			<InfoMessage
				style="danger"
				class="error-banner"
				tertiaryLabel="Dismiss"
				tertiaryAction={() => settingsOrchestrator.clearError()}
			>
				{#snippet title()}
					{settingsOrchestrator.currentError?.message ?? "Failed to save settings"}
				{/snippet}
			</InfoMessage>
		{/if}
		<div class="action-buttons">
			<Button
				kind="ghost"
				disabled={!projectDraftStore.isDirty || settingsOrchestrator.isSaving}
				onclick={onCancel}
			>
				Cancel
			</Button>
			<Button
				style="pop"
				loading={settingsOrchestrator.isSaving}
				disabled={!projectDraftStore.isDirty || settingsOrchestrator.isSaving}
				onclick={onSave}
			>
				Save changes
			</Button>
		</div>
	{/snippet}
</SettingsModalLayout>

<style lang="postcss">
	:global(.page-view__action-bar) {
		flex-direction: column;
		align-items: stretch;
	}

	:global(.page-view__action-bar .error-banner) {
		margin-bottom: 8px;
	}

	:global(.page-view__action-bar .action-buttons) {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
	}
</style>
