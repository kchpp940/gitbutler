<script lang="ts">
	import AIPromptEntry from "$components/settings/AIPromptEntry.svelte";
	import { GLOBAL_DRAFT_STORE } from "$lib/settings/globalDraftStore";
	import { PROMPT_SERVICE } from "$lib/ai/aiPromptService";
	import { inject } from "@gitbutler/core/context";
	import { Button } from "@gitbutler/ui";
	import { untrack } from "svelte";
	import type { UserPrompt } from "$lib/ai/types";

	interface Props {
		promptUse: "commits" | "branches";
	}

	const { promptUse }: Props = $props();

	const globalDraftStore = GLOBAL_DRAFT_STORE;
	const promptService = inject(PROMPT_SERVICE);

	const prompts = untrack(() => promptUse) === "commits"
		? promptService.commitPrompts
		: promptService.branchPrompts;

	const key = promptUse === "commits" ? "commitUserPrompts" : "branchUserPrompts";
	const draftKey = $derived(key);

	const userPrompts = $derived(
		globalDraftStore.draft.aiPrompts[draftKey] ?? [],
	);

	function createNewPrompt() {
		const newPrompt = promptService.createDefaultUserPrompt(promptUse);
		globalDraftStore.updateAIPrompts({
			[draftKey]: [...$userPrompts, newPrompt],
		});
	}

	function deletePrompt(targetPrompt: UserPrompt) {
		globalDraftStore.updateAIPrompts({
			[draftKey]: $userPrompts.filter((p) => p.id !== targetPrompt.id),
		});
	}

	function updatePrompt(updatedPrompt: UserPrompt) {
		globalDraftStore.updateAIPrompts({
			[draftKey]: $userPrompts.map((p) =>
				p.id === updatedPrompt.id ? updatedPrompt : p,
			),
		});
	}
</script>

<div class="prompt-item__title">
	<h3 class="text-15 text-bold">
		{promptUse === "commits" ? "Commit message" : "Branch name"}
	</h3>
	<Button kind="outline" icon="plus" onclick={createNewPrompt}>New prompt</Button>
</div>
<div class="content">
	<AIPromptEntry
		displayMode="readOnly"
		prompt={{
			prompt: prompts.defaultPrompt,
			name: "Default prompt",
			id: "default",
		}}
	/>

	{#each $userPrompts as _prompt, idx}
		<AIPromptEntry
			prompt={_prompt}
			displayMode="writable"
			deletePrompt={() => deletePrompt(_prompt)}
			onUpdate={(updated) => updatePrompt(updated)}
		/>
	{/each}
</div>

<style lang="postcss">
	.prompt-item__title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
	}

	.content {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
</style>
