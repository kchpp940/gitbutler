<script lang="ts">
	import { computeChangeStatus } from "$lib/files/fileStatus";
	import { abbreviateFolders, changesToFileTree, nodePath } from "$lib/files/filetreeV3";
	import { FOLDER_EXPANDED_STORE } from "$lib/files/folderExpandedState.svelte";
	import { isExecutableStatus } from "$lib/hunks/change";
	import { PROJECT_UI_STATE_SERVICE } from "$lib/project/projectUiStateService.svelte";
	import { UNCOMMITTED_SERVICE } from "$lib/selection/uncommittedService.svelte";
	import { FileListItem, FolderListItem } from "@gitbutler/ui";
	import { inject } from "@gitbutler/core/context";
	import type { TreeNode } from "$lib/files/filetreeV3";
	import type { TreeChange } from "@gitbutler/but-sdk";
	import type { FocusableOptions } from "@gitbutler/ui/focus/focusTypes";

	type Props = {
		projectId: string;
		changes: TreeChange[];
		selectedIndex?: number;
		visibleRange?: { start: number; end: number };
		listMode?: "list" | "tree";
		getItemFocusableOpts?: (index: number) => FocusableOptions;
		onFileClick?: (index: number) => void;
		onFileContextMenu?: (e: MouseEvent, change: TreeChange) => void;
	};

	const {
		projectId,
		changes,
		selectedIndex,
		visibleRange,
		listMode = "list",
		getItemFocusableOpts,
		onFileClick,
		onFileContextMenu,
	}: Props = $props();

	const folderExpandedStore = inject(FOLDER_EXPANDED_STORE);
	const uncommittedService = inject(UNCOMMITTED_SERVICE);
	const projectUiStateService = inject(PROJECT_UI_STATE_SERVICE);
	const folderExpanded = $derived(folderExpandedStore.forProject(projectId));

	const tree = $derived(abbreviateFolders(changesToFileTree(changes)));
	const dataVersion = $derived(uncommittedService.getDataVersion());
	let lastConsumedVersion = $state(-1);

	$effect(() => {
		if (changes.length > 0 && folderExpandedStore.hasPendingRestore(projectId)) {
			if (dataVersion !== lastConsumedVersion) {
				projectUiStateService.consumeFolderExpandedRestore(projectId);
				lastConsumedVersion = dataVersion;
			}
		}
	});

	function isFolderExpanded(path: string): boolean {
		return folderExpanded.get(path) ?? true;
	}
</script>

{#snippet treeNodes(node: TreeNode, depth: number)}
	{#if node.kind === "file"}
		<!-- `selected` = visual highlight; `active` = keyboard/focus state.
		     Both track the same index because selection and focus are always linked here. -->
		<FileListItem
			filePath={node.change.path}
			fileStatus={computeChangeStatus(node.change)}
			executable={isExecutableStatus(node.change.status)}
			selected={selectedIndex === node.index}
			active={selectedIndex === node.index}
			notched={visibleRange !== undefined &&
				node.index >= visibleRange.start &&
				node.index < visibleRange.end}
			listMode="tree"
			{depth}
			actionOpts={getItemFocusableOpts?.(node.index)}
			onclick={() => onFileClick?.(node.index)}
			oncontextmenu={(e) => onFileContextMenu?.(e, node.change)}
		/>
	{:else if node.parent === undefined}
		{#each node.children as child (child.name)}
			{@render treeNodes(child, depth)}
		{/each}
	{:else}
		<FolderListItem
			name={node.name}
			isExpanded={isFolderExpanded(nodePath(node))}
			{depth}
			ontoggle={(v) => folderExpanded.set(nodePath(node), v)}
		/>
		{#if isFolderExpanded(nodePath(node))}
			{#each node.children as child (child.name)}
				{@render treeNodes(child, depth + 1)}
			{/each}
		{/if}
	{/if}
{/snippet}

{#if listMode === "tree"}
	{@render treeNodes(tree, 0)}
{:else}
	{#each changes as change, index}
		<!-- See tree branch above for why `selected` and `active` are always the same value. -->
		<FileListItem
			filePath={change.path}
			fileStatus={computeChangeStatus(change)}
			executable={isExecutableStatus(change.status)}
			selected={selectedIndex === index}
			active={selectedIndex === index}
			notched={visibleRange !== undefined &&
				index >= visibleRange.start &&
				index < visibleRange.end}
			listMode="list"
			isLast={index === changes.length - 1}
			actionOpts={getItemFocusableOpts?.(index)}
			onclick={() => onFileClick?.(index)}
			oncontextmenu={(e) => onFileContextMenu?.(e, change)}
		/>
	{/each}
{/if}
