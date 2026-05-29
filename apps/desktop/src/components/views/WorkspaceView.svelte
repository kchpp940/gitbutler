<script lang="ts">
	import MultiDiffView from "$components/diff/MultiDiffView.svelte";
	import FullviewLoading from "$components/shared/FullviewLoading.svelte";
	import ReduxResult from "$components/shared/ReduxResult.svelte";
	import ActivityTimelinePanel from "$components/views/ActivityTimelinePanel.svelte";
	import MainViewport from "$components/views/MainViewport.svelte";
	import MultiStackView from "$components/views/MultiStackView.svelte";
	import UnassignedView from "$components/views/UnassignedView.svelte";
	import { ACTIVITY_TIMELINE_SERVICE } from "$lib/activity/activityTimelineService.svelte";
	import { FILE_SELECTION_MANAGER } from "$lib/selection/fileSelectionManager.svelte";
	import { createWorktreeSelection } from "$lib/selection/key";
	import { UNCOMMITTED_SERVICE } from "$lib/selection/uncommittedService.svelte";
	import { STACK_SERVICE } from "$lib/stacks/stackService.svelte";
	import { UI_STATE } from "$lib/state/uiState.svelte";
	import { inject } from "@gitbutler/core/context";
	import { Button, TestId } from "@gitbutler/ui";

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
	const activityTimelineService = inject(ACTIVITY_TIMELINE_SERVICE);

	const selectionId = createWorktreeSelection({ stackId: undefined });
	const worktreeSelection = $derived(idSelection.getById(selectionId));
	const stacksQuery = $derived(stackService.stacks(projectId));

	const lastAdded = $derived(worktreeSelection.lastAdded);
	const previewOpen = $derived(!!$lastAdded?.key);

	const eventsStore = activityTimelineService.events(projectId);
	const eventCount = $derived($eventsStore.length);

	// Transform unassigned changes to SelectedFile[] format
	const unassignedChanges = $derived(uncommittedService.getChangesByStackId(null));
	const projectState = $derived(uiState.project(projectId));
	const exclusiveAction = $derived(projectState.exclusiveAction.current);
	const isCommitting = $derived(exclusiveAction?.type === "commit");
	const timelineState = $derived(projectState.activityTimeline.current);
	const timelineOpen = $derived(timelineState.open);

	const navigationTargetStore = activityTimelineService.getNavigationTarget();
	let lastNavTarget: string | null = null;

	$effect(() => {
		const target = $navigationTargetStore;
		if (target && target.projectId === projectId) {
			const targetKey = `${target.eventId || ""}-${target.stackId || ""}-${target.commitId || ""}`;
			if (targetKey !== lastNavTarget) {
				lastNavTarget = targetKey;
				projectState.activityTimeline.set({ open: true, highlightEventId: target.eventId });
				if (target.stackId) {
					navigateToStack(target.stackId, target.commitId);
				}
				activityTimelineService.clearNavigationTarget();
			}
		}
	});

	let multiDiffView = $state<MultiDiffView>();
	let startIndex = $state(0);

	let visibleRange = $state<{ start: number; end: number } | undefined>();
	let multiStackViewRef = $state<MultiStackView | null>();

	function onVisibleChange(change: { start: number; end: number } | undefined) {
		visibleRange = change;
	}

	function navigateToStack(stackId: string, commitId?: string) {
		multiStackViewRef?.scrollToStack(stackId, commitId);
	}
</script>

<MainViewport
	testId={TestId.WorkspaceView}
	name="workspace"
	leftWidth={{ default: 280, min: 260 }}
	previewWidth={{ default: 480, min: 220 }}
	rightWidth={{ default: 320, min: 220 }}
>
	{#snippet left()}
		<div class="unassigned-header">
			<div class="timeline-btn-wrapper">
				<Button
					testId={TestId.ActivityTimelineToggleButton}
					kind="ghost"
					style="gray"
					size="small"
					onclick={() => projectState.activityTimeline.set({ open: !timelineState.open })}
					tooltip={timelineOpen ? "Hide Activity Timeline" : "Show Activity Timeline"}
					active={timelineOpen}
					icon="clock"
				/>
				{#if eventCount > 0}
					<span class="event-badge">{eventCount > 99 ? "99+" : eventCount}</span>
				{/if}
			</div>
		</div>
		<UnassignedView
			{projectId}
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
				<MultiStackView
					{projectId}
					{stacks}
					{selectionId}
					{scrollToStackId}
					{onScrollComplete}
					bind:this={multiStackViewRef}
				/>
			{/snippet}
		</ReduxResult>
	{/snippet}
	{#snippet preview()}
		{#if previewOpen}
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
					idSelection.clear(selectionId);
				}}
			/>
		{/if}
	{/snippet}
	{#snippet right()}
		{#if timelineOpen}
			<ActivityTimelinePanel {projectId} onNavigateToStack={navigateToStack} />
		{/if}
	{/snippet}
</MainViewport>

<style lang="postcss">
	.unassigned-header {
		display: flex;
		justify-content: flex-end;
		padding: 8px 8px 0;
	}

	.timeline-btn-wrapper {
		position: relative;
	}

	.event-badge {
		position: absolute;
		top: -4px;
		right: -4px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		font-size: 10px;
		font-weight: 600;
		background-color: var(--clr-pop-50);
		color: white;
		border-radius: 9px;
	}
</style>
