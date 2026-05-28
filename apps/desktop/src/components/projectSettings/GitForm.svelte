<script lang="ts">
	import CommitSigningForm from "$components/projectSettings/CommitSigningForm.svelte";
	import GitHooksForm from "$components/projectSettings/GitHooksForm.svelte";
	import KeysForm from "$components/projectSettings/KeysForm.svelte";
	import ReduxResult from "$components/shared/ReduxResult.svelte";
	import SettingsSection from "$components/shared/SettingsSection.svelte";
	import { BACKEND } from "$lib/backend";
	import { PROJECTS_SERVICE } from "$lib/project/projectsService";
	import { inject } from "@gitbutler/core/context";
	import { CardGroup, Spacer, Toggle } from "@gitbutler/ui";
	import type { Project } from "$lib/project/project";
	import { bindProjectField } from "$lib/settings/settingsDraft";

	const { projectId }: { projectId: string } = $props();
	const projectsService = inject(PROJECTS_SERVICE);
	const projectQuery = $derived(projectsService.getProject(projectId));
	const backend = inject(BACKEND);

	const forcePushProtection = bindProjectField<boolean>(
		"forcePushProtection",
		() => {
			let v: boolean = false;
			projectQuery.result?.response?.force_push_protection ?? false;
			return v;
		},
		async (v: boolean) => {
			const project = projectQuery.result?.response;
			if (project) {
				await projectsService.updateProject({ ...project, force_push_protection: v });
			}
		},
	);
</script>

<SettingsSection>
	<GitHooksForm {projectId} />
	<CommitSigningForm {projectId} />
	{#if backend.platformName !== "windows"}
		<Spacer />
		<KeysForm {projectId} showProjectName={false} />
	{/if}

	<Spacer />
	<ReduxResult {projectId} result={projectQuery.result}>
		{#snippet children(project)}
			<CardGroup>
				<CardGroup.Item labelFor="forcePushProtection">
					{#snippet title()}
						Force push protection
					{/snippet}
					{#snippet caption()}
						Protect remote commits during force pushes. This will use Git's safer force push flags
						to avoid overwriting remote commit history.
					{/snippet}
					{#snippet actions()}
						<Toggle
							id="forcePushProtection"
							checked={forcePushProtection.current}
							onchange={(checked) => forcePushProtection.set(checked)}
						/>
					{/snippet}
				</CardGroup.Item>
			</CardGroup>
		{/snippet}
	</ReduxResult>
</SettingsSection>
