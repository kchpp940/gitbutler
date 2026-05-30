<script lang="ts">
	import { PROJECT_DRAFT_STORE } from "$lib/settings/projectDraftStore";
	import { CardGroup, Link, Toggle } from "@gitbutler/ui";

	type Props = {
		projectId: string;
	};

	const { projectId }: Props = $props();
	const projectDraftStore = PROJECT_DRAFT_STORE;
</script>

<div class="stack-v">
	<CardGroup.Item standalone labelFor="gerritModeToggle">
		{#snippet title()}
			Gerrit configuration
		{/snippet}

		{#snippet caption()}
			Enable or disable Gerrit mode for this project.
			<Link href="https://docs.gitbutler.com/features/gerrit-mode">Learn more</Link>
		{/snippet}

		{#snippet actions()}
			<Toggle
				id="gerritModeToggle"
				checked={projectDraftStore.draft.gerritMode ?? false}
				onchange={(checked) => projectDraftStore.updateDraft(projectId, { gerritMode: checked })}
			/>
		{/snippet}
	</CardGroup.Item>
</div>
