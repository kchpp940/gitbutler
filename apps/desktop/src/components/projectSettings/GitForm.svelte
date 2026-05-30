<script lang="ts">
	import CommitSigningForm from "$components/projectSettings/CommitSigningForm.svelte";
	import GitHooksForm from "$components/projectSettings/GitHooksForm.svelte";
	import KeysForm from "$components/projectSettings/KeysForm.svelte";
	import SettingsSection from "$components/shared/SettingsSection.svelte";
	import { BACKEND } from "$lib/backend";
	import { PROJECT_DRAFT_STORE } from "$lib/settings/projectDraftStore";
	import { inject } from "@gitbutler/core/context";
	import { CardGroup, Spacer, Toggle } from "@gitbutler/ui";

	const { projectId }: { projectId: string } = $props();
	const projectDraftStore = PROJECT_DRAFT_STORE;
	const backend = inject(BACKEND);
</script>

<SettingsSection>
	<GitHooksForm {projectId} />
	<CommitSigningForm {projectId} />
	{#if backend.platformName !== "windows"}
		<Spacer />
		<KeysForm {projectId} showProjectName={false} />
	{/if}

	<Spacer />
	<CardGroup>
		<CardGroup.Item labelFor="forcePushProtection">
			{#snippet title()}
				Force push protection
			{/snippet}
			{#snippet caption()}
				Protect remote commits during force pushes. This will use Git's safer force push flags to
				avoid overwriting remote commit history.
			{/snippet}
			{#snippet actions()}
				<Toggle
					id="forcePushProtection"
					checked={projectDraftStore.draft.forcePushProtection ?? false}
					onchange={(checked) => {
						projectDraftStore.updateGitSettings(projectId, {
							forcePushProtection: checked,
						});
					}}
				/>
			{/snippet}
		</CardGroup.Item>
	</CardGroup>
</SettingsSection>
