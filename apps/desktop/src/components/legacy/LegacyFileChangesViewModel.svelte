<script lang="ts">
	import {
		FILE_CHANGES_VIEW_MODEL,
		FileChangesViewModel,
	} from "$lib/selection/fileChangesViewModel.svelte";
	import { FILE_SELECTION_MANAGER } from "$lib/selection/fileSelectionManager.svelte";
	import type { SelectionId, SelectedFile } from "$lib/selection/key";
	import { inject } from "@gitbutler/core/context";
	import { setContext } from "svelte";

	import type { TreeChange } from "@gitbutler/but-sdk";
	import type { ChangeResult } from "$lib/selection/fileChangesViewModel.svelte";
	import type { HunkAssignment } from "@gitbutler/but-sdk";

	type Props = {
		selectionId: SelectionId | undefined;
		getChanges: () => TreeChange[];
		projectId: string;
		children: any;
	};

	let { selectionId, getChanges, projectId, children }: Props = $props();

	const fsm = inject(FILE_SELECTION_MANAGER);

	class LegacyViewModelAdapter extends FileChangesViewModel {
		constructor(
			selectionId: SelectionId,
			getChanges: () => TreeChange[],
			private fsm: typeof FILE_SELECTION_MANAGER.prototype,
			private projectId: string,
		) {
			super({ selectionId, getChanges });
		}

		get isCommitted(): boolean {
			return this.selectionId.type === "commit" || this.selectionId.type === "branch";
		}

		override changeByKey(pid: string, file: SelectedFile): ChangeResult {
			return this.fsm.changeByKey(pid, file);
		}

		override async treeChanges(pid: string): Promise<TreeChange[]> {
			return await this.fsm.treeChanges(pid, this.selectionId);
		}

		override hunkAssignments(): Record<string, HunkAssignment[]> | null {
			return this.fsm.hunkAssignments(this.selectionId);
		}

		override isSelected(path: string): boolean {
			return this.fsm.has(path, this.selectionId);
		}

		syncFromFSM(): void {
			const selectedFiles = this.fsm.values(this.selectionId);
			const currentSelectedPaths = this.selection.current.selectedPaths;
			const newSelectedPaths = new Set(selectedFiles.map((f) => f.path));

			for (const path of currentSelectedPaths) {
				if (!newSelectedPaths.has(path)) {
					this.dispatchSelection({ type: "deselect", path });
				}
			}
			for (let i = 0; i < selectedFiles.length; i++) {
				const file = selectedFiles[i]!;
				if (!currentSelectedPaths.has(file.path)) {
					this.dispatchSelection({
						type: "select",
						path: file.path,
						index: i,
						modifier: "ctrl",
					});
				}
			}
		}
	}

	let viewModel: LegacyViewModelAdapter | undefined = $state();

	$effect(() => {
		if (!selectionId) {
			viewModel = undefined;
			return;
		}
		viewModel = new LegacyViewModelAdapter(selectionId, getChanges, fsm, projectId);
	});

	$effect(() => {
		if (viewModel && selectionId) {
			viewModel.syncFromFSM();
		}
	});

	$effect(() => {
		if (viewModel) {
			setContext(FILE_CHANGES_VIEW_MODEL, viewModel);
		}
	});
</script>

{#if viewModel}
	{children}
{/if}
