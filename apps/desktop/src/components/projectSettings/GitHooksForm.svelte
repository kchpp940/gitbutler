<script lang="ts">
	import SettingsSection from "$components/shared/SettingsSection.svelte";
	import { PROJECT_DRAFT_STORE } from "$lib/settings/projectDraftStore";
	import { CardGroup, Toggle } from "@gitbutler/ui";

	const { projectId }: { projectId: string } = $props();
	const projectDraftStore = PROJECT_DRAFT_STORE;
</script>

<SettingsSection>
	<CardGroup>
		<CardGroup.Item labelFor="runHooks">
			{#snippet title()}
				Run Git hooks
			{/snippet}
			{#snippet caption()}
				Enable running git hooks (pre-push, pre/post-commit, commit-msg) during GitButler actions.
			{/snippet}
			{#snippet actions()}
				<Toggle
					id="runHooks"
					checked={projectDraftStore.draft.runCommitHooks ?? false}
					onchange={(checked) => projectDraftStore.updateDraft(projectId, { runCommitHooks: checked })}
				/>
			{/snippet}
		</CardGroup.Item>
	</CardGroup>

	<CardGroup>
		<CardGroup.Item labelFor="huskyHooks">
			{#snippet title()}
				Enable Husky hooks
			{/snippet}
			{#snippet caption()}
				⚠️ Only enable this for repositories you trust.
				<br />
				Allow GitButler to execute scripts from `.husky` (which can come from the repository). Hooks
				in `.git/hooks` are unaffected.
			{/snippet}
			{#snippet actions()}
				<Toggle
					id="huskyHooks"
					checked={projectDraftStore.draft.huskyHooksEnabled ?? false}
					onchange={(checked) => projectDraftStore.updateDraft(projectId, { huskyHooksEnabled: checked })}
				/>
			{/snippet}
		</CardGroup.Item>
	</CardGroup>
</SettingsSection>
