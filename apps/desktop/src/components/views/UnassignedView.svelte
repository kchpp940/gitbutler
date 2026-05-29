<script lang="ts">
	import WorktreeChanges from "$components/files/WorktreeChanges.svelte";
	import UnassignedViewForgeIntegrationBanner from "$components/forge/ForgeIntegrationBanner.svelte";
	import RulesList from "$components/rules/RulesList.svelte";
	import UnassignedFoldButton from "$components/workspace/UnassignedFoldButton.svelte";
	import noChanges from "$lib/assets/empty-state/no-new-changes.svg?raw";
	import { stagingBehaviorFeature } from "$lib/config/uiFeatureFlags";
	import { FILE_CHANGES_VIEW_MODEL } from "$lib/selection/fileChangesViewModel.svelte";
	import type { FileChangesViewModel } from "$lib/selection/fileChangesViewModel.svelte";
	import { UNCOMMITTED_SERVICE } from "$lib/selection/uncommittedService.svelte";
	import { UI_STATE } from "$lib/state/uiState.svelte";
	import { ActionEvent, POSTHOG_WRAPPER } from "$lib/telemetry/posthog";
	import { inject } from "@gitbutler/core/context";
	import { Badge, Button, TestId } from "@gitbutler/ui";
	import { focusable } from "@gitbutler/ui/focus/focusable";

	interface Props {
		projectId: string;
		viewModel: FileChangesViewModel;
		onFileClick?: (index: number) => void;
		visibleRange?: { start: number; end: number };
	}

	const { projectId, viewModel, onFileClick, visibleRange }: Props = $props();

	const uiState = inject(UI_STATE);
	const uncommittedService = inject(UNCOMMITTED_SERVICE);
	const posthog = inject(POSTHOG_WRAPPER);
	const projectState = $derived(uiState.project(projectId));
	const unassignedSidebarFolded = $derived(uiState.global.unassignedSidebarFolded);
	const exclusiveAction = $derived(projectState.exclusiveAction.current);
	const isCommitting = $derived(exclusiveAction?.type === "commit");

	const treeChanges = $derived(uncommittedService.changesByStackId(null));
	const treeChangesCount = $derived(treeChanges.current.length);
	const changesToCommit = $derived(treeChangesCount > 0);
	let foldedContentWidth = $state<number>(0);

	function unfoldView() {
		unassignedSidebarFolded.set(false);
	}

	function unselectFiles() {
		viewModel.dispatchSelection({ type: "clear" });
	}

	$effect(() => {
		if (isCommitting && changesToCommit) {
			unassignedSidebarFolded.set(false);
		}
	});

	function foldUnnassignedView() {
		unassignedSidebarFolded.set(true);
	}

	function checkSelectedFilesForCommit() {
		const selectedPaths = Array.from(viewModel.selection.current.selectedPaths);

		if (selectedPaths.length > 0) {
			for (const path of selectedPaths) {
				viewModel.dispatchHunkSelection({ type: "checkFile", path });
			}
		} else {
			viewModel.dispatchHunkSelection({ type: "checkAll" });
		}
	}

	function uncheckAll() {
		viewModel.dispatchHunkSelection({ type: "uncheckAll" });
	}

	function checkAllFiles() {
		viewModel.dispatchHunkSelection({ type: "checkAll" });
	}

	function checkFilesForCommit(): true {
		switch ($stagingBehaviorFeature) {
			case "all":
				checkAllFiles();
				return true;
			case "selection":
				checkSelectedFilesForCommit();
				return true;
			case "none":
				uncheckAll();
				return true;
		}
	}
</script>

{#snippet foldButton()}
	{#if !isCommitting && !unassignedSidebarFolded.current}
		<div class="unassigned-fold-button">
			<UnassignedFoldButton active={false} onclick={foldUnnassignedView} />
		</div>
	{/if}
{/snippet}

{#if !unassignedSidebarFolded.current}
	<div class="unassigned" role="presentation" use:focusable={{ vertical: true }}>
		<div class="unassigned-wrap">
			<div role="presentation" class="unassigned-files-wrapper" onclick={unselectFiles}>
				<WorktreeChanges
					title="Unstaged"
					{projectId}
					stackId={undefined}
					mode="unassigned"
					{viewModel}
					{foldButton}
					{onFileClick}
					{visibleRange}
				>
					{#snippet emptyPlaceholder()}
						<div class="unassigned-empty">
							{@html noChanges}
							<p class="text-13 text-body unassigned-empty-text">
								You're all caught up!<br />
								No files need committing
							</p>
						</div>
					{/snippet}
				</WorktreeChanges>
			</div>

			<UnassignedViewForgeIntegrationBanner {projectId} />

			{#if changesToCommit}
				<div class="create-new" use:focusable>
					<Button
						type="button"
						wide
						reversedDirection
						disabled={!!projectState.exclusiveAction.current}
						onclick={() => {
							projectState.exclusiveAction.set({
								type: "commit",
								stackId: undefined,
								branchName: undefined,
							});
							checkFilesForCommit();
							posthog.captureAction(ActionEvent.CommitToNewBranch);
						}}
						icon={isCommitting ? undefined : "plus"}
						testId={TestId.CommitToNewBranchButton}
						kind="outline"
					>
						{#if isCommitting}
							Committing…
						{:else}
							Commit to new branch
						{/if}
					</Button>
				</div>
			{/if}
		</div>

		<RulesList {projectId} />
	</div>
{:else}
	<div
		role="presentation"
		class="unassigned-folded"
		ondblclick={unfoldView}
		class:changes-to-commit={changesToCommit}
		use:focusable={{ vertical: true }}
	>
		<UnassignedFoldButton active={true} onclick={unfoldView} />

		<div class="unassigned-folded-content">
			<Badge>
				{treeChangesCount > 99 ? "99+" : treeChangesCount}
			</Badge>
			<span
				bind:clientWidth={foldedContentWidth}
				style="height: {foldedContentWidth}px;"
				class="unassigned-folded-text text-14 text-semibold">Unstaged</span
			>
		</div>
	</div>
{/if}

<style lang="postcss">
	.unassigned-empty {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 0 20px 40px;
		gap: 20px;
	}

	.unassigned-empty-text {
		color: var(--text-3);
		text-align: center;
	}

	.unassigned {
		display: flex;
		flex-direction: column;
		height: calc(100% + 1px);
		margin-bottom: -1px;
		overflow: hidden;
		background-color: var(--bg-1);
	}

	.unassigned-wrap {
		display: flex;
		flex: 1;
		flex-direction: column;
		overflow: hidden;
		border-bottom: 1px solid var(--border-2);
	}

	.create-new {
		display: flex;
		flex-direction: column;
		padding: 12px 12px 14px 12px;
		border-top: 1px solid var(--border-3);
	}

	/* FOLDED */
	.unassigned-folded {
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
		padding: 11px 0;
		gap: 10px;

		&.changes-to-commit {
			background-color: var(--bg-1);
		}
	}

	.unassigned-folded-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
		gap: 10px;
	}

	.unassigned-folded-text {
		display: flex;
		align-items: center;
		writing-mode: vertical-lr;
	}

	.unassigned-files-wrapper {
		display: flex;
		position: relative;
		flex: 1;
		flex-direction: column;
		overflow: hidden;
	}

	/* MODIFIERS */

	.unassigned-fold-button {
		display: flex;
		/* Align this icon's position with the folded one.
		Prevent any position shifting or jumping. */
		margin-left: -3px;
	}
</style>
