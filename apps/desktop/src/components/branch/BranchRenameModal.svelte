<script lang="ts" module>
	export type BranchRenameModalProps = {
		projectId: string;
		stackId?: string;
		laneId: string;
		branchName: string;
		isPushed: boolean;
	};
</script>

<script lang="ts">
	import BranchNameTextbox from "$components/branch/BranchNameTextbox.svelte";
	import { STACK_COMMAND_EXECUTOR } from "$lib/stacks/commandExecutorFactory";
	import { STACK_COMMANDS } from "$lib/stacks/stackCommands";
	import type { UpdateBranchNameCommand } from "$lib/stacks/stackCommands";
	import { inject } from "@gitbutler/core/context";
	import { Button, ElementId, Modal, TestId } from "@gitbutler/ui";

	const { projectId, stackId, laneId, branchName, isPushed }: BranchRenameModalProps = $props();
	const commandExecutor = inject(STACK_COMMAND_EXECUTOR);

	let newName: string | undefined = $state();
	let normalizedRefName: string | undefined = $state();
	let isBranchNameValid = $state(false);
	let modal: Modal | undefined = $state();

	let branchNameInput = $state<ReturnType<typeof BranchNameTextbox>>();

	export async function show() {
		newName = branchName;
		modal?.show();
		await branchNameInput?.selectAll();
	}
</script>

<Modal
	testId={TestId.BranchHeaderRenameModal}
	width="small"
	title={isPushed ? "Branch has already been pushed" : "Rename branch"}
	type={isPushed ? "warning" : "info"}
	bind:this={modal}
	onSubmit={async (close) => {
		if (normalizedRefName && stackId) {
			const command: UpdateBranchNameCommand = {
				type: STACK_COMMANDS.UPDATE_BRANCH_NAME,
				projectId,
				stackId,
				laneId,
				branchName,
				newName: normalizedRefName,
			};
			await commandExecutor.execute(command);
		}
		close();
	}}
>
	<BranchNameTextbox
		bind:this={branchNameInput}
		placeholder="New name"
		id={ElementId.NewBranchNameInput}
		bind:value={newName}
		autofocus
		onnormalizedvalue={(value) => (normalizedRefName = value)}
		onvalidationchange={(isValid) => (isBranchNameValid = isValid)}
	/>

	{#if isPushed}
		<div class="text-12 helper-text">
			Renaming a branch that has already been pushed will create a new branch at the remote. The old
			one will remain untouched but will be disassociated from this branch.
		</div>
	{/if}

	{#snippet controls(close)}
		<Button kind="outline" type="reset" onclick={close}>Cancel</Button>
		<Button
			testId={TestId.BranchHeaderRenameModal_ActionButton}
			style="pop"
			type="submit"
			disabled={!isBranchNameValid}>Rename</Button
		>
	{/snippet}
</Modal>

<style lang="postcss">
	.helper-text {
		margin-top: 1rem;
		color: var(--text-2);
		line-height: 1.5;
	}
</style>
