<script lang="ts">
	import { fModeEnabled } from "$lib/config/uiFeatureFlags";
	import { SETTINGS_SERVICE } from "$lib/settings/appSettings";
	import { USER_SERVICE } from "$lib/user/userService.svelte";
	import { inject } from "@gitbutler/core/context";
	import { CardGroup, Toggle } from "@gitbutler/ui";
	import { bindGeneralField } from "$lib/settings/settingsDraft";

	const settingsService = inject(SETTINGS_SERVICE);
	const settingsStore = settingsService.appSettings;

	const userService = inject(USER_SERVICE);

	const fMode = bindGeneralField<boolean>(
		"fModeEnabled",
		() => {
			let v: any;
			fModeEnabled.subscribe((val: any) => (v = val))();
			return v ?? true;
		},
		(v) => fModeEnabled.set(v),
	);

	const singleBranch = bindGeneralField<boolean>(
		"featureFlagSingleBranch",
		() => $settingsStore?.featureFlags.singleBranch ?? false,
		(v) => settingsService.updateFeatureFlags({ singleBranch: v }),
	);

	const irc = bindGeneralField<boolean>(
		"featureFlagIrc",
		() => $settingsStore?.featureFlags.irc ?? false,
		(v) => settingsService.updateFeatureFlags({ irc: v }),
	);
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
				checked={fMode.current}
				onclick={() => fMode.set(!fMode.current)}
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
					checked={singleBranch.current}
					onclick={() => singleBranch.set(!singleBranch.current)}
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
				checked={irc.current}
				onclick={() => irc.set(!irc.current)}
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
