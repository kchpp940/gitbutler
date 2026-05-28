<script lang="ts">
	import AiPromptSelect from "$components/projectSettings/AIPromptSelect.svelte";
	import AccessTokenSignIn from "$components/shared/AccessTokenSignIn.svelte";
	import SettingsSection from "$components/shared/SettingsSection.svelte";
	import { projectAiExperimentalFeaturesEnabled, projectAiGenEnabled } from "$lib/config/config";
	import { useSettingsModal } from "$lib/settings/settingsModal.svelte";
	import { USER_SERVICE } from "$lib/user/userService.svelte";
	import { inject } from "@gitbutler/core/context";
	import { Button, CardGroup, Spacer, Toggle } from "@gitbutler/ui";
	import { bindProjectField } from "$lib/settings/settingsDraft";

	const { projectId }: { projectId: string } = $props();

	const userService = inject(USER_SERVICE);
	const { openGeneralSettings } = useSettingsModal();

	const aiGenEnabledStore = projectAiGenEnabled(projectId);
	const experimentalAiGenEnabledStore = projectAiExperimentalFeaturesEnabled(projectId);

	const aiGenEnabledField = bindProjectField<boolean>(
		"projectAiGenEnabled",
		() => {
			let v: any;
			aiGenEnabledStore.subscribe((val: any) => (v = val))();
			return v ?? true;
		},
		(v) => aiGenEnabledStore.set(v),
	);

	const experimentalAiGenEnabledField = bindProjectField<boolean>(
		"projectAiExperimentalEnabled",
		() => {
			let v: any;
			experimentalAiGenEnabledStore.subscribe((val: any) => (v = val))();
			return v ?? false;
		},
		(v) => experimentalAiGenEnabledStore.set(v),
	);
</script>

<SettingsSection>
	{#snippet description()}
		GitButler supports the use of OpenAI and Anthropic to provide commit message and branch name
		generation. This works either through GitButler's API or in a bring your own key configuration
		and can be configured in the main preferences screen.
	{/snippet}

	<Spacer />

	{#if !userService.user}
		<AccessTokenSignIn />
		<Spacer />
	{/if}

	<CardGroup>
		<CardGroup.Item labelFor="aiGenEnabled">
			{#snippet title()}
				Enable branch and commit message generation
			{/snippet}
			{#snippet caption()}
				If enabled, diffs will be sent to OpenAI or Anthropic's servers when pressing the "Generate
				message" and "Generate branch name" button.
			{/snippet}
			{#snippet actions()}
				<Toggle
					id="aiGenEnabled"
					checked={aiGenEnabledField.current}
					onclick={() => aiGenEnabledField.set(!aiGenEnabledField.current)}
				/>
			{/snippet}
		</CardGroup.Item>
	</CardGroup>

	{#if aiGenEnabledField.current}
		<CardGroup>
			<CardGroup.Item labelFor="aiExperimental">
				{#snippet title()}
					Enable experimental AI features
				{/snippet}
				{#snippet caption()}
					If enabled, you will be able to access the AI features currently in development. This also
					requires you to use OpenAI through GitButler in order for the features to work.
				{/snippet}
				{#snippet actions()}
					<Toggle
						id="aiExperimental"
						checked={experimentalAiGenEnabledField.current}
						onclick={() => experimentalAiGenEnabledField.set(!experimentalAiGenEnabledField.current)}
					/>
				{/snippet}
			</CardGroup.Item>
		</CardGroup>
	{/if}

	<CardGroup>
		<CardGroup.Item>
			{#snippet title()}
				Custom prompts
			{/snippet}

			<AiPromptSelect {projectId} promptUse="commits" />
			<AiPromptSelect {projectId} promptUse="branches" />

			<Spacer margin={8} />

			<p class="text-12 text-body">
				You can apply your own custom prompts to the project. By default, the project uses GitButler
				prompts, but you can create your own prompts in the general settings.
			</p>
			<Button kind="outline" icon="edit" onclick={() => openGeneralSettings("ai")}
				>Customize prompts</Button
			>
		</CardGroup.Item>
	</CardGroup>
</SettingsSection>
