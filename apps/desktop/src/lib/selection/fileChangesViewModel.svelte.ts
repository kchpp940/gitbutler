import { InjectionToken } from "@gitbutler/core/context";
import { reactive } from "@gitbutler/shared/reactiveUtils.svelte";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import type { Reactive } from "@gitbutler/shared/storeUtils";
import { createBranchRef } from "$lib/branches/branchUtils";
import { key, type SelectedFile, type SelectedFileKey, type SelectionId } from "$lib/selection/key";
import type { TreeChange, HunkAssignment, HunkHeader } from "@gitbutler/but-sdk";
import type { LineId } from "@gitbutler/ui/utils/diffParsing";
import type { Result } from "$lib/state/helpers";

export type ChangeResult = { result: Result<TreeChange>; response: TreeChange | undefined };

export interface ChangeLookupServices {
	worktreeService: {
		treeChangeByPath(projectId: string, path: string): ChangeResult;
	};
	stackService: {
		commitChange(projectId: string, commitId: string, path: string): ChangeResult;
		branchChange(args: { projectId: string; stackId?: string; branch: string; path: string }): ChangeResult;
		commitChangesByPaths(projectId: string, commitId: string, paths: string[]): Promise<TreeChange[]>;
		branchChangesByPaths(args: {
			projectId: string;
			stackId?: string;
			branch: string;
			paths: string[];
		}): Promise<TreeChange[]>;
	};
	historyService: {
		snapshotDiffByPath(params: { projectId: string; snapshotId: string; path: string }): ChangeResult;
	};
	uncommittedService: {
		getChangesByStackId(stackId: string | null): TreeChange[];
		getAssignmentsByPaths(stackId: string | null, paths: string[]): Record<string, HunkAssignment[]>;
	};
}

export const FILE_CHANGES_VIEW_MODEL = new InjectionToken<FileChangesViewModel>(
	"FileChangesViewModel",
);

export type ViewMode = "list" | "tree";
export type CheckboxStatus = "checked" | "indeterminate" | "unchecked";

export interface FileSelectionSnapshot {
	readonly selectedPaths: ReadonlySet<string>;
	readonly selectedFiles: readonly SelectedFile[];
	readonly lastSelected: { index: number; key: SelectedFileKey } | undefined;
	readonly hasSelection: boolean;
}

export interface FolderStateSnapshot {
	readonly expandedPaths: ReadonlyMap<string, boolean>;
	isExpanded(path: string): boolean;
}

export interface KeyboardNavigationState {
	readonly active: boolean;
	readonly isKeyboardSelecting: boolean;
}

export interface PreviewState {
	readonly previewFile: SelectedFile | undefined;
	readonly previewIndex: number | undefined;
	readonly isPreviewOpen: boolean;
}

export interface HunkSelectionState {
	readonly selectedHunkIds: ReadonlySet<string>;
	readonly selectedPaths: ReadonlySet<string>;
}

export interface OrderedChangesSnapshot {
	readonly changes: readonly TreeChange[];
	readonly pathToIndex: ReadonlyMap<string, number>;
	getChangeByPath(path: string): TreeChange | undefined;
	getIndexByPath(path: string): number | undefined;
}

export type SelectionIntent =
	| { type: "select"; path: string; index: number; modifier?: "ctrl" | "shift" | "none" }
	| { type: "deselect"; path: string }
	| { type: "clear" }
	| { type: "selectAll" }
	| { type: "selectRange"; fromIndex: number; toIndex: number };

export type FolderIntent =
	| { type: "toggle"; path: string }
	| { type: "expand"; path: string }
	| { type: "collapse"; path: string }
	| { type: "expandAll" }
	| { type: "collapseAll" };

export type PreviewIntent =
	| { type: "open"; path: string }
	| { type: "close" }
	| { type: "navigate"; direction: "next" | "prev" };

export type HunkSelectionIntent =
	| { type: "checkLine"; path: string; hunkHeader: HunkHeader; line: LineId }
	| { type: "uncheckLine"; path: string; hunkHeader: HunkHeader; line: LineId; allLinesInHunk: LineId[] }
	| { type: "checkHunk"; path: string; hunkHeader: HunkHeader | null }
	| { type: "uncheckHunk"; path: string; hunkHeader: HunkHeader | null }
	| { type: "checkFile"; path: string }
	| { type: "uncheckFile"; path: string }
	| { type: "checkFolder"; path: string }
	| { type: "uncheckFolder"; path: string }
	| { type: "checkAll" }
	| { type: "uncheckAll" };

export interface HunkSelectionStore {
	getAssignments(): HunkAssignment[];
	getSelections(): Map<string, string[]>;
	dispatch(intent: HunkSelectionIntent): void;
}

export class FileChangesViewModel {
	private _selectionId: SelectionId;
	private _getChanges: () => TreeChange[];
	private _hunkStore?: HunkSelectionStore;
	private _stackId: string | null | undefined;
	private _services?: ChangeLookupServices;

	private _selectedKeys = new SvelteSet<SelectedFileKey>();
	private _lastSelected = $state<{ index: number; key: SelectedFileKey } | undefined>();
	private _folderExpanded = new SvelteMap<string, boolean>();
	private _viewMode = $state<ViewMode>("list");
	private _active = $state(false);
	private _keyboardSelecting = $state(false);
	private _previewIndex = $state<number | undefined>(undefined);

	constructor(params: {
		selectionId: SelectionId;
		getChanges: () => TreeChange[];
		stackId?: string | null;
		hunkStore?: HunkSelectionStore;
		initialViewMode?: ViewMode;
		services?: ChangeLookupServices;
	}) {
		this._selectionId = params.selectionId;
		this._getChanges = params.getChanges;
		this._stackId = params.stackId;
		this._hunkStore = params.hunkStore;
		this._viewMode = params.initialViewMode ?? "list";
		this._services = params.services;
	}

	get selectionId(): SelectionId {
		return this._selectionId;
	}

	get stackId(): string | null | undefined {
		return this._stackId;
	}

	get viewMode(): ViewMode {
		return this._viewMode;
	}

	setViewMode(mode: ViewMode): void {
		this._viewMode = mode;
	}

	readonly orderedChanges: Reactive<OrderedChangesSnapshot> = reactive(() => {
		const changes = this._getChanges();
		const pathToIndex = new Map(changes.map((c, i) => [c.path, i]));
		return {
			changes,
			pathToIndex,
			getChangeByPath: (path: string) => changes.find((c) => c.path === path),
			getIndexByPath: (path: string) => pathToIndex.get(path),
		};
	});

	get changes(): readonly TreeChange[] {
		return this.orderedChanges.current.changes;
	}

	get pathToIndex(): ReadonlyMap<string, number> {
		return this.orderedChanges.current.pathToIndex;
	}

	getChangeByPath(path: string): TreeChange | undefined {
		return this.orderedChanges.current.getChangeByPath(path);
	}

	getIndexByPath(path: string): number | undefined {
		return this.orderedChanges.current.getIndexByPath(path);
	}

	changeByKey(projectId: string, selectedFile: SelectedFile): ChangeResult {
		if (!this._services) {
			const localChange = this.getChangeByPath(selectedFile.path);
			return {
				result: {
					isLoading: false,
					error: undefined,
					data: localChange,
					status: localChange ? "success" : "pending",
				},
				response: localChange,
			};
		}
		switch (selectedFile.type) {
			case "commit":
				return this._services.stackService.commitChange(
					projectId,
					selectedFile.commitId,
					selectedFile.path,
				);
			case "branch": {
				const branch = createBranchRef(selectedFile.branchName, selectedFile.remote);
				return this._services.stackService.branchChange({
					projectId,
					stackId: selectedFile.stackId,
					branch,
					path: selectedFile.path,
				});
			}
			case "worktree":
				return this._services.worktreeService.treeChangeByPath(projectId, selectedFile.path);
			case "snapshot":
				return this._services.historyService.snapshotDiffByPath({
					projectId,
					snapshotId: selectedFile.snapshotId,
					path: selectedFile.path,
				});
		}
	}

	async treeChanges(projectId: string): Promise<TreeChange[]> {
		const paths = this.selection.current.selectedFiles.map((f) => f.path);
		if (!this._services) {
			return this.changes.filter((c) => paths.includes(c.path));
		}
		switch (this._selectionId.type) {
			case "worktree":
				return this._services.uncommittedService
					.getChangesByStackId(this._selectionId.stackId || null)
					.filter((c) => paths.includes(c.path));
			case "branch": {
				const { remote, branchName } = this._selectionId;
				const branch = createBranchRef(branchName, remote);
				return await this._services.stackService.branchChangesByPaths({
					projectId,
					stackId: this._selectionId.stackId,
					branch,
					paths,
				});
			}
			case "commit":
				return await this._services.stackService.commitChangesByPaths(
					projectId,
					this._selectionId.commitId,
					paths,
				);
			case "snapshot":
				return [];
		}
	}

	hunkAssignments(): Record<string, HunkAssignment[]> | null {
		if (!this._services || this._selectionId.type !== "worktree") return null;
		const paths = this.selection.current.selectedFiles.map((f) => f.path);
		return this._services.uncommittedService.getAssignmentsByPaths(
			this._selectionId.stackId || null,
			paths,
		);
	}

	selectedKeys(): string[] {
		return Array.from(this._selectedKeys);
	}

	removeSelectedPaths(paths: string[]): void {
		const pathSet = new Set(paths);
		const toRemove: SelectedFileKey[] = [];
		for (const k of this._selectedKeys) {
			const file = this._readKeySafe(k);
			if (file && pathSet.has(file.path)) {
				toRemove.push(k);
			}
		}
		for (const k of toRemove) {
			this._selectedKeys.delete(k);
		}
		if (this._lastSelected) {
			const file = this._readKeySafe(this._lastSelected.key);
			if (file && pathSet.has(file.path)) {
				this._lastSelected = undefined;
			}
		}
	}

	clearPreview(): void {
		this._previewIndex = undefined;
	}

	readonly selection: Reactive<FileSelectionSnapshot> = reactive(() => {
		const paths = new Set<string>();
		const files: SelectedFile[] = [];
		for (const key of this._selectedKeys) {
			const file = this._readKeySafe(key);
			if (file) {
				paths.add(file.path);
				files.push(file);
			}
		}
		return {
			selectedPaths: paths,
			selectedFiles: files,
			lastSelected: this._lastSelected,
			hasSelection: this._selectedKeys.size > 0,
		};
	});

	readonly folderState: Reactive<FolderStateSnapshot> = reactive(() => {
		const expanded = new Map(this._folderExpanded);
		return {
			expandedPaths: expanded,
			isExpanded: (path: string) => this._folderExpanded.get(path) ?? true,
		};
	});

	readonly keyboardState: Reactive<KeyboardNavigationState> = reactive(() => ({
		active: this._active,
		isKeyboardSelecting: this._keyboardSelecting,
	}));

	readonly preview: Reactive<PreviewState> = reactive(() => {
		const lastSelected = this._lastSelected;
		const previewFile = lastSelected ? this._readKeySafe(lastSelected.key) : undefined;
		const previewIndex = previewFile
			? this.getIndexByPath(previewFile.path) ?? this._previewIndex
			: this._previewIndex;
		return {
			previewFile,
			previewIndex,
			isPreviewOpen: !!previewFile,
		};
	});

	readonly hunkSelection: Reactive<HunkSelectionState> = reactive(() => {
		if (!this._hunkStore) {
			return {
				selectedHunkIds: new Set(),
				selectedPaths: new Set(),
			};
		}
		const selections = this._hunkStore.getSelections();
		const selectedPaths = new Set<string>();
		for (const k of selections.keys()) {
			const path = this._extractPathFromHunkKey(k);
			if (path) selectedPaths.add(path);
		}
		return {
			selectedHunkIds: new Set(selections.keys()),
			selectedPaths,
		};
	});

	isSelected(path: string): boolean {
		return this.selection.current.selectedPaths.has(path);
	}

	hasSelectionInList(): boolean {
		return this.changes.some((c) => this.isSelected(c.path));
	}

	isFolderExpanded(path: string): boolean {
		return this._folderExpanded.get(path) ?? true;
	}

	get isCommitted(): boolean {
		return this._selectionId.type === "commit" || this._selectionId.type === "branch";
	}

	getHunkCheckStatus(path: string, hunkHeader: HunkHeader): { selected: boolean; lines: LineId[] } {
		if (!this._hunkStore) return { selected: false, lines: [] };
		const k = this._hunkKey(path, hunkHeader);
		const selections = this._hunkStore.getSelections();
		const lines = selections.get(k);
		return lines ? { selected: true, lines } : { selected: false, lines: [] };
	}

	getFileCheckStatus(path: string): CheckboxStatus {
		if (!this._hunkStore) return "unchecked";
		const assignments = this._hunkStore.getAssignments().filter((a) => a.path === path);
		if (assignments.length === 0) return "unchecked";

		const selections = this._hunkStore.getSelections();
		const allSelected = assignments.every((a) => {
			const k = a.hunkHeader ? this._hunkKey(path, a.hunkHeader) : path;
			const lines = selections.get(k);
			return lines !== undefined && lines.length === 0;
		});
		const anySelected = assignments.some((a) => {
			const k = a.hunkHeader ? this._hunkKey(path, a.hunkHeader) : path;
			return selections.has(k);
		});

		if (allSelected) return "checked";
		if (anySelected) return "indeterminate";
		return "unchecked";
	}

	getFolderCheckStatus(path: string): CheckboxStatus {
		if (!this._hunkStore) return "unchecked";
		const assignments = this._hunkStore.getAssignments().filter((a) => a.path.startsWith(path + "/"));
		if (assignments.length === 0) return "unchecked";

		const selections = this._hunkStore.getSelections();
		const allSelected = assignments.every((a) => {
			const k = a.hunkHeader ? this._hunkKey(a.path, a.hunkHeader) : a.path;
			const lines = selections.get(k);
			return lines !== undefined && lines.length === 0;
		});
		const anySelected = assignments.some((a) => {
			const k = a.hunkHeader ? this._hunkKey(a.path, a.hunkHeader) : a.path;
			return selections.has(k);
		});

		if (allSelected) return "checked";
		if (anySelected) return "indeterminate";
		return "unchecked";
	}

	dispatchSelection(intent: SelectionIntent): void {
		switch (intent.type) {
			case "select":
				this._handleSelect(intent.path, intent.index, intent.modifier ?? "none");
				break;
			case "deselect":
				this._handleDeselect(intent.path);
				break;
			case "clear":
				this._handleClear();
				break;
			case "selectAll":
				this._handleSelectAll();
				break;
			case "selectRange":
				this._handleSelectRange(intent.fromIndex, intent.toIndex);
				break;
		}
	}

	dispatchFolder(intent: FolderIntent): void {
		switch (intent.type) {
			case "toggle":
				this._folderExpanded.set(
					intent.path,
					!(this._folderExpanded.get(intent.path) ?? true),
				);
				break;
			case "expand":
				this._folderExpanded.set(intent.path, true);
				break;
			case "collapse":
				this._folderExpanded.set(intent.path, false);
				break;
			case "expandAll":
				for (const path of this._folderExpanded.keys()) {
					this._folderExpanded.set(path, true);
				}
				break;
			case "collapseAll":
				for (const path of this._folderExpanded.keys()) {
					this._folderExpanded.set(path, false);
				}
				break;
		}
	}

	dispatchPreview(intent: PreviewIntent): void {
		switch (intent.type) {
			case "open": {
				const idx = this.getIndexByPath(intent.path);
				if (idx !== undefined) {
					this._previewIndex = idx;
					this._handleSelect(intent.path, idx, "none");
				}
				break;
			}
			case "close":
				this._previewIndex = undefined;
				this._handleClear();
				break;
			case "navigate": {
				const currentIdx = this.preview.current.previewIndex;
				if (currentIdx === undefined) return;
				const nextIdx = intent.direction === "next" ? currentIdx + 1 : currentIdx - 1;
				if (nextIdx >= 0 && nextIdx < this.changes.length) {
					const nextChange = this.changes[nextIdx];
					if (nextChange) {
						this.dispatchPreview({ type: "open", path: nextChange.path });
					}
				}
				break;
			}
		}
	}

	dispatchHunkSelection(intent: HunkSelectionIntent): void {
		this._hunkStore?.dispatch(intent);
	}

	setActive(active: boolean): void {
		this._active = active;
	}

	setKeyboardSelecting(value: boolean): void {
		this._keyboardSelecting = value;
	}

	retainValidPaths(): void {
		const validPaths = new Set(this.changes.map((c) => c.path));
		const toRemove: SelectedFileKey[] = [];
		for (const k of this._selectedKeys) {
			const file = this._readKeySafe(k);
			if (file && !validPaths.has(file.path)) {
				toRemove.push(k);
			}
		}
		for (const k of toRemove) {
			this._selectedKeys.delete(k);
		}
		if (this._lastSelected) {
			const file = this._readKeySafe(this._lastSelected.key);
			if (!file || !validPaths.has(file.path)) {
				this._lastSelected = undefined;
			}
		}
		if (this._previewIndex !== undefined && this._previewIndex >= this.changes.length) {
			this._previewIndex = undefined;
		}
	}

	private _key(path: string): SelectedFileKey {
		const { type, ...rest } = this._selectionId;
		switch (type) {
			case "worktree":
				return `${type}\u001F${path}\u001F${(rest as any).stackId}` as SelectedFileKey;
			case "commit":
				return `${type}\u001F${path}\u001F${(rest as any).commitId}\u001F${(rest as any).stackId}` as SelectedFileKey;
			case "branch":
				return `${type}\u001F${path}\u001F${(rest as any).stackId}\u001F${(rest as any).remote ?? "<<no-remote>>"}\u001F${(rest as any).branchName}` as SelectedFileKey;
			case "snapshot":
				return `${type}\u001F${(rest as any).snapshotId}\u001F${path}` as SelectedFileKey;
		}
	}

	private _hunkKey(path: string, hunkHeader: HunkHeader): string {
		return `${this._stackId ?? "null"}\u001F${path}\u001F${hunkHeader.oldStart},${hunkHeader.oldLines} ${hunkHeader.newStart},${hunkHeader.newLines}`;
	}

	private _extractPathFromHunkKey(k: string): string | undefined {
		const parts = k.split("\u001F");
		return parts.length >= 2 ? parts[1] : undefined;
	}

	private _readKeySafe(k: SelectedFileKey): SelectedFile | undefined {
		try {
			const UNIT_SEP = "\u001F";
			const [type, ...parts] = k.split(UNIT_SEP);
			switch (type as SelectionId["type"]) {
				case "worktree":
					return {
						type: "worktree",
						path: parts[0]!,
						stackId: parts[1] === "undefined" ? undefined : parts[1],
					} as SelectedFile;
				case "commit":
					return {
						type: "commit",
						path: parts[0]!,
						commitId: parts[1]!,
						stackId: parts[2],
					} as SelectedFile;
				case "branch":
					return {
						type: "branch",
						path: parts[0]!,
						stackId: parts[1] === "undefined" ? undefined : parts[1],
						remote: parts[2] === "<<no-remote>>" ? undefined : parts[2],
						branchName: parts[3]!,
					} as SelectedFile;
				case "snapshot":
					return {
						type: "snapshot",
						snapshotId: parts[0]!,
						path: parts[1]!,
					} as SelectedFile;
			}
		} catch {
			return undefined;
		}
	}

	private _handleSelect(path: string, index: number, modifier: "ctrl" | "shift" | "none"): void {
		const k = this._key(path);
		const isAlreadySelected = this._selectedKeys.has(k);
		const isTheOnlyOneSelected = this._selectedKeys.size === 1 && isAlreadySelected;

		if (modifier === "ctrl") {
			if (isAlreadySelected) {
				this._selectedKeys.delete(k);
				if (this._lastSelected?.key === k) {
					this._lastSelected = undefined;
				}
			} else {
				this._selectedKeys.add(k);
				this._lastSelected = { index, key: k };
			}
		} else if (modifier === "shift" && this._lastSelected) {
			const start = Math.min(this._lastSelected.index, index);
			const end = Math.max(this._lastSelected.index, index);
			const filePaths = this.changes.slice(start, end + 1).map((f) => f.path);
			for (const p of filePaths) {
				this._selectedKeys.add(this._key(p));
			}
			this._lastSelected = { index, key: k };
		} else {
			if (isTheOnlyOneSelected) {
				this._selectedKeys.clear();
				this._lastSelected = undefined;
				this._previewIndex = undefined;
			} else {
				this._selectedKeys.clear();
				this._selectedKeys.add(k);
				this._lastSelected = { index, key: k };
				this._previewIndex = index;
			}
		}
	}

	private _handleDeselect(path: string): void {
		const k = this._key(path);
		this._selectedKeys.delete(k);
		if (this._lastSelected?.key === k) {
			this._lastSelected = undefined;
		}
	}

	private _handleClear(): void {
		this._selectedKeys.clear();
		this._lastSelected = undefined;
		this._previewIndex = undefined;
	}

	private _handleSelectAll(): void {
		for (let i = 0; i < this.changes.length; i++) {
			this._selectedKeys.add(this._key(this.changes[i]!.path));
		}
		this._lastSelected = undefined;
	}

	private _handleSelectRange(fromIndex: number, toIndex: number): void {
		const start = Math.min(fromIndex, toIndex);
		const end = Math.max(fromIndex, toIndex);
		const filePaths = this.changes.slice(start, end + 1).map((f) => f.path);
		for (const p of filePaths) {
			this._selectedKeys.add(this._key(p));
		}
	}
}
