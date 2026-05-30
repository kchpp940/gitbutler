<script lang="ts">
	import { GLOBAL_DRAFT_STORE } from "$lib/settings/globalDraftStore";
	import { CardGroup, RadioButton, Toggle, Spacer } from "@gitbutler/ui";
	import type { StagingBehavior } from "$lib/settings/settingsDraftStore";

	const globalDraftStore = GLOBAL_DRAFT_STORE;

	const lanes = $derived(globalDraftStore.draft.lanes);

	function onStagingBehaviorFormChange(form: HTMLFormElement) {
		const formData = new FormData(form);
		const selectedStagingBehavior = formData.get("stagingBehaviorType") as StagingBehavior | null;
		if (!selectedStagingBehavior) return;
		globalDraftStore.updateLanes({ stagingBehavior: selectedStagingBehavior });
	}
</script>

<CardGroup.Item standalone labelFor="add-leftmost">
	{#snippet title()}
		Place new lanes on the left side
	{/snippet}
	{#snippet caption()}
		By default, new lanes are added to the rightmost position. Enable this to add them to the
		leftmost position instead.
	{/snippet}
	{#snippet actions()}
		<Toggle
			id="add-leftmost"
			checked={lanes.branchPlacementLeftmost}
			onclick={() =>
				globalDraftStore.updateLanes({ branchPlacementLeftmost: !lanes.branchPlacementLeftmost })}
		/>
	{/snippet}
</CardGroup.Item>

<CardGroup>
	<CardGroup.Item labelFor="auto-select-creation">
		{#snippet title()}
			Auto-select text on branch creation
		{/snippet}
		{#snippet caption()}
			Automatically select the pre-populated text in the branch name field when creating a new
			branch, making it easier to type your own name.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="auto-select-creation"
				checked={lanes.autoSelectBranchCreation}
				onclick={() =>
					globalDraftStore.updateLanes({
						autoSelectBranchCreation: !lanes.autoSelectBranchCreation,
					})}
			/>
		{/snippet}
	</CardGroup.Item>
	<CardGroup.Item labelFor="auto-select-rename">
		{#snippet title()}
			Auto-select text on branch rename
		{/snippet}
		{#snippet caption()}
			Automatically select the text when renaming a branch or lane, making it easier to replace the
			entire name.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="auto-select-rename"
				checked={lanes.autoSelectBranchName}
				onclick={() =>
					globalDraftStore.updateLanes({ autoSelectBranchName: !lanes.autoSelectBranchName })}
			/>
		{/snippet}
	</CardGroup.Item>
</CardGroup>

<Spacer />

<div class="stack-v gap-8">
	<h2 class="text-15 text-bold">Commit staging behavior</h2>
	<p class="text-12 text-body clr-text-2">
		Controls which files are pre-selected when opening the staging view.
		<br />
		You can always change the selection manually.
	</p>
</div>

<CardGroup>
	<form class="stack-v" onchange={(e) => onStagingBehaviorFormChange(e.currentTarget)}>
		<CardGroup.Item labelFor="stage-all">
			{#snippet title()}
				Auto-select all assigned files
			{/snippet}
			{#snippet caption()}
				Pre-selects all files assigned to this branch. Falls back to unassigned files if none are
				assigned.
			{/snippet}
			{#snippet actions()}
				<RadioButton
					name="stagingBehaviorType"
					value="all"
					id="stage-all"
					checked={lanes.stagingBehavior === "all"}
				/>
			{/snippet}
		</CardGroup.Item>

		<CardGroup.Item labelFor="stage-selection">
			{#snippet title()}
				Auto-select only your picked files
			{/snippet}
			{#snippet caption()}
				Pre-selects only the files you have already picked. Falls back to assigned files, then
				unassigned, if nothing is picked.
			{/snippet}
			{#snippet actions()}
				<RadioButton
					name="stagingBehaviorType"
					value="selection"
					id="stage-selection"
					checked={lanes.stagingBehavior === "selection"}
				/>
			{/snippet}
		</CardGroup.Item>

		<CardGroup.Item labelFor="stage-none">
			{#snippet title()}
				No auto-selection
			{/snippet}
			{#snippet caption()}
				Nothing is pre-selected. You manually pick what to include in each commit.
			{/snippet}
			{#snippet actions()}
				<RadioButton
					name="stagingBehaviorType"
					value="none"
					id="stage-none"
					checked={lanes.stagingBehavior === "none"}
				/>
			{/snippet}
		</CardGroup.Item>
	</form>
</CardGroup>
