<script lang="ts">
	import { GLOBAL_DRAFT_STORE } from "$lib/settings/globalDraftStore";
	import { USER_SERVICE } from "$lib/user/userService.svelte";
	import { inject } from "@gitbutler/core/context";
	import { CardGroup, Toggle } from "@gitbutler/ui";

	const globalDraftStore = GLOBAL_DRAFT_STORE;
	const userService = inject(USER_SERVICE);
</script>

<p class="text-12 text-body experimental-settings__text">
	Flags for features in development or beta. Features may not work fully.
	<br />
	Use at your own risk.
</p>

<CardGroup>
	<CardGroup.Item labelFor="f-mode">
		{#snippet title()}
			F Mode Navigation
		{/snippet}
		{#snippet caption()}
			Enable F mode for quick keyboard navigation to buttons using two-letter shortcuts.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="f-mode"
				checked={globalDraftStore.draft.uiPreferences.fModeEnabled ?? false}
				onclick={() => {
					globalDraftStore.updateUIPreferences({
						fModeEnabled: !globalDraftStore.draft.uiPreferences.fModeEnabled,
					});
				}}
			/>
		{/snippet}
	</CardGroup.Item>

	{#if userService.user?.role === "admin"}
		<CardGroup.Item labelFor="single-branch">
			{#snippet title()}
				Single-branch mode
			{/snippet}
			{#snippet caption()}
				Stay in the workspace view when leaving the gitbutler/workspace branch.
			{/snippet}
			{#snippet actions()}
				<Toggle
					id="single-branch"
					checked={globalDraftStore.draft.appSettings.featureFlags?.singleBranch ?? false}
					onclick={() =>
						globalDraftStore.updateAppSettings({
							featureFlags: {
								singleBranch:
									!globalDraftStore.draft.appSettings.featureFlags?.singleBranch,
							},
						})}
				/>
			{/snippet}
		</CardGroup.Item>
	{/if}

	<CardGroup.Item labelFor="irc">
		{#snippet title()}
			IRC integration
		{/snippet}
		{#snippet caption()}
			Enable IRC for remote collaboration and automated Claude Code session sharing.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="irc"
				checked={globalDraftStore.draft.appSettings.featureFlags?.irc ?? false}
				onclick={() =>
					globalDraftStore.updateAppSettings({
						featureFlags: { irc: !globalDraftStore.draft.appSettings.featureFlags?.irc },
					})}
			/>
		{/snippet}
	</CardGroup.Item>
</CardGroup>

<style>
	.experimental-settings__text {
		margin-bottom: 10px;
		color: var(--text-2);
	}
</style>
