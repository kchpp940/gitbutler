<script lang="ts">
	import AIPromptEdit from "$components/settings/AIPromptEdit.svelte";
	import AiCredentialCheck from "$components/settings/AiCredentialCheck.svelte";
	import AuthorizationBanner from "$components/settings/AuthorizationBanner.svelte";
	import SettingsSection from "$components/shared/SettingsSection.svelte";
	import { GLOBAL_DRAFT_STORE } from "$lib/settings/globalDraftStore";
	import { KeyOption } from "$lib/ai/service";
	import { ModelKind } from "$lib/ai/types";
	import type { OpenAIModelName, AnthropicModelName } from "$lib/ai/types";
	import { USER_SERVICE } from "$lib/user/userService.svelte";
	import { inject } from "@gitbutler/core/context";
	import {
		CardGroup,
		Icon,
		InfoMessage,
		Link,
		RadioButton,
		Select,
		SelectItem,
		Spacer,
		Textbox,
	} from "@gitbutler/ui";

	const userService = inject(USER_SERVICE);
	const globalDraftStore = GLOBAL_DRAFT_STORE;

	const keyOptions = [
		{
			label: "Use GitButler API",
			value: KeyOption.ButlerAPI,
		},
		{
			label: "Your own key",
			value: KeyOption.BringYourOwn,
		},
	];

	const openAIModelOptions = [
		{
			label: "GPT 5.4",
			value: "gpt-5.4",
		},
		{
			label: "GPT 5.4 Mini",
			value: "gpt-5.4-mini",
		},
		{
			label: "GPT 5.4 Nano (recommended)",
			value: "gpt-5.4-nano",
		},
	];

	const anthropicModelOptions = [
		{
			label: "Haiku (recommended)",
			value: "claude-sonnet-4.5-20250514",
		},
		{
			label: "Sonnet",
			value: "claude-opus-4.1-20250514",
		},
		{
			label: "Opus",
			value: "claude-haiku-4.5-20250514",
		},
	];

	let form = $state<HTMLFormElement>();

	function onFormChange(form: HTMLFormElement) {
		const formData = new FormData(form);
		const modelKind = formData.get("modelKind") as ModelKind;
		globalDraftStore.updateAISettings({ modelKind });
	}
</script>

{#snippet shortNote(text: string)}
	<div class="ai-settings__short-note">
		<Icon name="info" size={14} />
		<p class="text-12 text-body">{text}</p>
	</div>
{/snippet}

<p class="text-13 text-body ai-settings__about-text">
	GitButler supports multiple AI providers: OpenAI and Anthropic (via API or your own key),
	OpenRouter for access to hundreds of models, plus local models through Ollama and LM Studio.
</p>

<CardGroup>
	<form class="git-radio" bind:this={form} onchange={(e) => onFormChange(e.currentTarget)}>
		<CardGroup.Item labelFor="open-ai">
			{#snippet title()}
				Open AI
			{/snippet}
			{#snippet actions()}
				<RadioButton name="modelKind" id="open-ai" value={ModelKind.OpenAI} />
			{/snippet}
		</CardGroup.Item>
		{#if globalDraftStore.draft.ai.modelKind === ModelKind.OpenAI}
			<CardGroup.Item>
				<Select
					value={globalDraftStore.draft.ai.openAIKeyOption}
					options={keyOptions}
					wide
					label="Do you want to provide your own key?"
					onselect={(value) => {
						globalDraftStore.updateAISettings({ openAIKeyOption: value as KeyOption });
					}}
				>
					{#snippet itemSnippet({ item, highlighted })}
						<SelectItem
							selected={item.value === globalDraftStore.draft.ai.openAIKeyOption}
							{highlighted}
						>
							{item.label}
						</SelectItem>
					{/snippet}
				</Select>

				{#if globalDraftStore.draft.ai.openAIKeyOption === KeyOption.ButlerAPI}
					{#if !userService.user}
						<AuthorizationBanner message="Please sign in to use the GitButler API." />
					{:else}
						{@render shortNote("GitButler uses OpenAI API for commit messages and branch names.")}
					{/if}
				{/if}

				{#if globalDraftStore.draft.ai.openAIKeyOption === KeyOption.BringYourOwn}
					<Textbox
						label="API key"
						type="password"
						value={globalDraftStore.draft.ai.openAIKey}
						required
						placeholder="sk-..."
						oninput={(value: string) => {
							globalDraftStore.updateAISettings({ openAIKey: value });
						}}
					/>

					<Select
						value={globalDraftStore.draft.ai.openAIModelName}
						options={openAIModelOptions}
						label="Model version"
						wide
						onselect={(value) => {
							globalDraftStore.updateAISettings({ openAIModelName: value as OpenAIModelName });
						}}
					>
						{#snippet itemSnippet({ item, highlighted })}
							<SelectItem
								selected={item.value === globalDraftStore.draft.ai.openAIModelName}
								{highlighted}
							>
								{item.label}
							</SelectItem>
						{/snippet}
					</Select>

					<Textbox
						label="Custom endpoint"
						value={globalDraftStore.draft.ai.openAICustomEndpoint}
						placeholder="https://api.openai.com/v1"
						oninput={(value: string) => {
							globalDraftStore.updateAISettings({ openAICustomEndpoint: value });
						}}
					/>
				{/if}
			</CardGroup.Item>
		{/if}

		<CardGroup.Item labelFor="anthropic">
			{#snippet title()}
				Anthropic
			{/snippet}
			{#snippet actions()}
				<RadioButton name="modelKind" id="anthropic" value={ModelKind.Anthropic} />
			{/snippet}
		</CardGroup.Item>
		{#if globalDraftStore.draft.ai.modelKind === ModelKind.Anthropic}
			<CardGroup.Item>
				<Select
					value={globalDraftStore.draft.ai.anthropicKeyOption}
					options={keyOptions}
					wide
					label="Do you want to provide your own key?"
					onselect={(value) => {
						globalDraftStore.updateAISettings({ anthropicKeyOption: value as KeyOption });
					}}
				>
					{#snippet itemSnippet({ item, highlighted })}
						<SelectItem
							selected={item.value === globalDraftStore.draft.ai.anthropicKeyOption}
							{highlighted}
						>
							{item.label}
						</SelectItem>
					{/snippet}
				</Select>

				{#if globalDraftStore.draft.ai.anthropicKeyOption === KeyOption.ButlerAPI}
					{#if !userService.user}
						<AuthorizationBanner message="Please sign in to use the GitButler API." />
					{:else}
						{@render shortNote(
							"GitButler uses Anthropic API for commit messages and branch names.",
						)}
					{/if}
				{/if}

				{#if globalDraftStore.draft.ai.anthropicKeyOption === KeyOption.BringYourOwn}
					<Textbox
						label="API key"
						type="password"
						value={globalDraftStore.draft.ai.anthropicKey}
						required
						placeholder="sk-ant-api03-..."
						oninput={(value: string) => {
							globalDraftStore.updateAISettings({ anthropicKey: value });
						}}
					/>

					<Select
						value={globalDraftStore.draft.ai.anthropicModelName}
						options={anthropicModelOptions}
						label="Model version"
						onselect={(value) => {
							globalDraftStore.updateAISettings({
								anthropicModelName: value as AnthropicModelName,
							});
						}}
					>
						{#snippet itemSnippet({ item, highlighted })}
							<SelectItem
								selected={item.value === globalDraftStore.draft.ai.anthropicModelName}
								{highlighted}
							>
								{item.label}
							</SelectItem>
						{/snippet}
					</Select>
				{/if}
			</CardGroup.Item>
		{/if}

		<CardGroup.Item labelFor="ollama">
			{#snippet title()}
				Ollama 🦙
			{/snippet}
			{#snippet actions()}
				<RadioButton name="modelKind" id="ollama" value={ModelKind.Ollama} />
			{/snippet}
		</CardGroup.Item>
		{#if globalDraftStore.draft.ai.modelKind === ModelKind.Ollama}
			<CardGroup.Item>
				<Textbox
					label="Endpoint"
					value={globalDraftStore.draft.ai.ollamaEndpoint}
					placeholder="http://127.0.0.1:11434"
					oninput={(value: string) => {
						globalDraftStore.updateAISettings({ ollamaEndpoint: value });
					}}
				/>
				<Textbox
					label="Model"
					value={globalDraftStore.draft.ai.ollamaModel}
					placeholder="llama3"
					oninput={(value: string) => {
						globalDraftStore.updateAISettings({ ollamaModel: value });
					}}
				/>
				<InfoMessage filled outlined={false}>
					{#snippet title()}
						Configuring Ollama
					{/snippet}
					{#snippet content()}
						To connect to your Ollama endpoint, <b>allow-list it in the app’s CSP settings</b>.
						<br />
						See the <Link href="https://docs.gitbutler.com/troubleshooting/custom-csp"
							>docs for details</Link
						>
					{/snippet}
				</InfoMessage>
			</CardGroup.Item>
		{/if}

		<CardGroup.Item labelFor="lmstudio">
			{#snippet title()}
				LM Studio
			{/snippet}
			{#snippet actions()}
				<RadioButton name="modelKind" id="lmstudio" value={ModelKind.LMStudio} />
			{/snippet}
		</CardGroup.Item>
		{#if globalDraftStore.draft.ai.modelKind === ModelKind.LMStudio}
			<CardGroup.Item>
				<Textbox
					label="Endpoint"
					value={globalDraftStore.draft.ai.lmStudioEndpoint}
					placeholder="http://127.0.0.1:1234"
					oninput={(value: string) => {
						globalDraftStore.updateAISettings({ lmStudioEndpoint: value });
					}}
				/>
				<Textbox
					label="Model"
					value={globalDraftStore.draft.ai.lmStudioModel}
					placeholder="default"
					oninput={(value: string) => {
						globalDraftStore.updateAISettings({ lmStudioModel: value });
					}}
				/>
				<InfoMessage filled outlined={false}>
					{#snippet title()}
						Configuring LM Studio
					{/snippet}
					{#snippet content()}
						<div class="ai-settings__section-text-block">
							<p>Connecting to your LM Studio endpoint requires that you do two things:</p>

							<p>
								1. <span class="text-bold"
									>Allow-list it in the CSP settings for the application</span
								>. You can find more details on how to do that in the <Link
									href="https://docs.gitbutler.com/troubleshooting/custom-csp">GitButler docs</Link
								>.
							</p>

							<p>
								2. <span class="text-bold">Enable CORS support in LM Studio</span>. You can find
								more details on how to do that in the <Link
									href="https://lmstudio.ai/docs/cli/server-start#enable-cors-support"
									>LM Studio docs</Link
								>.
							</p>
						</div>
					{/snippet}
				</InfoMessage>
			</CardGroup.Item>
		{/if}

		<CardGroup.Item labelFor="openrouter">
			{#snippet title()}
				OpenRouter
			{/snippet}
			{#snippet actions()}
				<RadioButton name="modelKind" id="openrouter" value={ModelKind.OpenRouter} />
			{/snippet}
		</CardGroup.Item>
		{#if globalDraftStore.draft.ai.modelKind === ModelKind.OpenRouter}
			<CardGroup.Item>
				<Textbox
					label="API key"
					type="password"
					value={globalDraftStore.draft.ai.openRouterKey}
					required
					placeholder="sk-or-..."
					oninput={(value: string) => {
						globalDraftStore.updateAISettings({ openRouterKey: value });
					}}
				/>

				<Textbox
					label="Model"
					value={globalDraftStore.draft.ai.openRouterModel}
					placeholder="openai/gpt-4.1-mini"
					oninput={(value: string) => {
						globalDraftStore.updateAISettings({ openRouterModel: value });
					}}
				/>
			</CardGroup.Item>
		{/if}

		<CardGroup.Item>
			<AiCredentialCheck />
		</CardGroup.Item>
	</form>
</CardGroup>

<Spacer />

<CardGroup.Item standalone>
	{#snippet title()}
		Amount of provided context
	{/snippet}
	{#snippet caption()}
		How many characters of your git diff should be provided to AI
	{/snippet}
	{#snippet actions()}
		<Textbox
			type="number"
			width={80}
			textAlign="center"
			value={globalDraftStore.draft.ai.diffLengthLimit?.toString()}
			minVal={100}
			oninput={(value: string) => {
				globalDraftStore.updateAISettings({ diffLengthLimit: parseInt(value) });
			}}
			placeholder="5000"
		/>
	{/snippet}
</CardGroup.Item>

<Spacer />

<SettingsSection>
	{#snippet title()}
		Custom AI prompts
	{/snippet}
	{#snippet description()}
		GitButler's AI assistant generates commit messages and branch names. Use default prompts or
		create your own. Assign prompts in the project settings.
	{/snippet}

	<div class="prompt-groups">
		<AIPromptEdit promptUse="commits" />
		<Spacer margin={12} />
		<AIPromptEdit promptUse="branches" />
	</div>
</SettingsSection>

<style>
	.ai-settings__about-text {
		margin-bottom: 12px;
		color: var(--text-2);
	}

	.prompt-groups {
		display: flex;
		flex-direction: column;
		margin-top: 16px;
		gap: 12px;
	}

	.ai-settings__short-note {
		display: flex;
		align-items: center;
		padding: 6px 10px;
		gap: 8px;
		border-radius: var(--radius-m);
		background-color: var(--bg-2);
		color: var(--text-2);
	}

	.ai-settings__section-text-block {
		display: flex;
		flex-direction: column;
	}
</style>
