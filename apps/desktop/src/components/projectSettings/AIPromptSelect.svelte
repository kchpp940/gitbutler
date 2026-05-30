<script lang="ts">
	import { PROMPT_SERVICE } from "$lib/ai/aiPromptService";
	import { PROJECT_DRAFT_STORE } from "$lib/settings/projectDraftStore";
	import { inject } from "@gitbutler/core/context";
	import { Select, SelectItem } from "@gitbutler/ui";
	import { onMount, untrack } from "svelte";
	import type { Prompts, UserPrompt } from "$lib/ai/types";

	type Props = {
		projectId: string;
		promptUse: "commits" | "branches";
	};

	const { projectId, promptUse }: Props = $props();

	const promptService = inject(PROMPT_SERVICE);
	const projectDraftStore = PROJECT_DRAFT_STORE;

	let prompts: Prompts;
	if (untrack(() => promptUse) === "commits") {
		prompts = promptService.commitPrompts;
	} else {
		prompts = promptService.branchPrompts;
	}

	let userPrompts = prompts.userPrompts;
	let allPrompts: UserPrompt[] = $state([]);

	const defaultId = crypto.randomUUID();

	function setAllPrompts(userPrompts: UserPrompt[]) {
		allPrompts = [
			{ name: "Default Prompt", id: defaultId, prompt: prompts.defaultPrompt },
			...userPrompts,
		];
	}

	onMount(() => {
		setAllPrompts($userPrompts);
	});

	let selectedPromptId = $derived(
		promptUse === "commits"
			? projectDraftStore.draft.selectedCommitPromptId
			: projectDraftStore.draft.selectedBranchPromptId,
	);

	$effect(() => {
		if (!selectedPromptId || !promptService.findPrompt(allPrompts, selectedPromptId)) {
			const key = promptUse === "commits" ? "selectedCommitPromptId" : "selectedBranchPromptId";
			projectDraftStore.updateDraft(projectId, { [key]: defaultId });
		}
	});
</script>

<Select
	value={selectedPromptId ?? defaultId}
	options={allPrompts.map((p) => ({ label: p.name, value: p.id }))}
	label={promptUse === "commits" ? "Commit message" : "Branch name"}
	wide={true}
	searchable
	disabled={allPrompts.length === 1}
	onselect={(value) => {
		const key = promptUse === "commits" ? "selectedCommitPromptId" : "selectedBranchPromptId";
		projectDraftStore.updateDraft(projectId, { [key]: value });
	}}
>
	{#snippet itemSnippet({ item, highlighted })}
		<SelectItem selected={item.value === (selectedPromptId ?? defaultId)} {highlighted}>
			{item.label}
		</SelectItem>
	{/snippet}
</Select>
