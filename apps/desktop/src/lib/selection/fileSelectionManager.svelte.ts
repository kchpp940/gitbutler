import { createBranchRef } from "$lib/branches/branchUtils";
import {
	selectionKey,
	key,
	readKey,
	createWorktreeSelection,
	type SelectedFileKey,
	type SelectionId,
	type SelectedFile,
} from "$lib/selection/key";
import { InjectionToken } from "@gitbutler/core/context";
import { reactive } from "@gitbutler/shared/reactiveUtils.svelte";
import { SvelteSet } from "svelte/reactivity";
import { get, writable, type Writable } from "svelte/store";
import type { HistoryService } from "$lib/history/history";
import type { OplogService } from "$lib/history/oplogService.svelte";
import type { UncommittedService } from "$lib/selection/uncommittedService.svelte";
import type { Result } from "$lib/state/helpers";
import type { WorktreeService } from "$lib/worktree/worktreeService.svelte";
import type { HunkAssignment } from "@gitbutler/but-sdk";
import type { TreeChange } from "@gitbutler/but-sdk";

function selectionKeyMatches(a: SelectionId | undefined, b: SelectionId | undefined): boolean {
	if (!a || !b) return false;
	if (a.type !== b.type) return false;
	switch (a.type) {
		case "worktree":
			return (a as any).stackId === (b as any).stackId;
		case "commit":
			return a.commitId === (b as any).commitId && a.stackId === (b as any).stackId;
		case "branch":
			return (
				a.branchName === (b as any).branchName &&
				a.remote === (b as any).remote &&
				a.stackId === (b as any).stackId
			);
		case "snapshot":
			return a.snapshotId === (b as any).snapshotId;
	}
	return false;
}

// Structural type for the return value of change-by-path queries.
type ChangeResult = { result: Result<TreeChange>; response: TreeChange | undefined };

// Structural interface to avoid circular import with stacks/.
interface StackServiceLike {
	branchChangesByPaths(args: {
		projectId: string;
		stackId?: string;
		branch: string;
		paths: string[];
	}): Promise<TreeChange[]>;
	commitChangesByPaths(projectId: string, commitId: string, paths: string[]): Promise<TreeChange[]>;
	commitChange(projectId: string, commitId: string, path: string): ChangeResult;
	branchChange(args: {
		projectId: string;
		stackId?: string;
		branch: string;
		path: string;
	}): ChangeResult;
}

export const FILE_SELECTION_MANAGER = new InjectionToken<FileSelectionManager>(
	"FileSelectionManager",
);

/**
 * File selection mechanism based on strings id's.
 *
 * Maintains per-context selections (worktree unassigned, worktree per-stack,
 * commits, branches, snapshots) and tracks which selection is currently
 * active. Components observe the active selection to know which file tree
 * to highlight and which diffs to render.
 */
export class FileSelectionManager {
	/**
	 * The currently-active selection context. Updated whenever set/add is
	 * called on a worktree-type selection. Undefined means no selection.
	 */
	readonly activeSelectionId: Writable<SelectionId | undefined>;

	private selections: Map<
		/** Return value of `selectionKey`. */
		string,
		{
			/** This property supports range selection. */
			lastAdded: Writable<
				| {
						/** The index of the file in a sorted list of files. */
						index: number;
						/** The key of the file in the selection. */
						key: SelectedFileKey;
				  }
				| undefined
			>;
			entries: SvelteSet<SelectedFileKey>;
		}
	>;

	constructor(
		private stackService: StackServiceLike,
		private uncommittedService: UncommittedService,
		private worktreeService: WorktreeService,
		private oplogService: OplogService,
		private historyService: HistoryService,
	) {
		this.activeSelectionId = writable<SelectionId | undefined>(undefined);
		this.selections = new Map();
		this.selections.set(selectionKey(createWorktreeSelection({ stackId: undefined })), {
			entries: new SvelteSet<SelectedFileKey>(),
			lastAdded: writable(),
		});
	}

	getById(id: SelectionId) {
		const key = selectionKey(id);
		let set = this.selections.get(key);
		if (!set) {
			set = {
				entries: new SvelteSet<SelectedFileKey>(),
				lastAdded: writable(),
			};
			this.selections.set(key, set);
		}
		return set;
	}

	hasItems(id: SelectionId) {
		return this.getById(id).entries.size > 0;
	}

	add(path: string, id: SelectionId, index: number) {
		const selectedKey = key({ ...id, path });
		const selection = this.getById(id);
		selection.lastAdded.set({ index, key: selectedKey });
		selection.entries.add(selectedKey);
		if (id.type === "worktree") {
			this.activeSelectionId.set(id);
		}
	}

	addMany(paths: string[], id: SelectionId, last: { path: string; index: number }) {
		for (const path of paths) {
			const selectedKey = key({ ...id, path });
			const selection = this.getById(id);
			selection.lastAdded.set({ index: last.index, key: selectedKey });
			selection.entries.add(selectedKey);
		}

		const selectedKey = key({ ...id, path: last.path });
		const selection = this.getById(id);
		selection.lastAdded.set({ index: last.index, key: selectedKey });
		if (id.type === "worktree") {
			this.activeSelectionId.set(id);
		}
	}

	has(path: string, id: SelectionId) {
		const selection = this.getById(id);
		return selection.entries.has(key({ path, ...id }));
	}

	set(path: string, id: SelectionId, index: number) {
		const selection = this.getById(id);
		selection.entries.clear();
		this.add(path, id, index);
	}

	/**
	 * Toggle a single file's checkbox state.
	 *
	 * Only affects the hunk selection (checkbox / commit readiness). Does NOT
	 * touch the file preview selection or the active selection — so the
	 * current diff view stays focused on whatever the user was looking at.
	 */
	toggleFileHunkSelection(
		shouldCheck: boolean,
		stackId: string | null,
		path: string,
	): void {
		if (shouldCheck) {
			this.uncommittedService.checkFile(stackId, path);
		} else {
			this.uncommittedService.uncheckFile(stackId, path);
		}
	}

	/**
	 * Toggle all files in a directory via their checkboxes.
	 *
	 * Only affects the hunk selection (checkbox / commit readiness). Does NOT
	 * touch the file preview selection or the active selection.
	 */
	toggleFolderHunkSelection(
		shouldCheck: boolean,
		stackId: string | null,
		folderPath: string,
	): void {
		if (shouldCheck) {
			this.uncommittedService.checkDir(stackId, folderPath);
		} else {
			this.uncommittedService.uncheckDir(stackId, folderPath);
		}
	}

	/**
	 * Toggle every file in a worktree lane via the "Select All" checkbox.
	 *
	 * Only affects the hunk selection (checkbox / commit readiness). Does NOT
	 * touch the file preview selection or the active selection.
	 */
	toggleStackHunkSelection(
		shouldCheck: boolean,
		stackId: string | null,
	): void {
		if (shouldCheck) {
			this.uncommittedService.checkAll(stackId);
		} else {
			this.uncommittedService.uncheckAll(stackId);
		}
	}

	remove(path: string, id: SelectionId) {
		const selectionKey = key({ path, ...id });
		const selection = this.getById(id);
		selection.entries.delete(selectionKey);
		if (get(selection.lastAdded)?.key === selectionKey) {
			selection.lastAdded.set(undefined);
		}
		if (
			id.type === "worktree" &&
			selection.entries.size === 0 &&
			selectionKeyMatches(id, get(this.activeSelectionId))
		) {
			this.activeSelectionId.set(undefined);
		}
	}

	clear(selectionId: SelectionId) {
		const selection = this.getById(selectionId);
		selection.entries.clear();
		selection.lastAdded.set(undefined);
		if (
			selectionId.type === "worktree" &&
			selectionKeyMatches(selectionId, get(this.activeSelectionId))
		) {
			this.activeSelectionId.set(undefined);
		}
	}

	clearPreview(selectionId: SelectionId) {
		const selection = this.getById(selectionId);
		selection.lastAdded.set(undefined);
	}

	keys(selectionId: SelectionId) {
		const selection = this.getById(selectionId);
		return Array.from(selection.entries);
	}

	values(params: SelectionId) {
		return this.keys(params).map((key) => readKey(key));
	}

	valuesReactive(params: SelectionId) {
		const selection = this.getById(params);
		const keys = $derived(Array.from(selection.entries).map(readKey));
		return reactive(() => keys);
	}

	/**
	 * Gets tree changes that correspond to selected id's. Note that the
	 * worktree service call does not trigger any request for data, it
	 * instead reuses the entry from listing if available.
	 * TODO: Should this be able to load even if listing hasn't happened?
	 */
	async treeChanges(projectId: string, params: SelectionId): Promise<TreeChange[]> {
		const paths = this.values(params).map((fileSelection) => {
			return fileSelection.path;
		});

		switch (params.type) {
			case "worktree":
				return this.uncommittedService
					.getChangesByStackId(params.stackId || null)
					.filter((c) => paths.includes(c.path));
			case "branch": {
				const { remote, branchName } = params;
				const branch = createBranchRef(branchName, remote);
				return await this.stackService.branchChangesByPaths({
					projectId,
					stackId: params.stackId,
					branch,
					paths: paths,
				});
			}
			case "commit":
				return await this.stackService.commitChangesByPaths(projectId, params.commitId, paths);
			case "snapshot":
				// TODO: Use the commented out code once back end support restored!
				// Without this we can't show a multi file context menu for snapshots.
				// if (paths[0]) {
				// 	const change = await this.oplogService.fetchDiffWorktreeByPath({
				// 		projectId,
				// 		snapshotId: params.snapshotId,
				// 		path: paths[0]
				// 	});
				// 	return change ? [change] : [];
				// }
				return [];
		}
	}

	/**
	 * Retrieve the hunk assignments for the current selection.
	 *
	 * Hunk assignments are only relevant when selecting worktree files.
	 * For branches, commits, and snapshots, this will return null.
	 */
	hunkAssignments(params: SelectionId): Record<string, HunkAssignment[]> | null {
		switch (params.type) {
			case "worktree": {
				const paths = this.values(params).map((fileSelection) => {
					return fileSelection.path;
				});
				return this.uncommittedService.getAssignmentsByPaths(params.stackId || null, paths);
			}
			case "branch":
			case "commit":
			case "snapshot":
				return null;
		}
	}

	get length() {
		return this.selections.size;
	}

	collectionSize(params: SelectionId) {
		return this.getById(params).entries.size;
	}

	/**
	 * Discards file selections and associated hunk selections that are no
	 * longer present in the current worktree state.
	 *
	 * Call this whenever the back end pushes a fresh worktree snapshot
	 * (raw changes + hunk assignments). It walks every known worktree
	 * selection (the unassigned lane plus any per-stack lanes) and removes
	 * files whose paths are no longer represented in that lane's filtered
	 * list, along with any stale hunk selections for those files. This
	 * keeps the file tree highlight, the diff panel, and the checkbox
	 * state in sync across all lanes instead of relying on component-level
	 * refresh fallbacks.
	 *
	 * @param paths Global list of currently-existing worktree paths. Files
	 *   not present here are removed from every worktree selection,
	 *   regardless of stack.
	 * @param stackPaths Optional map of `stackId → paths` filtered by that
	 *   stack's hunk assignments. When provided, a per-stack worktree
	 *   selection is additionally pruned to only files whose paths appear
	 *   in the corresponding entry. Pass `null` for the unassigned lane
	 *   key to override its filter.
	 */
	retain(paths: string[] | undefined, stackPaths?: Map<string | null, string[]>) {
		if (paths === undefined) {
			this.selections.clear();
			return;
		}

		const removedFiles: SelectedFile[] = [];

		for (const [, selection] of this.selections) {
			for (const entry of selection.entries) {
				const parsed = readKey(entry);
				if (parsed.type !== "worktree") continue;
				if (!paths.includes(parsed.path)) {
					removedFiles.push(parsed);
					continue;
				}
				if (stackPaths) {
					const stackFilter = stackPaths.get(parsed.stackId ?? null);
					if (stackFilter && !stackFilter.includes(parsed.path)) {
						removedFiles.push(parsed);
					}
				}
			}
		}

		if (removedFiles.length > 0) {
			for (const file of removedFiles) {
				// Also clear hunk selections for pruned files so the
				// checkbox state doesn't linger after a file moves
				// between lanes or disappears.
				if (file.type === "worktree") {
					this.uncommittedService.uncheckFile(file.stackId ?? null, file.path);
				}
			}
			this.removeMany(removedFiles);
		}
	}

	/**
	 * TODO: Fix these types so we don't have to call `.remove(key.path, key)`.
	 * TODO: Optimise this somehow, reactions are triggered for every loop.
	 */
	removeMany(fileKey: SelectedFile[]) {
		for (const key of fileKey) {
			this.remove(key.path, key);
		}
	}

	changeByKey(projectId: string, selectedFile: SelectedFile) {
		switch (selectedFile.type) {
			case "commit":
				return this.stackService.commitChange(projectId, selectedFile.commitId, selectedFile.path);
			case "branch": {
				const { remote, branchName } = selectedFile;
				const branch = createBranchRef(branchName, remote);
				return this.stackService.branchChange({
					projectId,
					stackId: selectedFile.stackId,
					branch,
					path: selectedFile.path,
				});
			}
			case "worktree":
				this.uncommittedService.assignmentsByPath(selectedFile.stackId || null, selectedFile.path);
				return this.worktreeService.treeChangeByPath(projectId, selectedFile.path);
			case "snapshot":
				return this.historyService.snapshotDiffByPath({
					projectId,
					snapshotId: selectedFile.snapshotId,
					path: selectedFile.path,
				});
		}
	}
}
