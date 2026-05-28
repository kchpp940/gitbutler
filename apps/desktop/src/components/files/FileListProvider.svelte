<!--
	Context provider for file list compound components.

	Creates a FileListController and sets it into Svelte context so that
	children like <FileListItems> and <FileListConflicts> can access
	shared selection state, keyboard handling, and focus management.

	Usage:
	```svelte
	<FileListProvider {changes} {selectionId}>
		<FileListItems mode="list" />
	</FileListProvider>
	```
-->
<script lang="ts">
	import type { GroupByMode } from "$lib/files/fileGrouping";
	import { FileListController, setFileListContext } from "$lib/selection/fileListController.svelte";
	import type { UncommittedService } from "$lib/selection/uncommittedService.svelte";
	import type { SelectionId } from "$lib/selection/key";
	import type { TreeChange } from "@gitbutler/but-sdk";
	import type { Snippet } from "svelte";

	type Props = {
		changes: TreeChange[];
		selectionId: SelectionId;
		allowUnselect?: boolean;
		groupBy?: GroupByMode;
		uncommittedService?: UncommittedService;
		stackId?: string;
		children: Snippet;
	};

	const {
		changes,
		selectionId,
		allowUnselect = true,
		groupBy = "none",
		uncommittedService,
		stackId,
		children,
	}: Props = $props();

	const controller = new FileListController({
		changes: () => changes,
		selectionId: () => selectionId,
		allowUnselect: () => allowUnselect,
		groupBy: () => groupBy,
		uncommittedService: () => uncommittedService,
		stackId: () => stackId,
	});

	setFileListContext(controller);
</script>

{@render children()}
