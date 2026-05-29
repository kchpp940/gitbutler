import { FileListController } from "$lib/selection/fileListController.svelte";
import {
	FileChangesViewModel,
	type SelectionIntent,
} from "$lib/selection/fileChangesViewModel.svelte";
import { createWorktreeSelection, type SelectionId } from "$lib/selection/key";
import { FOCUS_MANAGER } from "@gitbutler/ui/focus/focusManager";
import { get } from "svelte/store";
import { describe, expect, test, vi, beforeEach, type Mock } from "vitest";
import type { TreeChange } from "@gitbutler/but-sdk";

const injectMap = new Map<unknown, unknown>();
vi.mock("@gitbutler/core/context", () => ({
	InjectionToken: class {
		_key = Symbol();
	},
	inject(token: { _key: symbol }) {
		const value = injectMap.get(token);
		if (!value) throw new Error("No mock for token");
		return value;
	},
}));

function makeChange(path: string): TreeChange {
	return { path } as TreeChange;
}

const CHANGES = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"].map(makeChange);

function selectionId(): SelectionId {
	return createWorktreeSelection({ stackId: undefined });
}

function keyboardEvent(
	key: string,
	opts: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {},
): KeyboardEvent {
	return {
		key,
		shiftKey: opts.shiftKey ?? false,
		ctrlKey: opts.ctrlKey ?? false,
		metaKey: opts.metaKey ?? false,
		preventDefault: vi.fn(),
		stopPropagation: vi.fn(),
		currentTarget: document.createElement("div"),
	} as unknown as KeyboardEvent;
}

function mouseEvent(
	opts: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {},
): MouseEvent {
	return {
		ctrlKey: opts.ctrlKey ?? false,
		metaKey: opts.metaKey ?? false,
		shiftKey: opts.shiftKey ?? false,
	} as unknown as MouseEvent;
}

let focusManager: { focusByElement: Mock; activateOutline: Mock };

function createViewModel(
	changes: TreeChange[] = CHANGES,
	sid: SelectionId = selectionId(),
): FileChangesViewModel {
	return new FileChangesViewModel({
		selectionId: sid,
		getChanges: () => changes,
	});
}

function createController(
	viewModel: FileChangesViewModel,
	allowUnselect: boolean = true,
): FileListController {
	return new FileListController({
		viewModel,
		allowUnselect: () => allowUnselect,
	});
}

function selectedPaths(ctrl: FileListController): string[] {
	return Array.from(ctrl.selectedPaths);
}

beforeEach(() => {
	focusManager = { focusByElement: vi.fn(), activateOutline: vi.fn() };
	injectMap.set(FOCUS_MANAGER, focusManager);
});

describe("FileListController — mouse selection (select)", () => {
	test("plain click selects a single file", () => {
		$effect.root(() => {
			const viewModel = createViewModel();
			const ctrl = createController(viewModel);
			ctrl.select(mouseEvent(), CHANGES[2]!, 2);

			expect(selectedPaths(ctrl)).toEqual(["c.ts"]);
		});
	});

	test("plain click on different file replaces selection", () => {
		$effect.root(() => {
			const viewModel = createViewModel();
			const ctrl = createController(viewModel);
			ctrl.select(mouseEvent(), CHANGES[0]!, 0);
			ctrl.select(mouseEvent(), CHANGES[3]!, 3);

			expect(selectedPaths(ctrl)).toEqual(["d.ts"]);
		});
	});

	test("ctrl+click toggles file into selection", () => {
		$effect.root(() => {
			const viewModel = createViewModel();
			const ctrl = createController(viewModel);
			ctrl.select(mouseEvent(), CHANGES[0]!, 0);
			ctrl.select(mouseEvent({ ctrlKey: true }), CHANGES[2]!, 2);

			expect(selectedPaths(ctrl).sort()).toEqual(["a.ts", "c.ts"]);
		});
	});

	test("ctrl+click on selected file removes it", () => {
		$effect.root(() => {
			const viewModel = createViewModel();
			const ctrl = createController(viewModel);
			ctrl.select(mouseEvent(), CHANGES[0]!, 0);
			ctrl.select(mouseEvent({ ctrlKey: true }), CHANGES[2]!, 2);
			ctrl.select(mouseEvent({ ctrlKey: true }), CHANGES[0]!, 0);

			expect(selectedPaths(ctrl)).toEqual(["c.ts"]);
		});
	});

	test("meta+click works the same as ctrl+click", () => {
		$effect.root(() => {
			const viewModel = createViewModel();
			const ctrl = createController(viewModel);
			ctrl.select(mouseEvent(), CHANGES[0]!, 0);
			ctrl.select(mouseEvent({ metaKey: true }), CHANGES[1]!, 1);

			expect(selectedPaths(ctrl).sort()).toEqual(["a.ts", "b.ts"]);
		});
	});

	test("shift+click selects a range", () => {
		$effect.root(() => {
			const viewModel = createViewModel();
			const ctrl = createController(viewModel);
			ctrl.select(mouseEvent(), CHANGES[1]!, 1);
			ctrl.select(mouseEvent({ shiftKey: true }), CHANGES[3]!, 3);

			expect(selectedPaths(ctrl).sort()).toEqual(["b.ts", "c.ts", "d.ts"]);
		});
	});

	test("shift+click selects range backwards", () => {
		$effect.root(() => {
			const viewModel = createViewModel();
			const ctrl = createController(viewModel);
			ctrl.select(mouseEvent(), CHANGES[3]!, 3);
			ctrl.select(mouseEvent({ shiftKey: true }), CHANGES[1]!, 1);

			expect(selectedPaths(ctrl).sort()).toEqual(["b.ts", "c.ts", "d.ts"]);
		});
	});
});
