import { key, type SelectionId } from "$lib/selection/key";
import type { BranchDropData } from "$lib/dragging/dropHandlers/branchDropHandler";
import type { CommitDropData } from "$lib/dragging/dropHandlers/commitDropHandler";
import type { FileChangesViewModel } from "$lib/selection/fileChangesViewModel.svelte";
import type { HunkAssignment, HunkHeader } from "@gitbutler/but-sdk";
import type { TreeChange } from "@gitbutler/but-sdk";

export class HunkDropDataV3 {
	constructor(
		readonly change: TreeChange,
		readonly hunk: HunkHeader,
		readonly uncommitted: boolean,
		readonly stackId: string | null,
		readonly commitId: string | undefined,
		readonly selectionId: SelectionId,
	) {}
}

export class FileChangeDropData {
	constructor(
		private projectId: string,
		readonly change: TreeChange,
		private viewModel: FileChangesViewModel,
		readonly selectionId: SelectionId,
		readonly stackId?: string,
	) {}

	changedPaths(params: SelectionId): string[] {
		if (this.viewModel.isSelected(this.change.path)) {
			return this.viewModel.selectedKeys();
		}
		return [key({ ...this.selectionId, path: this.change.path })];
	}

	async treeChanges(): Promise<TreeChange[]> {
		if (this.viewModel.isSelected(this.change.path)) {
			return await this.viewModel.treeChanges(this.projectId);
		}
		return [this.change];
	}

	assignments(): Record<string, HunkAssignment[]> | undefined {
		if (this.viewModel.isSelected(this.change.path)) {
			return this.viewModel.hunkAssignments() ?? undefined;
		}
		return undefined;
	}

	get isCommitted(): boolean {
		return this.viewModel.isCommitted;
	}
}

export class FolderChangeDropData {
	constructor(
		readonly folderPath: string,
		private getTreeChanges: () => TreeChange[],
		readonly selectionId: SelectionId,
		readonly stackId?: string,
	) {}

	async treeChanges(): Promise<TreeChange[]> {
		return this.getTreeChanges();
	}

	assignments(): undefined {
		return undefined;
	}

	get isCommitted(): boolean {
		return this.selectionId.type === "commit" || this.selectionId.type === "branch";
	}
}

export type ChangeDropData = FileChangeDropData | FolderChangeDropData;

export type DropData = CommitDropData | ChangeDropData | HunkDropDataV3 | BranchDropData;
