<!--
	Context provider for file list compound components.

	Creates a FileChangesViewModel and FileListController and sets them into
	Svelte context so that children like <FileListItems> and <FileListConflicts>
	can access shared selection state, keyboard handling, and focus management.

	If a viewModel is provided via props or already exists in context, it will
	be reused instead of creating a new one — this enables stable state across
	view switches and worktree refreshes.

	Usage:
	```svelte
	<FileListProvider {changes} {selectionId}>
		<FileListItems mode="list" />
	</FileListProvider>
	```
-->
<script lang="ts">
	import {
		FileChangesViewModel,
		FILE_CHANGES_VIEW_MODEL,
	} from "$lib/selection/fileChangesViewModel.svelte";
	import { FileListController, setFileListContext } from "$lib/selection/fileListController.svelte";
	import { getContext, hasContext, setContext } from "svelte";
	import type { SelectionId } from "$lib/selection/key";
	import type { TreeChange } from "@gitbutler/but-sdk";
	import type { Snippet } from "svelte";

	type Props = {
		changes: TreeChange[];
		selectionId: SelectionId;
		viewModel?: FileChangesViewModel;
		allowUnselect?: boolean;
		children: Snippet;
	};

	const {
		changes,
		selectionId,
		viewModel: propViewModel,
		allowUnselect = true,
		children,
	}: Props = $props();

	function resolveViewModel(): FileChangesViewModel {
		if (propViewModel) {
			return propViewModel;
		}
		if (hasContext(FILE_CHANGES_VIEW_MODEL)) {
			return getContext(FILE_CHANGES_VIEW_MODEL);
		}
		return new FileChangesViewModel({
			selectionId,
			getChanges: () => changes,
		});
	}

	const viewModel = resolveViewModel();

	const controller = new FileListController({
		viewModel,
		allowUnselect: () => allowUnselect,
	});

	setContext(FILE_CHANGES_VIEW_MODEL, viewModel);
	setFileListContext(controller);
</script>

{@render children()}
