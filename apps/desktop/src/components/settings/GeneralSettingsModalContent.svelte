<script lang="ts">
	import AppearanceSettings from "$components/projectSettings/AppearanceSettings.svelte";
	import AiSettings from "$components/settings/AiSettings.svelte";
	import ExperimentalSettings from "$components/settings/ExperimentalSettings.svelte";
	import GeneralSettings from "$components/settings/GeneralSettings.svelte";
	import GitSettings from "$components/settings/GitSettings.svelte";
	import IntegrationsSettings from "$components/settings/IntegrationsSettings.svelte";
	import IrcSettings from "$components/settings/IrcSettings.svelte";
	import LanesAndBranchesSettings from "$components/settings/LanesAndBranchesSettings.svelte";
	import OrganisationSettings from "$components/settings/OrganisationSettings.svelte";
	import SettingsModalLayout from "$components/settings/SettingsModalLayout.svelte";
	import TelemetrySettings from "$components/settings/TelemetrySettings.svelte";
	import { URL_SERVICE } from "$lib/backend/url";
	import { SETTINGS_SERVICE } from "$lib/settings/appSettings";
	import { SETTINGS_ORCHESTRATOR } from "$lib/settings/settingsOrchestrator";
	import { GLOBAL_DRAFT_STORE } from "$lib/settings/globalDraftStore";
	import { generalSettingsPages } from "$lib/settings/generalSettingsPages";
	import { USER_SERVICE } from "$lib/user/userService.svelte";
	import { inject } from "@gitbutler/core/context";
	import { Button, Icon, InfoMessage } from "@gitbutler/ui";
	import type { GeneralSettingsModalState, GeneralSettingsPageId } from "$lib/state/uiState.svelte";
	import { onMount } from "svelte";

	type Props = {
		data: GeneralSettingsModalState;
	};

	const { data }: Props = $props();

	const userService = inject(USER_SERVICE);
	const settingsService = inject(SETTINGS_SERVICE);
	const settingsStore = settingsService.appSettings;
	const ircEnabled = $derived($settingsStore?.featureFlags.irc ?? false);
	const urlService = inject(URL_SERVICE);
	const settingsOrchestrator = inject(SETTINGS_ORCHESTRATOR);
	const globalDraftStore = GLOBAL_DRAFT_STORE;

	let currentSelectedId = $derived(data.selectedId || generalSettingsPages[0]!.id);

	function selectPage(pageId: GeneralSettingsPageId) {
		currentSelectedId = pageId;
	}

	onMount(async () => {
		await settingsOrchestrator.loadGlobalSettings();
	});

	async function onSave() {
		await settingsOrchestrator.saveGlobalSettings();
	}

	function onCancel() {
		settingsOrchestrator.cancelGlobalSettings();
	}
</script>

<SettingsModalLayout
	title="Global settings"
	pages={generalSettingsPages.filter((p) => p.id !== "irc" || ircEnabled)}
	selectedId={currentSelectedId}
	isAdmin={userService.user?.role === "admin"}
	onSelectPage={selectPage}
>
	{#snippet content({ currentPage })}
		{#if currentPage}
			{#if currentPage.id === "general"}
				<GeneralSettings />
			{:else if currentPage.id === "appearance"}
				<AppearanceSettings />
			{:else if currentPage.id === "lanes-and-branches"}
				<LanesAndBranchesSettings />
			{:else if currentPage.id === "git"}
				<GitSettings />
			{:else if currentPage.id === "integrations"}
				<IntegrationsSettings />
			{:else if currentPage.id === "ai"}
				<AiSettings />
			{:else if currentPage.id === "irc"}
				<IrcSettings />
			{:else if currentPage.id === "telemetry"}
				<TelemetrySettings />
			{:else if currentPage.id === "experimental"}
				<ExperimentalSettings />
			{:else if currentPage.id === "organizations"}
				<OrganisationSettings />
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
				disabled={!globalDraftStore.isDirty || settingsOrchestrator.isSaving}
				onclick={onCancel}
			>
				Cancel
			</Button>
			<Button
				style="pop"
				loading={settingsOrchestrator.isSaving}
				disabled={!globalDraftStore.isDirty || settingsOrchestrator.isSaving}
				onclick={onSave}
			>
				Save changes
			</Button>
		</div>
	{/snippet}

	{#snippet footer()}
		<div class="social">
			<button
				type="button"
				class="social-btn"
				onclick={async () => await urlService.openExternalUrl("https://docs.gitbutler.com/")}
			>
				<Icon name="docs" />
				<span class="text-13 text-bold">Docs</span>
				<div class="text-13 open-link-icon">↗</div>
			</button>
			<button
				type="button"
				class="social-btn"
				onclick={async () => await urlService.openExternalUrl("https://discord.gg/MmFkmaJ42D")}
			>
				<Icon name="discord" />
				<span class="text-13 text-bold">Our Discord</span>
				<div class="text-13 open-link-icon">↗</div>
			</button>
		</div>
	{/snippet}
</SettingsModalLayout>

<style lang="postcss">
	/* BANNERS */
	.social {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.social-btn {
		display: flex;
		align-items: center;
		padding: 8px 12px;
		gap: 12px;
		border-radius: var(--radius-m);
		background-color: var(--bg-1);
		color: var(--text-2);
		text-align: left;
		transition: all var(--transition-fast);

		&:hover {
			background-color: var(--hover-bg-1);
		}
	}

	.open-link-icon {
		transform: translateY(-2px) translateX(-4px);
		color: var(--text-3);
	}

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
