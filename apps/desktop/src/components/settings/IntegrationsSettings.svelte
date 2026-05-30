<script lang="ts">
	import GithubIntegration from "$components/settings/GithubIntegration.svelte";
	import GitlabIntegration from "$components/settings/GitlabIntegration.svelte";
	import { GLOBAL_DRAFT_STORE } from "$lib/settings/globalDraftStore";
	import { CardGroup, Spacer, Toggle } from "@gitbutler/ui";

	const globalDraftStore = GLOBAL_DRAFT_STORE;

	const reviews = $derived(globalDraftStore.draft.appSettings.reviews);

	function toggleAutoFillPrDescription() {
		globalDraftStore.updateAppSettings({
			reviews: { ...globalDraftStore.draft.appSettings.reviews, autoFillPrDescriptionFromCommit: !reviews?.autoFillPrDescriptionFromCommit },
		});
	}
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
				checked={reviews?.autoFillPrDescriptionFromCommit ?? true}
				onclick={toggleAutoFillPrDescription}
			/>
		{/snippet}
	</CardGroup.Item>
</CardGroup>
