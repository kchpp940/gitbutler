<script lang="ts">
	import { changesToDiffSpec } from "$lib/commits/utils";
	import { computeChangeStatus } from "$lib/files/fileStatus";
	import { isTreeChange } from "$lib/hunks/change";
	import { FILE_SELECTION_MANAGER } from "$lib/selection/fileSelectionManager.svelte";
	import { STACK_COMMAND_EXECUTOR } from "$lib/stacks/commandExecutorFactory";
	import { STACK_COMMANDS } from "$lib/stacks/stackCommands";
	import type { DiscardChangesCommand } from "$lib/stacks/stackCommands";
	import { inject } from "@gitbutler/core/context";
	import { AsyncButton, Button, FileListItem, Modal, TestId } from "@gitbutler/ui";
	import type { SelectionId } from "$lib/selection/key";
	import type { TreeChange } from "@gitbutler/but-sdk";

	type ChangedFilesItem = {
		changes: TreeChange[];
	};

	function isChangedFilesItem(item: unknown): item is ChangedFilesItem {
		return (
			typeof item === "object" &&
			item !== null &&
			"changes" in item &&
			Array.isArray(item.changes) &&
			item.changes.every(isTreeChange)
		);
	}

	type ChangedFolderItem = ChangedFilesItem & { path: string };

	function isChangedFolderItem(item: ChangedFilesItem): item is ChangedFolderItem {
		return "path" in item && typeof item.path === "string";
	}

	type Props = {
		projectId: string;
		selectionId: SelectionId;
	};

	const { projectId, selectionId }: Props = $props();

	const commandExecutor = inject(STACK_COMMAND_EXECUTOR);
	const idSelection = inject(FILE_SELECTION_MANAGER);

	let modal: ReturnType<typeof Modal> | undefined;

	export function show(item: ChangedFilesItem) {
		modal?.show(item);
	}

	async function confirmDiscard(item: ChangedFilesItem) {
		const command: DiscardChangesCommand = {
			type: STACK_COMMANDS.DISCARD_CHANGES,
			projectId,
			worktreeChanges: changesToDiffSpec(item.changes),
		};
		await commandExecutor.execute(command);

		const selectedFiles = item.changes.map((change) => ({ ...selectionId, path: change.path }));
		idSelection.removeMany(selectedFiles);

		modal?.close();
	}
</script>

<Modal
	width="small"
	type="warning"
	title="Discard changes"
	testId={TestId.DiscardFileChangesConfirmationModal}
	bind:this={modal}
>
	{#snippet children(item)}
		{#if isChangedFilesItem(item)}
			{#if isChangedFolderItem(item)}
				<p class="discard-caption">
					Are you sure you want to discard all changes in
					<span class="text-bold">{item.path}</span>?
				</p>
			{:else}
				{@const changes = item.changes}
				{#if changes.length < 10}
					<p class="discard-caption">
						Are you sure you want to discard the changes<br />to the following files:
					</p>
					<ul class="file-list">
						{#each changes as change}
							<FileListItem
								filePath={change.path}
								fileStatus={computeChangeStatus(change)}
								clickable={false}
								listMode="list"
							/>
						{/each}
					</ul>
				{:else}
					<p>
						Discard the changes to all <span class="text-bold">
							{changes.length} files
						</span>?
					</p>
				{/if}
			{/if}
		{:else}
			<p class="text-13">Woops! Malformed data :(</p>
		{/if}
	{/snippet}
	{#snippet controls(close, item)}
		<Button
			testId={TestId.DiscardFileChangesConfirmationModal_Cancel}
			kind="outline"
			onclick={close}>Cancel</Button
		>
		<AsyncButton
			testId={TestId.DiscardFileChangesConfirmationModal_Discard}
			style="danger"
			type="submit"
			action={async () => {
				if (isChangedFilesItem(item)) await confirmDiscard(item);
			}}
		>
			Confirm
		</AsyncButton>
	{/snippet}
</Modal>

<style lang="postcss">
	.discard-caption {
		color: var(--text-2);
	}
	.file-list {
		display: flex;
		flex-direction: column;
		margin-top: 12px;
		overflow: hidden;
		border: 1px solid var(--border-2);
		border-radius: var(--radius-m);
		background-color: var(--bg-1);
	}
</style>
