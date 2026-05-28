<script lang="ts">
	import {
		autoSelectBranchNameFeature,
		autoSelectBranchCreationFeature,
		stagingBehaviorFeature,
		type StagingBehavior,
	} from "$lib/config/uiFeatureFlags";
	import { bindGeneralField } from "$lib/settings/settingsDraft";
	import { CardGroup, RadioButton, Toggle, Spacer } from "@gitbutler/ui";

	const addToLeftmost = bindGeneralField<boolean>(
		"branchPlacementLeftmost",
		() => {
			let v: any;
			import("$lib/config/uiFeatureFlags").then((m) => {
				const store = m.stagingBehaviorFeature;
				store.subscribe((val: any) => (v = val))();
			});
			return v ?? false;
		},
		(v) => {
			import("$lib/config/uiFeatureFlags").then((m) => m.stagingBehaviorFeature.set(v));
		},
	);

	const autoSelectCreation = bindGeneralField<boolean>(
		"autoSelectBranchCreation",
		() => {
			let v: any;
			autoSelectBranchCreationFeature.subscribe((val: any) => (v = val))();
			return v ?? false;
		},
		(v) => autoSelectBranchCreationFeature.set(v),
	);

	const autoSelectRename = bindGeneralField<boolean>(
		"autoSelectBranchName",
		() => {
			let v: any;
			autoSelectBranchNameFeature.subscribe((val: any) => (v = val))();
			return v ?? false;
		},
		(v) => autoSelectBranchNameFeature.set(v),
	);

	const stagingBehavior = bindGeneralField<StagingBehavior>(
		"stagingBehavior",
		() => {
			let v: any;
			stagingBehaviorFeature.subscribe((val: any) => (v = val))();
			return v ?? "all";
		},
		(v) => stagingBehaviorFeature.set(v),
	);

	function onStagingBehaviorFormChange(form: HTMLFormElement) {
		const formData = new FormData(form);
		const selectedStagingBehavior = formData.get("stagingBehaviorType") as StagingBehavior | null;
		if (!selectedStagingBehavior) return;
		stagingBehavior.set(selectedStagingBehavior);
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
			checked={addToLeftmost.current}
			onclick={() => addToLeftmost.set(!addToLeftmost.current)}
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
				checked={autoSelectCreation.current}
				onclick={() => autoSelectCreation.set(!autoSelectCreation.current)}
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
				checked={autoSelectRename.current}
				onclick={() => autoSelectRename.set(!autoSelectRename.current)}
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
					checked={stagingBehavior.current === "all"}
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
					checked={stagingBehavior.current === "selection"}
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
					checked={stagingBehavior.current === "none"}
				/>
			{/snippet}
		</CardGroup.Item>
	</form>
</CardGroup>
