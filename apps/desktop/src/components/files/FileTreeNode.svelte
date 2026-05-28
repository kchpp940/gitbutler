<script lang="ts">
	import FileTreeFolder from "$components/files/FileTreeFolder.svelte";
	import Self from "$components/files/FileTreeNode.svelte";
	import { getAllChanges } from "$lib/files/filetreeV3";
	import {
		getFileListContext,
	} from "$lib/selection/fileListController.svelte";
	import { TestId } from "@gitbutler/ui";
	import type { TreeNode } from "$lib/files/filetreeV3";
	import type { TreeChange } from "@gitbutler/but-sdk";
	import type { Snippet } from "svelte";

	type Props = {
		projectId: string;
		stackId?: string;
		node: TreeNode;
		isRoot?: boolean;
		showCheckboxes?: boolean;
		draggableFiles?: boolean;
		depth?: number;
		initiallyExpanded?: boolean;
		fileTemplate: Snippet<[TreeChange, number, number]>;
		active?: boolean;
	};

	let {
		projectId,
		stackId,
		node,
		isRoot = false,
		showCheckboxes,
		draggableFiles,
		depth = 0,
		fileTemplate,
		active,
	}: Props = $props();

	const controller = getFileListContext();

	// Local state to track whether the folder is expanded
	let isExpanded = $state<boolean>(true);

	// Flag to suppress keyboard-nav selection when a mouse click is in progress
	let mouseClickPending = false;

	// Handler for toggling the folder
	function handleToggle() {
		isExpanded = !isExpanded;
	}

	// Selects all files nested under this folder node
	function selectFolderContents(addToSelection = false) {
		if (node.kind !== "dir") return;
		const folderChanges = getAllChanges(node);
		if (folderChanges.length === 0) return;

		if (!addToSelection) {
			controller.selection.clear(controller.selectionId);
		}

		const last = folderChanges.at(-1)!;
		const lastIndex = controller.getIndexByPath(last.path);
		controller.selection.addMany(
			folderChanges.map((c) => c.path),
			controller.selectionId,
			{ path: last.path, index: lastIndex },
		);
	}

	// Handler for clicking a folder — respects modifier keys for multi-select
	function handleFolderClick(e: MouseEvent) {
		selectFolderContents(e.ctrlKey || e.metaKey || e.shiftKey);
	}

	// Set pending flag on mousedown so onActive skips selection during mouse clicks
	function handleFolderMouseDown() {
		mouseClickPending = true;
		setTimeout(() => {
			mouseClickPending = false;
		}, 0);
	}

	// Handles arrow-key navigation away from a folder by updating file selection
	// before FocusManager moves focus to the next/prev item.
	function handleFolderKeyDown(e: KeyboardEvent): boolean {
		const folderChanges = getAllChanges(node);
		if (folderChanges.length === 0) return false;

		if ((e.key === "ArrowDown" || e.key === "j") && !e.shiftKey) {
			// FocusManager will focus the first file in this folder next.
			const firstFile = folderChanges[0]!;
			const idx = controller.getIndexByPath(firstFile.path);
			if (idx !== -1) {
				controller.selection.set(firstFile.path, controller.selectionId, idx);
			}
		} else if ((e.key === "ArrowUp" || e.key === "k") && !e.shiftKey) {
			// FocusManager will focus the item before this folder next.
			const firstFile = folderChanges[0]!;
			const idx = controller.getIndexByPath(firstFile.path);
			if (idx > 0) {
				const prevChange = controller.changes[idx - 1];
				if (prevChange) {
					controller.selection.set(prevChange.path, controller.selectionId, idx - 1);
				}
			}
		}
		return false; // Let FocusManager handle the actual focus movement
	}
</script>

{#if isRoot}
	<!-- Node is a root and should only render children! -->
	{#each node.children as childNode (childNode.name)}
		<Self
			{projectId}
			{stackId}
			{depth}
			node={childNode}
			{showCheckboxes}
			{draggableFiles}
			{fileTemplate}
			{active}
		/>
	{/each}
{:else if node.kind === "file"}
	{@const previewIdx = controller.getPreviewIndexByPath(node.change.path)}
	{@render fileTemplate(node.change, previewIdx !== -1 ? previewIdx : node.index, depth)}
{:else}
	<FileTreeFolder
		{projectId}
		{stackId}
		selectionId={controller.selectionId}
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
				depth={depth + 1}
				node={childNode}
				{showCheckboxes}
				{draggableFiles}
				{fileTemplate}
				{active}
			/>
		{/each}
	{/if}
{/if}
