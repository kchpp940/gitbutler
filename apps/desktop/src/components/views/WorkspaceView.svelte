<script lang="ts">
	import MultiDiffView from "$components/diff/MultiDiffView.svelte";
	import FullviewLoading from "$components/shared/FullviewLoading.svelte";
	import ReduxResult from "$components/shared/ReduxResult.svelte";
	import MainViewport from "$components/views/MainViewport.svelte";
	import MultiStackView from "$components/views/MultiStackView.svelte";
	import UnassignedView from "$components/views/UnassignedView.svelte";
	import { FILE_CHANGES_VIEW_MODEL } from "$lib/selection/fileChangesViewModel.svelte";
	import { FileChangesViewModel } from "$lib/selection/fileChangesViewModel.svelte";
	import { createWorktreeSelection } from "$lib/selection/key";
	import { UNCOMMITTED_SERVICE } from "$lib/selection/uncommittedService.svelte";
	import { STACK_SERVICE } from "$lib/stacks/stackService.svelte";
	import { WORKTREE_SERVICE } from "$lib/worktree/worktreeService.svelte";
	import { HISTORY_SERVICE } from "$lib/history/history";
	import { UI_STATE } from "$lib/state/uiState.svelte";
	import { setContext } from "svelte";
	import { inject } from "@gitbutler/core/context";
	import { TestId } from "@gitbutler/ui";

	interface Props {
		projectId: string;
		scrollToStackId?: string;
		onScrollComplete?: () => void;
	}

	const { projectId, scrollToStackId, onScrollComplete }: Props = $props();

	const stackService = inject(STACK_SERVICE);
	const worktreeService = inject(WORKTREE_SERVICE);
	const historyService = inject(HISTORY_SERVICE);
	const uncommittedService = inject(UNCOMMITTED_SERVICE);
	const uiState = inject(UI_STATE);

	const selectionId = createWorktreeSelection({ stackId: undefined });
	const stacksQuery = $derived(stackService.stacks(projectId));

	const unassignedChanges = $derived(uncommittedService.getChangesByStackId(null));
	const hunkStore = $derived(uncommittedService.createHunkSelectionStore(null));

	const viewModel = new FileChangesViewModel({
		selectionId,
		getChanges: () => unassignedChanges,
		stackId: null,
		hunkStore: hunkStore,
		initialViewMode: "list",
		services: {
			worktreeService,
			stackService,
			historyService,
			uncommittedService,
		},
	});

	setContext(FILE_CHANGES_VIEW_MODEL, viewModel);

	const previewOpen = $derived(viewModel.preview.current.isPreviewOpen);

	const projectState = $derived(uiState.project(projectId));
	const exclusiveAction = $derived(projectState.exclusiveAction.current);
	const isCommitting = $derived(exclusiveAction?.type === "commit");

	let multiDiffView = $state<MultiDiffView>();
	let startIndex = $state(0);

	let visibleRange = $state<{ start: number; end: number } | undefined>();

	function onVisibleChange(change: { start: number; end: number } | undefined) {
		visibleRange = change;
	}

	$effect(() => {
		viewModel.retainValidPaths();
	});
</script>

{#snippet leftPreview()}
	<MultiDiffView
		{projectId}
		{startIndex}
		selectionId={{ type: "worktree" }}
		stackId={undefined}
		changes={unassignedChanges}
		bind:this={multiDiffView}
		draggable={true}
		selectable={isCommitting}
		showBorder={false}
		showRoundedEdges={false}
		{onVisibleChange}
		onclose={() => {
			viewModel.dispatchSelection({ type: "clear" });
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
			{viewModel}
			{visibleRange}
			onFileClick={(index) => {
				startIndex = index;
				multiDiffView?.jumpToIndex(index);
			}}
		/>
	{/snippet}
	{#snippet middle()}
		<ReduxResult {projectId} result={stacksQuery?.result}>
			{#snippet loading()}
				<FullviewLoading />
			{/snippet}
			{#snippet children(stacks, { projectId })}
				<MultiStackView {projectId} {stacks} {selectionId} {scrollToStackId} {onScrollComplete} />
			{/snippet}
		</ReduxResult>
	{/snippet}
</MainViewport>
