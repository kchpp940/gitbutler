<script lang="ts">
	import type { GroupByMode } from "$lib/files/fileGrouping";
	import { UI_STATE } from "$lib/state/uiState.svelte";
	import { inject } from "@gitbutler/core/context";
	import { persisted } from "@gitbutler/shared/persisted";
	import { Menu, MenuButton, MenuItem, Popover } from "@gitbutler/ui";
	import { Icon } from "@gitbutler/ui";

	type Props = {
		groupBy: GroupByMode;
		persistId: string;
	};

	let { persistId, groupBy = $bindable() }: Props = $props();

	const uiState = inject(UI_STATE);
	const saved = $derived(
		persisted<GroupByMode | undefined>(undefined, `file-list-groupby-${persistId}`),
	);

	$effect(() => {
		return saved.subscribe((value) => {
			groupBy = value ?? "none";
		});
	});

	const groupByOptions: { id: GroupByMode; label: string; icon: string }[] = [
		{ id: "none", label: "No Grouping", icon: "list" },
		{ id: "directory", label: "Group by Directory", icon: "folder" },
		{ id: "fileType", label: "Group by File Type", icon: "file-code" },
		{ id: "stack", label: "Group by Stack", icon: "layers" },
		{ id: "selected", label: "Group by Selection", icon: "check-circle" },
	];

	function getCurrentLabel(): string {
		const option = groupByOptions.find((o) => o.id === groupBy);
		return option?.label ?? "No Grouping";
	}

	function getCurrentIcon(): string {
		const option = groupByOptions.find((o) => o.id === groupBy);
		return option?.icon ?? "list";
	}
</script>

<Popover placement="bottom-end">
	<MenuButton
		slot="trigger"
		size="small"
		kind="ghost"
		class="grouping-toggle"
		aria-label="Change grouping mode"
	>
		<Icon name={getCurrentIcon()} size={14} />
		<Icon name="chevron-down" size={12} />
	</MenuButton>

	<Menu slot="content" aria-label="Group by options">
		{#each groupByOptions as option}
			<MenuItem
				id={option.id}
				selected={groupBy === option.id}
				onclick={() => {
					saved.set(option.id);
				}}
			>
				<Icon name={option.icon} slot="leading-icon" />
				{option.label}
			</MenuItem>
		{/each}
	</Menu>
</Popover>

<style lang="postcss">
	.grouping-toggle {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px 6px;
	}
</style>
