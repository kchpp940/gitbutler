<script lang="ts">
	import { GLOBAL_DRAFT_STORE } from "$lib/settings/globalDraftStore";
	import { inject } from "@gitbutler/core/context";
	import { CardGroup, Link, Select, SelectItem, Toggle } from "@gitbutler/ui";

	const globalDraftStore = GLOBAL_DRAFT_STORE;

	const fetchFrequencyOptions = [
		{ label: "1 minute", value: "1", minutes: 1 },
		{ label: "5 minutes", value: "5", minutes: 5 },
		{ label: "10 minutes", value: "10", minutes: 10 },
		{ label: "15 minutes", value: "15", minutes: 15 },
		{ label: "None", value: "none", minutes: -1 },
	] as const;

	const selectedValue = $derived(
		fetchFrequencyOptions.find(
			(opt) => opt.minutes === globalDraftStore.draft.git.autoFetchIntervalMinutes,
		)?.value ?? "none",
	);

	function toggleCommitterSigning() {
		globalDraftStore.updateGitSettings({
			gitbutlerCommitter: !globalDraftStore.draft.git.gitbutlerCommitter,
		});
	}

	function updateFetchFrequency(value: string) {
		const option = fetchFrequencyOptions.find((opt) => opt.value === value);
		if (option) {
			globalDraftStore.updateGitSettings({ autoFetchIntervalMinutes: option.minutes });
		}
	}
</script>

<CardGroup.Item standalone labelFor="committerSigning">
	{#snippet title()}
		Credit GitButler as the committer
	{/snippet}
	{#snippet caption()}
		By default, everything in the GitButler client is free to use. You can opt in to crediting us as
		the committer in your virtual branch commits to help spread the word.
		<Link
			href="https://github.com/gitbutlerapp/gitbutler-docs/blob/d81a23779302c55f8b20c75bf7842082815b4702/content/docs/features/virtual-branches/committer-mark.mdx"
		>
			Learn more
		</Link>
	{/snippet}
	{#snippet actions()}
		<Toggle
			id="committerSigning"
			checked={globalDraftStore.draft.git.gitbutlerCommitter}
			onclick={toggleCommitterSigning}
		/>
	{/snippet}
</CardGroup.Item>

<CardGroup.Item standalone labelFor="fetchFrequency" alignment="center">
	{#snippet title()}
		Auto-fetch frequency
	{/snippet}
	{#snippet actions()}
		<Select
			id="fetchFrequency"
			options={fetchFrequencyOptions}
			value={selectedValue}
			onselect={updateFetchFrequency}
		>
			{#snippet itemSnippet({ item, highlighted })}
				<SelectItem selected={item.value === selectedValue} {highlighted}>
					{item.label}
				</SelectItem>
			{/snippet}
		</Select>
	{/snippet}
</CardGroup.Item>
