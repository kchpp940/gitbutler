/**
 * Reactive controller that owns file list selection, keyboard navigation,
 * grouping, and focus management.
 *
 * Two distinct index spaces are used:
 * - previewIndex (stable): based on `orderedChanges` (all files, grouped order).
 *   Used for `lastAdded.index` that drives the diff preview. Never changes
 *   when groups are collapsed or expanded.
 * - keyboardIndex (visible): based on `visibleChanges` (only expanded groups).
 *   Used for keyboard navigation. Changes when groups are toggled.
 *
 * Instantiate in a component's `<script>` block so that `inject()` and
 * `$effect()` bind to the component lifecycle.
 */
import type { FileGroup, GroupByMode } from "$lib/files/fileGrouping";
import { getAllChangesFromGroups, groupChanges } from "$lib/files/fileGrouping";
import { FILE_SELECTION_MANAGER } from "$lib/selection/fileSelectionManager.svelte";
import { readKey, type SelectionId, type SelectedFileKey } from "$lib/selection/key";
import type { UncommittedService } from "$lib/selection/uncommittedService.svelte";
import { inject } from "@gitbutler/core/context";
import { FOCUS_MANAGER } from "@gitbutler/ui/focus/focusManager";
import { getContext, setContext, untrack } from "svelte";
import { get } from "svelte/store";
import type { FileSelectionManager } from "$lib/selection/fileSelectionManager.svelte";
import type { SelectedFile } from "$lib/selection/key";
import type { TreeChange } from "@gitbutler/but-sdk";

const FILE_LIST_CTX = Symbol("FileListController");

/** Set the controller into Svelte component context. Called by FileListProvider. */
export function setFileListContext(controller: FileListController): void {
	setContext(FILE_LIST_CTX, controller);
}

/** Read the controller from Svelte component context. Called by compound children. */
export function getFileListContext(): FileListController {
	const ctx = getContext<FileListController>(FILE_LIST_CTX);
	if (!ctx) {
		throw new Error("FileListController not found — wrap your component in <FileListProvider>");
	}
	return ctx;
}

/**
 * Extra keyboard handler that callers can inject to extend file list
 * keyboard behavior (e.g. AI shortcuts in the worktree context).
 *
 * Return `true` to indicate the event was handled.
 */
export type FileListKeyHandler = (
	change: TreeChange,
	idx: number,
	e: KeyboardEvent,
) => boolean | void;

export class FileListController {
	private idSelection: FileSelectionManager;
	private focusManager;
	private getChanges: () => TreeChange[];
	private getSelectionId: () => SelectionId;
	private getAllowUnselect: () => boolean;
	private getGroupBy: () => GroupByMode;
	private getUncommittedService: () => UncommittedService | undefined;
	private getStackId: () => string | undefined;
	private _selectionFromKeyboard = false;

	active = $state<boolean>(false);
	private groupExpanded = $state<Map<string, boolean>>(new Map());

	get isKeyboardSelecting(): boolean {
		return this._selectionFromKeyboard;
	}

	/** Raw grouping result. All groups, regardless of expand state. */
	readonly groups = $derived(
		groupChanges(
			this.getGroupBy(),
			this.getChanges(),
			this.getUncommittedService(),
			this.getStackId() ?? null,
		),
	);

	/**
	 * All files from all groups in display order.
	 * Stable — never changes due to expand/collapse.
	 * Used for diff preview ordering.
	 */
	readonly orderedChanges = $derived(getAllChangesFromGroups(this.groups));

	/** path → previewIndex (index in orderedChanges) — stable, for diff */
	readonly pathIndex = $derived.by(() => {
		const map = new Map<string, number>();
		for (let i = 0; i < this.orderedChanges.length; i++) {
			map.set(this.orderedChanges[i]!.path, i);
		}
		return map;
	});

	/**
	 * Only files from expanded groups, in display order.
	 * Changes when groups are toggled.
	 * Used for keyboard navigation.
	 */
	readonly visibleChanges = $derived.by(() => {
		const result: TreeChange[] = [];
		for (const group of this.groups) {
			if (this.isGroupExpanded(group.id)) {
				result.push(...group.changes);
			}
		}
		return result;
	});

	/** path → keyboardIndex (index in visibleChanges) — for keyboard nav */
	readonly visiblePathIndex = $derived.by(() => {
		const map = new Map<string, number>();
		for (let i = 0; i < this.visibleChanges.length; i++) {
			map.set(this.visibleChanges[i]!.path, i);
		}
		return map;
	});

	/** Map from path → group that contains it, for quick lookup */
	readonly pathToGroup = $derived.by(() => {
		const map = new Map<string, FileGroup>();
		for (const group of this.groups) {
			for (const change of group.changes) {
				map.set(change.path, group);
			}
		}
		return map;
	});

	readonly selectedPaths = $derived(new Set(this.selectedFileIds.map((f) => f.path)));
	readonly hasSelectionInList = $derived(
		this.orderedChanges.some((change) => this.selectedPaths.has(change.path)),
	);

	constructor(params: {
		changes: () => TreeChange[];
		selectionId: () => SelectionId;
		allowUnselect?: () => boolean;
		groupBy?: () => GroupByMode;
		uncommittedService?: () => UncommittedService | undefined;
		stackId?: () => string | undefined;
	}) {
		this.idSelection = inject(FILE_SELECTION_MANAGER);
		this.focusManager = inject(FOCUS_MANAGER);
		this.getChanges = params.changes;
		this.getSelectionId = params.selectionId;
		this.getAllowUnselect = params.allowUnselect ?? (() => true);
		this.getGroupBy = params.groupBy ?? (() => "none");
		this.getUncommittedService = params.uncommittedService ?? (() => undefined);
		this.getStackId = params.stackId ?? (() => undefined);

		$effect(() => {
			const store = this.idSelection.getById(this.getSelectionId()).lastAdded;
			return store.subscribe((value) => {
				if (value?.index !== undefined) {
					untrack(() => {
						if (this.active && this._selectionFromKeyboard) {
							const el = document.getElementById(value.key);
							if (el) {
								this.focusManager.focusByElement(el);
								this.focusManager.activateOutline();
							}
						}
					});
				}
			});
		});

		$effect(() => {
			this.remapSelectionIndices();
		});

		$effect(() => {
			const store = this.idSelection.getById(this.getSelectionId()).lastAdded;
			return store.subscribe((value) => {
				if (value) {
					const parsed = readKey(value.key as SelectedFileKey);
					this.ensureVisible(parsed.path);
				}
			});
		});
	}

	/** Ensure the file's group is expanded. Returns true if state changed. */
	ensureVisible(path: string): boolean {
		const group = this.pathToGroup.get(path);
		if (group && !this.isGroupExpanded(group.id)) {
			this.setGroupExpanded(group.id, true);
			return true;
		}
		return false;
	}

	isGroupExpanded(groupId: string): boolean {
		return this.groupExpanded.get(groupId) ?? true;
	}

	setGroupExpanded(groupId: string, expanded: boolean): void {
		if (this.groupExpanded.get(groupId) === expanded) return;
		const next = new Map(this.groupExpanded);
		next.set(groupId, expanded);
		this.groupExpanded = next;
	}

	toggleGroup(groupId: string): void {
		this.setGroupExpanded(groupId, !this.isGroupExpanded(groupId));
	}

	/**
	 * Remap selection indices to use stable previewIndex (orderedChanges).
	 * Called when grouping mode changes.
	 */
	private remapSelectionIndices() {
		const sel = this.idSelection.getById(this.getSelectionId());
		const currentLastAdded = get(sel.lastAdded);
		if (!currentLastAdded) return;

		const parsed = readKey(currentLastAdded.key as SelectedFileKey);
		const previewIndex = this.pathIndex.get(parsed.path);
		if (previewIndex !== undefined && previewIndex !== currentLastAdded.index) {
			sel.lastAdded.set({ index: previewIndex, key: currentLastAdded.key });
		}
	}

	get selection(): FileSelectionManager {
		return this.idSelection;
	}

	get selectionId(): SelectionId {
		return this.getSelectionId();
	}

	/**
	 * Returns visibleChanges for list rendering.
	 * For keyboard navigation, use visiblePathIndex.
	 * For diff preview, use pathIndex and orderedChanges.
	 */
	get changes(): TreeChange[] {
		return this.visibleChanges;
	}

	get rawChanges(): TreeChange[] {
		return this.getChanges();
	}

	get groupByMode(): GroupByMode {
		return this.getGroupBy();
	}

	get selectedFileIds(): SelectedFile[] {
		return this.idSelection.values(this.selectionId);
	}

	isSelected(path: string): boolean {
		return this.idSelection.has(path, this.selectionId);
	}

	/**
	 * Get the keyboard (visible) index for a change.
	 * Returns -1 if the file is in a collapsed group.
	 */
	indexOf(change: TreeChange): number {
		return this.visiblePathIndex.get(change.path) ?? -1;
	}

	/**
	 * Get the keyboard (visible) index for a path.
	 * Returns -1 if the file is in a collapsed group.
	 */
	getVisibleIndexByPath(path: string): number {
		return this.visiblePathIndex.get(path) ?? -1;
	}

	/**
	 * Get the stable preview index for a path.
	 * This is the index used for diff preview, never affected by group collapse.
	 */
	getPreviewIndexByPath(path: string): number {
		return this.pathIndex.get(path) ?? -1;
	}

	/**
	 * Alias for getPreviewIndexByPath for backwards compatibility.
	 * @deprecated Use getPreviewIndexByPath or getVisibleIndexByPath depending on use case
	 */
	getIndexByPath(path: string): number {
		return this.pathIndex.get(path) ?? -1;
	}

	/**
	 * Select a file. Uses previewIndex (stable) for lastAdded,
	 * visibleIndex for keyboard navigation calculations.
	 */
	select(e: MouseEvent | KeyboardEvent, change: TreeChange, keyboardIndex: number): void {
		const previewIndex = this.pathIndex.get(change.path) ?? keyboardIndex;
		const visibleIndex = this.visiblePathIndex.get(change.path) ?? keyboardIndex;
		const isAlreadySelected = this.idSelection.has(change.path, this.selectionId);
		const isTheOnlyOneSelected =
			this.idSelection.collectionSize(this.selectionId) === 1 && isAlreadySelected;
		const lastAdded = get(this.idSelection.getById(this.selectionId).lastAdded);

		if (e.ctrlKey || e.metaKey) {
			if (isAlreadySelected) {
				this.idSelection.remove(change.path, this.selectionId);
				const remainingSelection = this.idSelection.values(this.selectionId);
				const previous = remainingSelection.at(-1);
				if (previous) {
					const previousIndex = this.pathIndex.get(previous.path) ?? -1;
					if (previousIndex !== -1) {
						this.idSelection.add(previous.path, this.selectionId, previousIndex);
					}
				}
			} else {
				this.idSelection.add(change.path, this.selectionId, previewIndex);
			}
		} else if (e.shiftKey && lastAdded !== undefined) {
			const start = Math.min(lastAdded.index, previewIndex);
			const end = Math.max(lastAdded.index, previewIndex);

			const filePaths = this.orderedChanges.slice(start, end + 1).map((f) => f.path);
			this.idSelection.addMany(filePaths, this.selectionId, {
				path: change.path,
				index: previewIndex,
			});
		} else {
			if (isTheOnlyOneSelected) {
				if (this.getAllowUnselect()) {
					this.idSelection.clear(this.selectionId);
				}
			} else {
				this.idSelection.set(change.path, this.selectionId, previewIndex);
			}
		}
	}

	handleActivation(change: TreeChange, keyboardIdx: number, e: KeyboardEvent): boolean {
		if (e.key === "Enter" || e.key === " " || e.key === "l") {
			e.stopPropagation();
			this._selectionFromKeyboard = true;
			this.select(e, change, keyboardIdx);
			this._selectionFromKeyboard = false;
			return true;
		}
		return false;
	}

	/**
	 * Select a single file. Uses previewIndex (stable) for lastAdded.
	 */
	selectSingle(change: TreeChange, keyboardIndex: number): void {
		const previewIndex = this.pathIndex.get(change.path) ?? keyboardIndex;
		this.idSelection.set(change.path, this.selectionId, previewIndex);
	}

	/**
	 * Keyboard navigation. Operates on visibleChanges only.
	 * Returns the visibleIndex of the new selection for focus management.
	 */
	handleNavigation(e: KeyboardEvent): number | undefined {
		this._selectionFromKeyboard = true;
		const moved = this.updateKeyboardSelection(e);
		this._selectionFromKeyboard = false;
		if (moved) {
			const lastAdded = get(this.idSelection.getById(this.selectionId).lastAdded);
			if (lastAdded) {
				const parsed = readKey(lastAdded.key as SelectedFileKey);
				return this.visiblePathIndex.get(parsed.path);
			}
		}
		return undefined;
	}

	/**
	 * Keyboard selection — operates entirely on visibleChanges.
	 * Uses visiblePathIndex for navigation, but stores previewIndex in lastAdded.
	 */
	private updateKeyboardSelection(e: KeyboardEvent): boolean {
		const selectedFileIds = this.selectedFileIds;
		if (selectedFileIds.length === 0) return false;

		const visibleFiles = this.visibleChanges;
		const visibleIndices = this.visiblePathIndex;

		const firstPath = selectedFileIds[0]!.path;
		const lastPath = selectedFileIds.at(-1)!.path;

		const topPath = visibleFiles.find((f) => this.selectedPaths.has(f.path))?.path;
		const bottomPath = this.findBottomPath(visibleFiles);

		const lastVisibleIdx = visibleIndices.get(lastPath) ?? -1;
		const firstVisibleIdx = visibleIndices.get(firstPath) ?? -1;
		let selectionDirection: "up" | "down" = firstVisibleIdx < lastVisibleIdx ? "down" : "up";

		const resolveAndApply = (id: string, offset: number, method: "add" | "set") => {
			const visibleIdx = visibleIndices.get(id);
			if (visibleIdx === undefined) return;
			const targetVisibleIdx = visibleIdx + offset;
			const targetFile = visibleFiles[targetVisibleIdx];
			if (targetFile) {
				const previewIdx = this.pathIndex.get(targetFile.path) ?? targetVisibleIdx;
				this.idSelection[method](targetFile.path, this.selectionId, previewIdx);
			}
		};

		switch (e.key) {
			case "a":
			case "A":
				if (e.metaKey || e.ctrlKey) {
					e.preventDefault();
					for (let i = 0; i < visibleFiles.length; i++) {
						const file = visibleFiles[i]!;
						const previewIdx = this.pathIndex.get(file.path) ?? i;
						this.idSelection.add(file.path, this.selectionId, previewIdx);
					}
					this.idSelection.clearPreview(this.selectionId);
				}
				break;

			case "k":
			case "ArrowUp":
				e.preventDefault();
				if (e.shiftKey) {
					if (selectedFileIds.length === 1) {
						selectionDirection = "up";
					} else if (selectionDirection === "down") {
						this.idSelection.remove(lastPath, this.selectionId);
					}
					resolveAndApply(lastPath, -1, "add");
				} else {
					if (selectedFileIds.length > 1 && topPath !== undefined) {
						resolveAndApply(topPath, 0, "set");
					}
					if (selectedFileIds.length === 1) {
						resolveAndApply(firstPath, -1, "set");
					}
				}
				break;

			case "j":
			case "ArrowDown":
				e.preventDefault();
				if (e.shiftKey) {
					if (selectedFileIds.length === 1) {
						selectionDirection = "down";
					} else if (selectionDirection === "up") {
						this.idSelection.remove(lastPath, this.selectionId);
					}
					resolveAndApply(lastPath, 1, "add");
				} else {
					if (selectedFileIds.length > 1 && bottomPath !== undefined) {
						resolveAndApply(bottomPath, 0, "set");
					}
					if (selectedFileIds.length === 1) {
						resolveAndApply(firstPath, 1, "set");
					}
				}
				break;

			case "Escape":
				e.preventDefault();
				this.idSelection.clearPreview(this.selectionId);
				(e.currentTarget as HTMLElement).blur();
				return false;

			default:
				return false;
		}
		return true;
	}

	private findBottomPath(files: TreeChange[]): string | undefined {
		for (let i = files.length - 1; i >= 0; i--) {
			if (this.selectedPaths.has(files[i]!.path)) return files[i]!.path;
		}
		return undefined;
	}
}
