<script lang="ts">
	import ReduxResult from "$components/shared/ReduxResult.svelte";
	import SettingsSection from "$components/shared/SettingsSection.svelte";
	import { PROJECTS_SERVICE } from "$lib/project/projectsService";
	import { inject } from "@gitbutler/core/context";
	import { CardGroup, Toggle } from "@gitbutler/ui";
	import { bindProjectField } from "$lib/settings/settingsDraft";

	const { projectId }: { projectId: string } = $props();
	const projectsService = inject(PROJECTS_SERVICE);
	const projectQuery = $derived(projectsService.getProject(projectId));

	const omitCertificateCheck = bindProjectField<boolean>(
		"omitCertificateCheck",
		() => projectQuery.result?.response?.omit_certificate_check ?? false,
		async (v: boolean) => {
			const project = projectQuery.result?.response;
			if (project) {
				await projectsService.updateProject({ ...project, omit_certificate_check: v });
			}
		},
	);
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
				checked={omitCertificateCheck.current}
				onchange={(value: boolean) => omitCertificateCheck.set(value)}
			/>
		{/snippet}
	</CardGroup.Item>
</SettingsSection>
