<script lang="ts">
	import CloudForm from "$components/projectSettings/CloudForm.svelte";
	import GeneralSettings from "$components/projectSettings/GeneralSettings.svelte";
	import GitForm from "$components/projectSettings/GitForm.svelte";
	import PreferencesForm from "$components/projectSettings/PreferencesForm.svelte";
	import SettingsModalLayout from "$components/settings/SettingsModalLayout.svelte";
	import { projectSettingsPages } from "$lib/settings/projectSettingsPages";
	import type { ProjectSettingsModalState, ProjectSettingsPageId } from "$lib/state/uiState.svelte";
	import {
		PROJECT_SETTINGS_DRAFT,
		ProjectSettingsDraftStore,
	} from "$lib/settings/settingsDraft";
	import { provide, inject } from "@gitbutler/core/context";
	import { UI_STATE } from "$lib/state/uiState.svelte";
	import { setCloseInterceptor } from "$lib/settings/settingsModal.svelte";

	type Props = {
		data: ProjectSettingsModalState;
	};

	const { data }: Props = $props();

	const pages = projectSettingsPages;
	const uiState = inject(UI_STATE);

	const draft = new ProjectSettingsDraftStore();
	draft.setProjectId(data.projectId);
	provide(PROJECT_SETTINGS_DRAFT, draft);

	$effect(() => {
		draft.setProjectId(data.projectId);
		draft.load();
	});

	function requestClose(): boolean {
		if (draft.isDirty) {
			if (!window.confirm("You have unsaved changes. Are you sure you want to close?")) {
				return false;
			}
			draft.cancel();
		}
		return true;
	}

	$effect(() => {
		const cleanup = setCloseInterceptor(requestClose);
		return cleanup;
	});

	let currentSelectedId = $derived(data.selectedId || pages.at(0)?.id);

	function selectPage(pageId: ProjectSettingsPageId) {
		currentSelectedId = pageId;
	}

	async function handleSave() {
		const success = await draft.save();
		if (success) {
			uiState.global.modal.set(undefined);
		}
	}

	function handleCancel() {
		draft.cancel();
		uiState.global.modal.set(undefined);
	}
</script>

<SettingsModalLayout
	title="Project settings"
	{pages}
	selectedId={currentSelectedId}
	onSelectPage={selectPage}
	isDirty={draft.isDirty}
	isSaving={draft.saving}
	onSave={handleSave}
	onCancel={handleCancel}
>
	{#snippet content({ currentPage })}
		{#if currentPage}
			{#if currentPage.id === "project"}
				<GeneralSettings projectId={data.projectId} />
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
</SettingsModalLayout>
