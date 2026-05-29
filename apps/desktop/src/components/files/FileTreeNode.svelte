<script lang="ts">
	import FileTreeFolder from "$components/files/FileTreeFolder.svelte";
	import Self from "$components/files/FileTreeNode.svelte";
	import { getAllChanges, nodePath } from "$lib/files/filetreeV3";
	import {
		FileChangesViewModel,
		type FolderIntent,
		type SelectionIntent,
	} from "$lib/selection/fileChangesViewModel.svelte";
	import { TestId } from "@gitbutler/ui";
	import type { TreeNode } from "$lib/files/filetreeV3";
	import type { TreeChange } from "@gitbutler/but-sdk";
	import type { Snippet } from "svelte";

	type Props = {
		projectId: string;
		stackId?: string;
		viewModel: FileChangesViewModel;
		node: TreeNode;
		isRoot?: boolean;
		showCheckboxes?: boolean;
		draggableFiles?: boolean;
		depth?: number;
		fileTemplate: Snippet<[TreeChange, number, number]>;
	};

	let {
		projectId,
		stackId,
		viewModel,
		node,
		isRoot = false,
		showCheckboxes,
		draggableFiles,
		depth = 0,
		fileTemplate,
	}: Props = $props();

	const folderPath = $derived(node.kind === "dir" ? nodePath(node) : "");
	const isExpanded = $derived(viewModel.isFolderExpanded(folderPath));
	const active = $derived(viewModel.keyboardState.current.active);

	let mouseClickPending = false;

	function handleToggle() {
		const intent: FolderIntent = { type: "toggle", path: folderPath };
		viewModel.dispatchFolder(intent);
	}

	function selectFolderContents(addToSelection = false) {
		if (node.kind !== "dir") return;
		const folderChanges = getAllChanges(node);
		if (folderChanges.length === 0) return;

		const indexMap = new Map(viewModel.changes.map((c, i) => [c.path, i]));

		if (!addToSelection) {
			viewModel.dispatchSelection({ type: "clear" });
		}

		const last = folderChanges.at(-1)!;
		const lastIndex = indexMap.get(last.path) ?? 0;
		const firstIndex = indexMap.get(folderChanges[0]!.path) ?? 0;
		viewModel.dispatchSelection({
			type: "selectRange",
			fromIndex: firstIndex,
			toIndex: lastIndex,
		});
	}

	function handleFolderClick(e: MouseEvent) {
		selectFolderContents(e.ctrlKey || e.metaKey || e.shiftKey);
	}

	function handleFolderMouseDown() {
		mouseClickPending = true;
		setTimeout(() => {
			mouseClickPending = false;
		}, 0);
	}

	function handleFolderKeyDown(e: KeyboardEvent): boolean {
		const folderChanges = getAllChanges(node);
		if (folderChanges.length === 0) return false;

		if ((e.key === "ArrowDown" || e.key === "j") && !e.shiftKey) {
			const firstFile = folderChanges[0]!;
			const idx = viewModel.changes.findIndex((c) => c.path === firstFile.path);
			if (idx !== -1) {
				const intent: SelectionIntent = {
					type: "select",
					path: firstFile.path,
					index: idx,
					modifier: "none",
				};
				viewModel.dispatchSelection(intent);
			}
		} else if ((e.key === "ArrowUp" || e.key === "k") && !e.shiftKey) {
			const firstFile = folderChanges[0]!;
			const idx = viewModel.changes.findIndex((c) => c.path === firstFile.path);
			if (idx > 0) {
				const prevFile = viewModel.changes[idx - 1]!;
				const intent: SelectionIntent = {
					type: "select",
					path: prevFile.path,
					index: idx - 1,
					modifier: "none",
				};
				viewModel.dispatchSelection(intent);
			}
		}
		return false;
	}
</script>

{#if isRoot}
	{#each node.children as childNode (childNode.name)}
		<Self
			{projectId}
			{stackId}
			{viewModel}
			{depth}
			node={childNode}
			{showCheckboxes}
			{draggableFiles}
			{fileTemplate}
		/>
	{/each}
{:else if node.kind === "file"}
	{@render fileTemplate(node.change, node.index, depth)}
{:else}
	<FileTreeFolder
		{projectId}
		{stackId}
		{viewModel}
		testId={TestId.FileListTreeFolder}
		{depth}
		{isExpanded}
		showCheckbox={showCheckboxes}
		draggable={draggableFiles}
		{node}
		{active}
		focusableOpts={{
			focusable: true,
			onAction: () => selectFolderContents(),
			onActive: (isActive) => {
				if (isActive && !mouseClickPending) selectFolderContents();
			},
			onKeydown: handleFolderKeyDown,
		}}
		onmousedown={handleFolderMouseDown}
		onclick={handleFolderClick}
		ontoggle={handleToggle}
	/>

	{#if isExpanded}
		{#each node.children as childNode (childNode.name)}
			<Self
				{projectId}
				{stackId}
				{viewModel}
				depth={depth + 1}
				node={childNode}
				{showCheckboxes}
				{draggableFiles}
				{fileTemplate}
			/>
		{/each}
	{/if}
{/if}
