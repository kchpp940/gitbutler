<script lang="ts">
	import DraggableFileHeader from "$components/diff/DraggableFileHeader.svelte";
	import FilePreviewPlaceholder from "$components/diff/FilePreviewPlaceholder.svelte";
	import UnifiedDiffView from "$components/diff/UnifiedDiffView.svelte";
	import ReduxResult from "$components/shared/ReduxResult.svelte";
	import { isExecutableStatus } from "$lib/hunks/change";
	import { DIFF_SERVICE } from "$lib/hunks/diffService.svelte";
	import { FILE_CHANGES_VIEW_MODEL } from "$lib/selection/fileChangesViewModel.svelte";
	import { inject } from "@gitbutler/core/context";

	type Props = {
		projectId: string;
		draggableFiles?: boolean;
		diffOnly?: boolean;
		onclose?: () => void;
		testId?: string;
		scrollContainer?: HTMLDivElement;
		bottomBorder?: boolean;
	};

	let {
		projectId,
		draggableFiles: draggable,
		diffOnly,
		onclose,
		testId,
		scrollContainer,
		bottomBorder,
	}: Props = $props();

	const viewModel = inject(FILE_CHANGES_VIEW_MODEL);
	const diffService = inject(DIFF_SERVICE);

	const selectedFile = $derived(viewModel.preview.current.previewFile);

	const stackId = $derived(
		selectedFile && `stackId` in selectedFile ? selectedFile.stackId : undefined,
	);

	const selectable = $derived(selectedFile?.type === "worktree");
	const changeQuery = $derived(selectedFile ? viewModel.changeByKey(projectId, selectedFile) : undefined);
</script>

<div class="selection-view" data-testid={testId}>
	{#if selectedFile && changeQuery}
		<ReduxResult {projectId} result={changeQuery.result}>
			{#snippet children(change)}
				{@const diffQuery = diffService.getDiff(projectId, change)}
				{@const isExecutable = isExecutableStatus(change.status)}
				<ReduxResult {projectId} result={diffQuery.result}>
					{#snippet children(diff, env)}
						<div
							class="selected-change-item"
							class:bottom-border={bottomBorder}
							data-remove-from-panning
						>
							{#if !diffOnly}
								<DraggableFileHeader
									selectionId={selectedFile}
									projectId={env.projectId}
									{scrollContainer}
									{change}
									{diff}
									{draggable}
									executable={isExecutable}
									onCloseClick={onclose}
								/>
							{/if}
							<UnifiedDiffView
								projectId={env.projectId}
								{stackId}
								commitId={selectedFile.type === "commit" ? selectedFile.commitId : undefined}
								{draggable}
								{change}
								{diff}
								{selectable}
								selectionId={selectedFile}
								topPadding={diffOnly}
							/>
						</div>
					{/snippet}
				</ReduxResult>
			{/snippet}
		</ReduxResult>
	{:else}
		<FilePreviewPlaceholder />
	{/if}
</div>

<style>
	.selection-view {
		display: flex;
		flex-grow: 1;
		width: 100%;
		height: 100%;
	}
	.selected-change-item {
		width: 100%;
		background-color: var(--bg-1);

		&.bottom-border {
			border-bottom: 1px solid var(--border-2);
		}
	}
</style>
