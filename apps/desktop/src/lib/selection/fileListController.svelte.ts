/**
 * Reactive controller that owns file list selection, keyboard navigation,
 * and focus management. Uses FileChangesViewModel for state management.
 *
 * Instantiate in a component's `<script>` block so that `inject()` and
 * `$effect()` bind to the component lifecycle.
 *
 * ```svelte
 * <script lang="ts">
 *   const controller = new FileListController({ ... });
 * </script>
 * ```
 */
import {
	FileChangesViewModel,
	type SelectionIntent,
} from "$lib/selection/fileChangesViewModel.svelte";
import type { SelectionId } from "$lib/selection/key";
import { inject } from "@gitbutler/core/context";
import { FOCUS_MANAGER } from "@gitbutler/ui/focus/focusManager";
import { getContext, setContext, untrack } from "svelte";
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
	private viewModel: FileChangesViewModel;
	private focusManager;
	private getAllowUnselect: () => boolean;
	private _selectionFromKeyboard = false;

	get active(): boolean {
		return this.viewModel.keyboardState.current.active;
	}

	set active(value: boolean) {
		this.viewModel.setActive(value);
	}

	/** True while handleNavigation/handleActivation is on the call stack. */
	get isKeyboardSelecting(): boolean {
		return this._selectionFromKeyboard;
	}

	readonly selectedPaths = $derived(this.viewModel.selection.current.selectedPaths);
	readonly hasSelectionInList = $derived(this.viewModel.hasSelectionInList());

	constructor(params: { viewModel: FileChangesViewModel; allowUnselect?: () => boolean }) {
		this.viewModel = params.viewModel;
		this.focusManager = inject(FOCUS_MANAGER);
		this.getAllowUnselect = params.allowUnselect ?? (() => true);

		$effect(() => {
			const lastSelected = this.viewModel.selection.current.lastSelected;
			untrack(() => {
				if (lastSelected?.index !== undefined && this.active && this._selectionFromKeyboard) {
					const el = document.getElementById(lastSelected.key);
					if (el) {
						this.focusManager.focusByElement(el);
						this.focusManager.activateOutline();
					}
				}
			});
		});
	}

	get selectionId(): SelectionId {
		return this.viewModel.selectionId;
	}

	get changes(): TreeChange[] {
		return this.viewModel.changes;
	}

	get selectedFileIds() {
		return this.viewModel.selection.current.selectedFiles;
	}

	isSelected(path: string): boolean {
		return this.viewModel.isSelected(path);
	}

	select(e: MouseEvent | KeyboardEvent, change: TreeChange, index: number): void {
		const modifier = e.ctrlKey || e.metaKey ? "ctrl" : e.shiftKey ? "shift" : "none";
		const intent: SelectionIntent = {
			type: "select",
			path: change.path,
			index,
			modifier,
		};
		this.viewModel.dispatchSelection(intent);
	}

	handleActivation(change: TreeChange, idx: number, e: KeyboardEvent): boolean {
		if (e.key === "Enter" || e.key === " " || e.key === "l") {
			e.stopPropagation();
			this._selectionFromKeyboard = true;
			this.select(e, change, idx);
			this._selectionFromKeyboard = false;
			return true;
		}
		return false;
	}

	selectSingle(change: TreeChange, index: number): void {
		const intent: SelectionIntent = {
			type: "select",
			path: change.path,
			index,
			modifier: "none",
		};
		this.viewModel.dispatchSelection(intent);
	}

	handleNavigation(e: KeyboardEvent): number | undefined {
		this._selectionFromKeyboard = true;
		const moved = this.updateKeyboardSelection(e);
		this._selectionFromKeyboard = false;
		if (moved) {
			return this.viewModel.selection.current.lastSelected?.index;
		}
		return undefined;
	}

	// ── Private helpers ──────────────────────────────────────────────────

	private updateKeyboardSelection(e: KeyboardEvent): boolean {
		const { selectedFiles, selectedPaths } = this.viewModel.selection.current;
		if (selectedFiles.length === 0) return false;

		const files = this.changes;
		const filePathIndices = new Map(files.map((file, index) => [file.path, index]));

		const firstPath = selectedFiles[0]!.path;
		const lastPath = selectedFiles.at(-1)!.path;

		const topPath = files.find((f) => selectedPaths.has(f.path))?.path;
		const bottomPath = this.findBottomPath(files, selectedPaths);

		const lastIdx = filePathIndices.get(lastPath) ?? -1;
		const firstIdx = filePathIndices.get(firstPath) ?? -1;
		let selectionDirection: "up" | "down" = firstIdx < lastIdx ? "down" : "up";

		const resolveAndApply = (id: string, offset: number) => {
			const fileIndex = filePathIndices.get(id);
			if (fileIndex === undefined) return;
			const targetIndex = fileIndex + offset;
			const file = files[targetIndex];
			if (file) {
				const intent: SelectionIntent = {
					type: "select",
					path: file.path,
					index: targetIndex,
					modifier: "none",
				};
				this.viewModel.dispatchSelection(intent);
			}
		};

		switch (e.key) {
			case "a":
			case "A":
				if (e.metaKey || e.ctrlKey) {
					e.preventDefault();
					this.viewModel.dispatchSelection({ type: "selectAll" });
				}
				break;

			case "k":
			case "ArrowUp":
				e.preventDefault();
				if (e.shiftKey) {
					if (selectedFiles.length === 1) {
						selectionDirection = "up";
					}
					resolveAndApply(lastPath, -1);
				} else {
					if (selectedFiles.length > 1 && topPath !== undefined) {
						const topIdx = filePathIndices.get(topPath);
						if (topIdx !== undefined) {
							const intent: SelectionIntent = {
								type: "select",
								path: topPath,
								index: topIdx,
								modifier: "none",
							};
							this.viewModel.dispatchSelection(intent);
						}
					}
					if (selectedFiles.length === 1) {
						resolveAndApply(firstPath, -1);
					}
				}
				break;

			case "j":
			case "ArrowDown":
				e.preventDefault();
				if (e.shiftKey) {
					if (selectedFiles.length === 1) {
						selectionDirection = "down";
					}
					resolveAndApply(lastPath, 1);
				} else {
					if (selectedFiles.length > 1 && bottomPath !== undefined) {
						const bottomIdx = filePathIndices.get(bottomPath);
						if (bottomIdx !== undefined) {
							const intent: SelectionIntent = {
								type: "select",
								path: bottomPath,
								index: bottomIdx,
								modifier: "none",
							};
							this.viewModel.dispatchSelection(intent);
						}
					}
					if (selectedFiles.length === 1) {
						resolveAndApply(firstPath, 1);
					}
				}
				break;

			case "Escape":
				e.preventDefault();
				this.viewModel.dispatchSelection({ type: "clear" });
				(e.currentTarget as HTMLElement).blur();
				return false;

			default:
				return false;
		}
		return true;
	}

	private findBottomPath(files: TreeChange[], selectedPaths: Set<string>): string | undefined {
		for (let i = files.length - 1; i >= 0; i--) {
			if (selectedPaths.has(files[i]!.path)) return files[i]!.path;
		}
		return undefined;
	}
}
