<script lang="ts">
	import { GIT_CONFIG_SERVICE } from "$lib/config/gitConfigService";
	import { SETTINGS_SERVICE } from "$lib/settings/appSettings";
	import { inject } from "@gitbutler/core/context";
	import { CardGroup, Link, Select, SelectItem, Toggle } from "@gitbutler/ui";
	import { bindGeneralField } from "$lib/settings/settingsDraft";

	const gitConfig = inject(GIT_CONFIG_SERVICE);
	const settingsService = inject(SETTINGS_SERVICE);
	const settings = settingsService.appSettings;

	const annotateCommits = bindGeneralField(
		"annotateCommits",
		() => (settings.$ ? (settings.$ as any).gitbutlerCommitter === "1" : true),
		async (v: boolean) => {
			await gitConfig.set("gitbutler.gitbutlerCommitter", v ? "1" : "0");
		},
	);

	const fetchFrequency = bindGeneralField(
		"fetchIntervalMinutes",
		() => (settings.$ ? (settings.$ as any).fetch.autoFetchIntervalMinutes : -1),
		async (v: number) => {
			await settingsService.updateFetch({ autoFetchIntervalMinutes: v });
		},
	);

	const fetchFrequencyOptions = [
		{ label: "1 minute", value: "1", minutes: 1 },
		{ label: "5 minutes", value: "5", minutes: 5 },
		{ label: "10 minutes", value: "10", minutes: 10 },
		{ label: "15 minutes", value: "15", minutes: 15 },
		{ label: "None", value: "none", minutes: -1 },
	] as const;

	function toggleCommitterSigning() {
		annotateCommits.set(!annotateCommits.current);
	}

	function updateFetchFrequency(value: string) {
		const option = fetchFrequencyOptions.find((opt) => opt.value === value);
		if (option) {
			fetchFrequency.set(option.minutes);
		}
	}

	const selectedValue = $derived(
		fetchFrequencyOptions.find((opt) => opt.minutes === fetchFrequency.current)?.value ?? "none",
	);
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
		<Toggle id="committerSigning" checked={annotateCommits.current} onclick={toggleCommitterSigning} />
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
