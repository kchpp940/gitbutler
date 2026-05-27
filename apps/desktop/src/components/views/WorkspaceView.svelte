<script lang="ts">
	import MultiDiffView from "$components/diff/MultiDiffView.svelte";
	import FullviewLoading from "$components/shared/FullviewLoading.svelte";
	import ReduxResult from "$components/shared/ReduxResult.svelte";
	import MainViewport from "$components/views/MainViewport.svelte";
	import MultiStackView from "$components/views/MultiStackView.svelte";
	import UnassignedView from "$components/views/UnassignedView.svelte";
	import { FILE_SELECTION_MANAGER } from "$lib/selection/fileSelectionManager.svelte";
	import { type SelectionId } from "$lib/selection/key";
	import { UNCOMMITTED_SERVICE } from "$lib/selection/uncommittedService.svelte";
	import { STACK_SERVICE } from "$lib/stacks/stackService.svelte";
	import { UI_STATE } from "$lib/state/uiState.svelte";
	import { inject } from "@gitbutler/core/context";
	import { TestId } from "@gitbutler/ui";

	interface Props {
		projectId: string;
		scrollToStackId?: string;
		onScrollComplete?: () => void;
	}

	const { projectId, scrollToStackId, onScrollComplete }: Props = $props();

	const stackService = inject(STACK_SERVICE);
	const idSelection = inject(FILE_SELECTION_MANAGER);
	const uncommittedService = inject(UNCOMMITTED_SERVICE);
	const uiState = inject(UI_STATE);

	// The single source of truth for which worktree selection is active.
	// Clicking any file in any lane updates this immediately, so the
	// diff panel and file tree highlight always stay in sync.
	let activeSelectionId = $state<SelectionId | undefined>();

	$effect(() => {
		return idSelection.activeSelectionId.subscribe((id) => {
			activeSelectionId = id;
		});
	});

	const activeSelection = $derived(
		activeSelectionId ? idSelection.getById(activeSelectionId) : undefined,
	);

	// Track start index for MultiDiffView. Must use a subscription because
	// $derived + get() doesn't track writable value changes when the
	// selection object itself hasn't changed (e.g. clicking a different
	// file in the same stack).
	let activeStartIndex = $state(0);

	$effect(() => {
		const sel = activeSelection;
		if (!sel) {
			activeStartIndex = 0;
			return;
		}
		return sel.lastAdded.subscribe((value) => {
			activeStartIndex = value?.index ?? 0;
		});
	});

	// Whether the left preview panel should be visible.
	let previewOpen = $state(false);

	$effect(() => {
		const sel = activeSelection;
		if (!sel) {
			previewOpen = false;
			return;
		}
		return sel.lastAdded.subscribe((value) => {
			previewOpen = value?.key !== undefined;
		});
	});

	// When active selection changes, resolve the correct changes list to display.
	const activeChanges = $derived(() => {
		const sel = activeSelectionId;
		if (!sel || sel.type !== "worktree") return [];
		return uncommittedService.getChangesByStackId(sel.stackId ?? null);
	});

	const stacksQuery = $derived(stackService.stacks(projectId));
	const projectState = $derived(uiState.project(projectId));
	const exclusiveAction = $derived(projectState.exclusiveAction.current);
	const isCommitting = $derived(exclusiveAction?.type === "commit");

	let multiDiffView = $state<MultiDiffView>();

	let visibleRange = $state<{ start: number; end: number } | undefined>();

	function onVisibleChange(change: { start: number; end: number } | undefined) {
		visibleRange = change;
	}

	// Jump MultiDiffView to the active file's index whenever active selection changes.
	$effect(() => {
		const idx = activeStartIndex;
		if (idx !== undefined) {
			multiDiffView?.jumpToIndex(idx);
		}
	});
</script>

{#snippet leftPreview()}
	<MultiDiffView
		{projectId}
		startIndex={activeStartIndex}
		selectionId={activeSelectionId ?? { type: "worktree" }}
		stackId={activeSelectionId?.type === "worktree" ? activeSelectionId.stackId : undefined}
		changes={activeChanges}
		bind:this={multiDiffView}
		draggable={true}
		selectable={isCommitting}
		showBorder={false}
		showRoundedEdges={false}
		{onVisibleChange}
		onclose={() => {
			if (activeSelectionId) {
				idSelection.clear(activeSelectionId);
			}
		}}
	/>
{/snippet}

<MainViewport
	testId={TestId.WorkspaceView}
	name="workspace"
	leftWidth={{ default: 280, min: 260 }}
	preview={previewOpen ? leftPreview : undefined}
	previewWidth={{ default: 480, min: 220 }}
	rightWidth={{ default: 320, min: 220 }}
>
	{#snippet left()}
		<UnassignedView
			{projectId}
			{visibleRange}
		/>
	{/snippet}
	{#snippet middle()}
		<ReduxResult {projectId} result={stacksQuery?.result}>
			{#snippet loading()}
				<FullviewLoading />
			{/snippet}
			{#snippet children(stacks, { projectId })}
				<MultiStackView {projectId} {stacks} {scrollToStackId} {onScrollComplete} />
			{/snippet}
		</ReduxResult>
	{/snippet}
</MainViewport>
