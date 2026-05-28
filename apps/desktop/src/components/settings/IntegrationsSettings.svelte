<script lang="ts">
	import GithubIntegration from "$components/settings/GithubIntegration.svelte";
	import GitlabIntegration from "$components/settings/GitlabIntegration.svelte";
	import { SETTINGS_SERVICE } from "$lib/settings/appSettings";
	import { inject } from "@gitbutler/core/context";
	import { CardGroup, Spacer, Toggle } from "@gitbutler/ui";
	import { bindGeneralField } from "$lib/settings/settingsDraft";

	const settingsService = inject(SETTINGS_SERVICE);
	const appSettings = settingsService.appSettings;

	const autoFillPrDescription = bindGeneralField<boolean>(
		"autoFillPrDescription",
		() => $appSettings?.reviews.autoFillPrDescriptionFromCommit ?? true,
		(v) => settingsService.updateReviews({ autoFillPrDescriptionFromCommit: v }),
	);
</script>

<GithubIntegration />
<GitlabIntegration />
<Spacer />
<CardGroup>
	<CardGroup.Item labelFor="autoFillPrDescription">
		{#snippet title()}
			Auto-fill PR/MR descriptions from commit
		{/snippet}
		{#snippet caption()}
			Set the title and description from the commit for single-commit branches.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="autoFillPrDescription"
				checked={autoFillPrDescription.current}
				onclick={() => autoFillPrDescription.set(!autoFillPrDescription.current)}
			/>
		{/snippet}
	</CardGroup.Item>
</CardGroup>
