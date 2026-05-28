<!--
	Compound component that renders the file list (list or tree mode).
	Must be a child of <FileListProvider>.

	Usage:
	```svelte
	<FileListProvider {changes} {selectionId}>
		<FileListItems mode="list" draggable />
	</FileListProvider>
	```
-->
<script lang="ts">
	import FileListItemContainer from "$components/files/FileListItemContainer.svelte";
	import FileTreeNode from "$components/files/FileTreeNode.svelte";
	import LazyList from "$components/shared/LazyList.svelte";
	import { DEPENDENCY_SERVICE } from "$lib/dependencies/dependencyService.svelte";
	import type { FileGroup } from "$lib/files/fileGrouping";
	import { abbreviateFolders, changesToFileTree } from "$lib/files/filetreeV3";
	import { isExecutableStatus } from "$lib/hunks/change";
	import { getLockedCommitIds, getLockedTargets, isFileLocked } from "$lib/hunks/dependencies";
	import {
		getFileListContext,
		type FileListKeyHandler,
	} from "$lib/selection/fileListController.svelte";
	import { inject } from "@gitbutler/core/context";
	import { Icon } from "@gitbutler/ui";
	import { FOCUS_MANAGER } from "@gitbutler/ui/focus/focusManager";
	import { focusable } from "@gitbutler/ui/focus/focusable";
	import type { ConflictEntriesObj } from "$lib/files/conflicts";
	import type { TreeChange } from "@gitbutler/but-sdk";

	type Props = {
		projectId: string;
		stackId?: string;
		mode: "list" | "tree";
		showCheckboxes?: boolean;
		draggable?: boolean;
		showLockedIndicator?: boolean;
		visibleRange?: { start: number; end: number };
		/** nick → file paths mapping from IRC working files broadcast */
		ircWorkingFiles?: Record<string, string[]>;
		/** Per-file conflict hints (rendered inline on each item) */
		conflictEntries?: ConflictEntriesObj;
		dataTestId?: string;
		/** Called when a file is selected (click, Enter/Space/l, or arrow navigation). */
		onselect?: (change: TreeChange, index: number) => void;
		/** Extra keyboard handlers injected by the consumer (e.g. AI shortcuts). */
		extraKeyHandlers?: FileListKeyHandler[];
	};

	const {
		projectId,
		stackId,
		mode,
		showCheckboxes,
		draggable,
		showLockedIndicator = false,
		visibleRange,
		ircWorkingFiles,
		conflictEntries,
		dataTestId,
		onselect,
		extraKeyHandlers,
	}: Props = $props();

	const controller = getFileListContext();
	const dependencyService = inject(DEPENDENCY_SERVICE);
	const focusManager = inject(FOCUS_MANAGER);

	const ircWorkingUsersByPath = $derived.by(() => {
		if (!ircWorkingFiles) return undefined;
		const map = new Map<string, string[]>();
		for (const [nick, paths] of Object.entries(ircWorkingFiles)) {
			for (const p of paths) {
				const nicks = map.get(p);
				if (nicks) {
					nicks.push(nick);
				} else {
					map.set(p, [nick]);
				}
			}
		}
		return map;
	});

	const filePaths = $derived(controller.changes.map((change) => change.path));
	const fileDependenciesQuery = $derived(
		showLockedIndicator ? dependencyService.filesDependencies(projectId, filePaths, stackId) : null,
	);
	const fileDependencies = $derived(fileDependenciesQuery?.result.data || []);
</script>

{#snippet fileTemplate(change: TreeChange, previewIdx: number, depth: number = 0, isLast: boolean = false)}
	{@const visibleIdx = controller.getVisibleIndexByPath(change.path)}
	{@const isExecutable = isExecutableStatus(change.status)}
	{@const selected = controller.isSelected(change.path)}
	{@const locked = showLockedIndicator && isFileLocked(change.path, fileDependencies)}
	{@const lockedCommitIds = showLockedIndicator
		? getLockedCommitIds(change.path, fileDependencies)
		: []}
	{@const lockedTargets = showLockedIndicator
		? getLockedTargets(change.path, fileDependencies)
		: []}
	<FileListItemContainer
		selectionId={controller.selectionId}
		{change}
		{projectId}
		{stackId}
		{selected}
		listMode={mode}
		{depth}
		active={controller.active}
		{locked}
		{lockedCommitIds}
		{lockedTargets}
		{isLast}
		notched={controller.hasSelectionInList &&
			visibleRange !== undefined &&
			visibleIdx >= visibleRange.start &&
			visibleIdx < visibleRange.end}
		{draggable}
		executable={isExecutable}
		showCheckbox={showCheckboxes}
		ircWorkingUsers={ircWorkingUsersByPath?.get(change.path)}
		focusableOpts={{
			onKeydown: (e) => {
				if (controller.handleActivation(change, visibleIdx, e)) {
					onselect?.(change, previewIdx);
					return true;
				}
				if (extraKeyHandlers) {
					for (const handler of extraKeyHandlers) {
						if (handler(change, visibleIdx, e)) return true;
					}
				}
				if (mode === "tree") {
					if (e.shiftKey) {
						const navigatedIndex = controller.handleNavigation(e);
						if (navigatedIndex !== undefined) {
							const navigatedChange = controller.changes[navigatedIndex];
							if (navigatedChange) {
								onselect?.(navigatedChange, controller.getPreviewIndexByPath(navigatedChange.path));
							}
							return true;
						}
					}
					return false;
				}
				const navigatedIndex = controller.handleNavigation(e);
				if (navigatedIndex !== undefined && navigatedIndex !== visibleIdx) {
					const navigatedChange = controller.changes[navigatedIndex];
					if (navigatedChange) {
						onselect?.(navigatedChange, controller.getPreviewIndexByPath(navigatedChange.path));
					}
					return true;
				}
			},
			onActive:
				mode === "tree"
					? (active) => {
							if (active && focusManager.isKeyboardNavigation && !controller.isKeyboardSelecting) {
								controller.selectSingle(change, visibleIdx);
								onselect?.(change, previewIdx);
							}
						}
					: undefined,
			focusable: true,
		}}
		onclick={(e) => {
			e.stopPropagation();
			controller.select(e, change, visibleIdx);
			if (controller.isSelected(change.path)) {
				onselect?.(change, previewIdx);
			}
		}}
		{conflictEntries}
	/>
{/snippet}

{#snippet groupHeader(group: FileGroup)}
	<button
		type="button"
		class="file-group-header"
		onclick={() => controller.toggleGroup(group.id)}
		aria-expanded={controller.isGroupExpanded(group.id)}
	>
		<Icon
			name="chevron-right"
			size={14}
			class:rotated={controller.isGroupExpanded(group.id)}
		/>
		<span class="file-group-header__label">{group.label}</span>
		<span class="file-group-header__count">{group.changes.length}</span>
	</button>
{/snippet}

<div
	data-testid={dataTestId}
	class="file-list"
	use:focusable={{
		vertical: true,
		onActive: (value) => (controller.active = value),
	}}
>
	{#if controller.changes.length > 0}
		{#if controller.groupByMode !== "none" && controller.groups.length > 1}
			{#each controller.groups as group (group.id)}
				{@render groupHeader(group)}
				{#if controller.isGroupExpanded(group.id)}
					{#if mode === "tree"}
						{@const node = abbreviateFolders(changesToFileTree(group.changes))}
						<FileTreeNode
							isRoot
							{projectId}
							{stackId}
							{node}
							{showCheckboxes}
							draggableFiles={draggable}
							{fileTemplate}
							active={controller.active}
						/>
					{:else}
						{#each group.changes as change (change.path)}
							{@const previewIdx = controller.getPreviewIndexByPath(change.path)}
							{@const isLast = change === group.changes.at(-1)}
							{@const _selected = controller.isSelected(change.path)}
							{@render fileTemplate(change, previewIdx, 1, isLast)}
						{/each}
					{/if}
				{/if}
			{/each}
		{:else if mode === "tree"}
			{@const node = abbreviateFolders(changesToFileTree(controller.changes))}
			<FileTreeNode
				isRoot
				{projectId}
				{stackId}
				{node}
				{showCheckboxes}
				draggableFiles={draggable}
				{fileTemplate}
				active={controller.active}
			/>
		{:else}
			<LazyList items={controller.changes} chunkSize={100}>
				{#snippet template(change, context)}
					{@const _selected = controller.isSelected(change.path)}
					{@render fileTemplate(change, context.index, 0, context.last)}
				{/snippet}
			</LazyList>
		{/if}
	{/if}
</div>

<style lang="postcss">
	.file-list {
		display: flex;
		flex-direction: column;
	}

	.file-group-header {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 6px 10px;
		border: none;
		background: transparent;
		color: var(--text-3);
		font-size: 12px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
		transition: color var(--transition-fast);

		&:hover {
			color: var(--text-2);
			background-color: var(--bg-2);
		}

		.rotated {
			transform: rotate(90deg);
		}

		&__label {
			flex: 1;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}

		&__count {
			padding: 2px 6px;
			border-radius: 10px;
			background-color: var(--bg-3);
			color: var(--text-3);
			font-size: 11px;
		}
	}
</style>
