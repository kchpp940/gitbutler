<script lang="ts">
	import AIPromptEdit from "$components/settings/AIPromptEdit.svelte";
	import AiCredentialCheck from "$components/settings/AiCredentialCheck.svelte";
	import AuthorizationBanner from "$components/settings/AuthorizationBanner.svelte";
	import SettingsSection from "$components/shared/SettingsSection.svelte";
	import { AISecretHandle, AI_SERVICE, GitAIConfigKey, KeyOption } from "$lib/ai/service";
	import { OpenAIModelName, AnthropicModelName, ModelKind } from "$lib/ai/types";
	import { GIT_CONFIG_SERVICE } from "$lib/config/gitConfigService";
	import { SECRET_SERVICE } from "$lib/secrets/secretsService";
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
	import { bindGeneralField } from "$lib/settings/settingsDraft";

	const gitConfigService = inject(GIT_CONFIG_SERVICE);
	const secretsService = inject(SECRET_SERVICE);
	const aiService = inject(AI_SERVICE);
	const userService = inject(USER_SERVICE);

	const aiModelKind = bindGeneralField<ModelKind>(
		"aiModelKind",
		() => {
			const val = gitConfigService.get(GitAIConfigKey.ModelProvider);
			return (val as ModelKind) || ModelKind.OpenAI;
		},
		(v) => gitConfigService.set(GitAIConfigKey.ModelProvider, v),
	);

	const openAIKeyOption = bindGeneralField<KeyOption>(
		"openAIKeyOption",
		() => {
			const val = gitConfigService.get(GitAIConfigKey.OpenAIKeyOption);
			return (val as KeyOption) || KeyOption.GitButler;
		},
		(v) => gitConfigService.set(GitAIConfigKey.OpenAIKeyOption, v),
	);

	const openAIModelName = bindGeneralField<OpenAIModelName>(
		"openAIModelName",
		() => {
			const val = gitConfigService.get(GitAIConfigKey.OpenAIModelName);
			return (val as OpenAIModelName) || OpenAIModelName.GPT54Nano;
		},
		(v) => gitConfigService.set(GitAIConfigKey.OpenAIModelName, v),
	);

	const openAICustomEndpoint = bindGeneralField<string>(
		"openAICustomEndpoint",
		() => gitConfigService.get(GitAIConfigKey.OpenAICustomEndpoint) || "",
		(v) => gitConfigService.set(GitAIConfigKey.OpenAICustomEndpoint, v),
	);

	const openAIKey = bindGeneralField<string>(
		"openAIKey",
		() => secretsService.get(AISecretHandle.OpenAIKey) || "",
		(v) => secretsService.set(AISecretHandle.OpenAIKey, v),
	);

	const anthropicKeyOption = bindGeneralField<KeyOption>(
		"anthropicKeyOption",
		() => {
			const val = gitConfigService.get(GitAIConfigKey.AnthropicKeyOption);
			return (val as KeyOption) || KeyOption.GitButler;
		},
		(v) => gitConfigService.set(GitAIConfigKey.AnthropicKeyOption, v),
	);

	const anthropicModelName = bindGeneralField<AnthropicModelName>(
		"anthropicModelName",
		() => {
			const val = gitConfigService.get(GitAIConfigKey.AnthropicModelName);
			return (val as AnthropicModelName) || AnthropicModelName.Haiku;
		},
		(v) => gitConfigService.set(GitAIConfigKey.AnthropicModelName, v),
	);

	const anthropicKey = bindGeneralField<string>(
		"anthropicKey",
		() => secretsService.get(AISecretHandle.AnthropicKey) || "",
		(v) => secretsService.set(AISecretHandle.AnthropicKey, v),
	);

	const diffLengthLimit = bindGeneralField<number>(
		"diffLengthLimit",
		() => {
			const val = gitConfigService.get(GitAIConfigKey.DiffLengthLimit);
			return val ? parseInt(val, 10) : 10000;
		},
		(v) => gitConfigService.set(GitAIConfigKey.DiffLengthLimit, v.toString()),
	);

	const ollamaEndpoint = bindGeneralField<string>(
		"ollamaEndpoint",
		() => gitConfigService.get(GitAIConfigKey.OllamaEndpoint) || "",
		(v) => gitConfigService.set(GitAIConfigKey.OllamaEndpoint, v),
	);

	const ollamaModelName = bindGeneralField<string>(
		"ollamaModelName",
		() => gitConfigService.get(GitAIConfigKey.OllamaModelName) || "",
		(v) => gitConfigService.set(GitAIConfigKey.OllamaModelName, v),
	);

	const lmStudioEndpoint = bindGeneralField<string>(
		"lmStudioEndpoint",
		() => gitConfigService.get(GitAIConfigKey.LMStudioEndpoint) || "",
		(v) => gitConfigService.set(GitAIConfigKey.LMStudioEndpoint, v),
	);

	const lmStudioModelName = bindGeneralField<string>(
		"lmStudioModelName",
		() => gitConfigService.get(GitAIConfigKey.LMStudioModelName) || "",
		(v) => gitConfigService.set(GitAIConfigKey.LMStudioModelName, v),
	);

	const openRouterKey = bindGeneralField<string>(
		"openRouterKey",
		() => secretsService.get(AISecretHandle.OpenRouterKey) || "",
		(v) => secretsService.set(AISecretHandle.OpenRouterKey, v),
	);

	const openRouterModelName = bindGeneralField<string>(
		"openRouterModelName",
		() => gitConfigService.get(GitAIConfigKey.OpenRouterModelName) || "",
		(v) => gitConfigService.set(GitAIConfigKey.OpenRouterModelName, v),
	);

	const keyOptions = [
		{ label: "Use GitButler API", value: KeyOption.ButlerAPI },
		{ label: "Your own key", value: KeyOption.BringYourOwn },
	];

	const openAIModelOptions = [
		{ label: "GPT 5.4", value: OpenAIModelName.GPT54 },
		{ label: "GPT 5.4 Mini", value: OpenAIModelName.GPT54Mini },
		{ label: "GPT 5.4 Nano (recommended)", value: OpenAIModelName.GPT54Nano },
	];

	const anthropicModelOptions = [
		{ label: "Haiku (recommended)", value: AnthropicModelName.Haiku },
		{ label: "Sonnet", value: AnthropicModelName.Sonnet },
		{ label: "Opus", value: AnthropicModelName.Opus },
	];

	function onFormChange(formEl: HTMLFormElement) {
		const formData = new FormData(formEl);
		const newModelKind = formData.get("modelKind") as ModelKind;
		aiModelKind.set(newModelKind);
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
	<form class="git-radio" onchange={(e) => onFormChange(e.currentTarget)}>
		<CardGroup.Item labelFor="open-ai">
			{#snippet title()}
				Open AI
			{/snippet}
			{#snippet actions()}
				<RadioButton name="modelKind" id="open-ai" value={ModelKind.OpenAI} checked={aiModelKind.current === ModelKind.OpenAI} />
			{/snippet}
		</CardGroup.Item>
		{#if aiModelKind.current === ModelKind.OpenAI}
			<CardGroup.Item>
				<Select
					value={openAIKeyOption.current}
					options={keyOptions}
					wide
					label="Do you want to provide your own key?"
					onselect={(v) => openAIKeyOption.set(v as KeyOption)}
				>
					{#snippet itemSnippet({ item, highlighted })}
						<SelectItem selected={item.value === openAIKeyOption.current} {highlighted}>
							{item.label}
						</SelectItem>
					{/snippet}
				</Select>

				{#if openAIKeyOption.current === KeyOption.ButlerAPI}
					{#if !userService.user}
						<AuthorizationBanner message="Please sign in to use the GitButler API." />
					{:else}
						{@render shortNote("GitButler uses OpenAI API for commit messages and branch names.")}
					{/if}
				{/if}

				{#if openAIKeyOption.current === KeyOption.BringYourOwn}
					<Textbox
						label="API key"
						type="password"
						value={openAIKey.current}
						required
						placeholder="sk-..."
						onchange={(v) => openAIKey.set(v)}
					/>

					<Select
						value={openAIModelName.current}
						options={openAIModelOptions}
						label="Model version"
						wide
						onselect={(v) => openAIModelName.set(v as OpenAIModelName)}
					>
						{#snippet itemSnippet({ item, highlighted })}
							<SelectItem selected={item.value === openAIModelName.current} {highlighted}>
								{item.label}
							</SelectItem>
						{/snippet}
					</Select>

					<Textbox
						label="Custom endpoint"
						value={openAICustomEndpoint.current}
						placeholder="https://api.openai.com/v1"
						onchange={(v) => openAICustomEndpoint.set(v)}
					/>
				{/if}
			</CardGroup.Item>
		{/if}

		<CardGroup.Item labelFor="anthropic">
			{#snippet title()}
				Anthropic
			{/snippet}
			{#snippet actions()}
				<RadioButton name="modelKind" id="anthropic" value={ModelKind.Anthropic} checked={aiModelKind.current === ModelKind.Anthropic} />
			{/snippet}
		</CardGroup.Item>
		{#if aiModelKind.current === ModelKind.Anthropic}
			<CardGroup.Item>
				<Select
					value={anthropicKeyOption.current}
					options={keyOptions}
					wide
					label="Do you want to provide your own key?"
					onselect={(v) => anthropicKeyOption.set(v as KeyOption)}
				>
					{#snippet itemSnippet({ item, highlighted })}
						<SelectItem selected={item.value === anthropicKeyOption.current} {highlighted}>
							{item.label}
						</SelectItem>
					{/snippet}
				</Select>

				{#if anthropicKeyOption.current === KeyOption.ButlerAPI}
					{#if !userService.user}
						<AuthorizationBanner message="Please sign in to use the GitButler API." />
					{:else}
						{@render shortNote("GitButler uses Anthropic API for commit messages and branch names.")}
					{/if}
				{/if}

				{#if anthropicKeyOption.current === KeyOption.BringYourOwn}
					<Textbox
						label="API key"
						type="password"
						value={anthropicKey.current}
						required
						placeholder="sk-ant-api03-..."
						onchange={(v) => anthropicKey.set(v)}
					/>

					<Select
						value={anthropicModelName.current}
						options={anthropicModelOptions}
						label="Model version"
						onselect={(v) => anthropicModelName.set(v as AnthropicModelName)}
					>
						{#snippet itemSnippet({ item, highlighted })}
							<SelectItem selected={item.value === anthropicModelName.current} {highlighted}>
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
				<RadioButton name="modelKind" id="ollama" value={ModelKind.Ollama} checked={aiModelKind.current === ModelKind.Ollama} />
			{/snippet}
		</CardGroup.Item>
		{#if aiModelKind.current === ModelKind.Ollama}
			<CardGroup.Item>
				<Textbox
					label="Endpoint"
					value={ollamaEndpoint.current}
					placeholder="http://127.0.0.1:11434"
					onchange={(v) => ollamaEndpoint.set(v)}
				/>
				<Textbox
					label="Model"
					value={ollamaModelName.current}
					placeholder="llama3"
					onchange={(v) => ollamaModelName.set(v)}
				/>
				<InfoMessage filled outlined={false}>
					{#snippet title()}
						Configuring Ollama
					{/snippet}
					{#snippet content()}
						To connect to your Ollama endpoint, <b>allow-list it in the app's CSP settings</b>.
						<br />
						See the <Link href="https://docs.gitbutler.com/troubleshooting/custom-csp">docs for details</Link>
					{/snippet}
				</InfoMessage>
			</CardGroup.Item>
		{/if}

		<CardGroup.Item labelFor="lmstudio">
			{#snippet title()}
				LM Studio
			{/snippet}
			{#snippet actions()}
				<RadioButton name="modelKind" id="lmstudio" value={ModelKind.LMStudio} checked={aiModelKind.current === ModelKind.LMStudio} />
			{/snippet}
		</CardGroup.Item>
		{#if aiModelKind.current === ModelKind.LMStudio}
			<CardGroup.Item>
				<Textbox
					label="Endpoint"
					value={lmStudioEndpoint.current}
					placeholder="http://127.0.0.1:1234"
					onchange={(v) => lmStudioEndpoint.set(v)}
				/>
				<Textbox
					label="Model"
					value={lmStudioModelName.current}
					placeholder="model-name"
					onchange={(v) => lmStudioModelName.set(v)}
				/>
			</CardGroup.Item>
		{/if}

		<CardGroup.Item labelFor="openrouter">
			{#snippet title()}
				OpenRouter
			{/snippet}
			{#snippet actions()}
				<RadioButton name="modelKind" id="openrouter" value={ModelKind.OpenRouter} checked={aiModelKind.current === ModelKind.OpenRouter} />
			{/snippet}
		</CardGroup.Item>
		{#if aiModelKind.current === ModelKind.OpenRouter}
			<CardGroup.Item>
				<Textbox
					label="API key"
					type="password"
					value={openRouterKey.current}
					required
					placeholder="sk-or-..."
					onchange={(v) => openRouterKey.set(v)}
				/>
				<Textbox
					label="Model"
					value={openRouterModelName.current}
					placeholder="anthropic/claude-3.5-sonnet"
					onchange={(v) => openRouterModelName.set(v)}
				/>
			</CardGroup.Item>
		{/if}
	</form>
</CardGroup>

<Spacer />

<CardGroup>
	<CardGroup.Item alignment="center">
		{#snippet title()}
			Diff character limit
		{/snippet}
		{#snippet caption()}
			Max number of characters to send in the diff for AI commit generation.
		{/snippet}
		{#snippet actions()}
			<Textbox
				type="number"
				width={120}
				textAlign="center"
				value={diffLengthLimit.current.toString()}
				minVal={1000}
				maxVal={100000}
				onchange={(v) => diffLengthLimit.set(parseInt(v) || 10000)}
			/>
		{/snippet}
	</CardGroup.Item>
</CardGroup>

<Spacer />

<AiCredentialCheck />

<Spacer />

<SettingsSection>
	{#snippet description()}
		Prompts
	{/snippet}
	<AIPromptEdit />
</SettingsSection>

<style lang="postcss">
	.ai-settings__about-text {
		margin-bottom: 16px;
		color: var(--text-2);
	}

	.ai-settings__short-note {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 0;
		color: var(--text-2);
	}
</style>
