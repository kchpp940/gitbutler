<script lang="ts" module>
	export type AddDependentBranchModalProps = {
		projectId: string;
		stackId: string;
	};
</script>

<script lang="ts">
	import BranchNameTextbox from "$components/branch/BranchNameTextbox.svelte";
	import { STACK_COMMAND_EXECUTOR } from "$lib/stacks/commandExecutorFactory";
	import { STACK_COMMANDS } from "$lib/stacks/stackCommands";
	import type { CreateCommitCommand } from "$lib/stacks/stackCommands";
	import { inject } from "@gitbutler/core/context";
	import { Button, Modal, TestId } from "@gitbutler/ui";

	const { projectId, stackId }: AddDependentBranchModalProps = $props();

	const commandExecutor = inject(STACK_COMMAND_EXECUTOR);

	let modal = $state<Modal>();
	let branchName = $state<string>();
	let normalizedRefName: string | undefined = $state();
	let isBranchNameValid = $state(false);

	async function handleAddDependentBranch(close: () => void) {
		if (!normalizedRefName) return;

		const command: CreateCommitCommand = {
			type: STACK_COMMANDS.CREATE_COMMIT,
			projectId,
			stackId,
			branchName: normalizedRefName,
		};
		await commandExecutor.execute(command);

		close();
	}

	export function show() {
		modal?.show();
	}
</script>

<Modal
	testId={TestId.BranchHeaderAddDependanttBranchModal}
	bind:this={modal}
	width="small"
	title="Add dependent branch"
	onSubmit={handleAddDependentBranch}
>
	<div class="content-wrap">
		<BranchNameTextbox
			placeholder="Branch name"
			bind:value={branchName}
			autofocus
			onnormalizedvalue={(value) => (normalizedRefName = value)}
			onvalidationchange={(isValid) => (isBranchNameValid = isValid)}
		/>
	</div>
	{#snippet controls(close)}
		<Button kind="outline" type="reset" onclick={close}>Cancel</Button>
		<Button
			testId={TestId.BranchHeaderAddDependanttBranchModal_ActionButton}
			style="pop"
			type="submit"
			disabled={!isBranchNameValid}>Add branch</Button
		>
	{/snippet}
</Modal>
