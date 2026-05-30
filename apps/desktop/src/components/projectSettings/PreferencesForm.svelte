<script lang="ts">
	import SettingsSection from "$components/shared/SettingsSection.svelte";
	import { PROJECT_DRAFT_STORE } from "$lib/settings/projectDraftStore";
	import { CardGroup, Toggle } from "@gitbutler/ui";

	const { projectId }: { projectId: string } = $props();
	const projectDraftStore = PROJECT_DRAFT_STORE;
</script>

<SettingsSection gap={8}>
	<CardGroup.Item standalone labelFor="omitCertificateCheck">
		{#snippet title()}
			Ignore host certificate checks
		{/snippet}
		{#snippet caption()}
			Enabling this will ignore host certificate checks when authenticating with ssh.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="omitCertificateCheck"
				checked={projectDraftStore.draft.omitCertificateCheck ?? false}
				onchange={async (value: boolean) => {
					projectDraftStore.updateGitSettings(projectId, {
						omitCertificateCheck: value,
					});
				}}
			/>
		{/snippet}
	</CardGroup.Item>
</SettingsSection>
