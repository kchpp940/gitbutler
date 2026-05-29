<script lang="ts">
	import { REMOTES_SERVICE } from "$lib/git/remotesService";
	import { inject } from "@gitbutler/core/context";
	import { Button, Icon, Modal, Textbox, TestId } from "@gitbutler/ui";

	type Props = {
		projectId: string;
	};

	let { projectId }: Props = $props();

	const remotesService = inject(REMOTES_SERVICE);

	let addRemoteModal: ReturnType<typeof Modal>;
	let nameInput: ReturnType<typeof Textbox>;
	let urlInput: ReturnType<typeof Textbox>;
	let name = $state("origin");
	let url = $state("");
	let loading = $state(false);
	let error = $state<string | null>(null);

	export function open() {
		name = "origin";
		url = "";
		error = null;
		addRemoteModal?.open();
	}

	async function confirm() {
		if (!name.trim() || !url.trim()) return;

		loading = true;
		error = null;
		try {
			await remotesService.addRemote(projectId, name.trim(), url.trim());
			addRemoteModal.close();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	function onModalOpen() {
		nameInput?.focus();
	}

	function onNameKeydown(e: KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			urlInput?.focus();
		}
	}

	function onUrlKeydown(e: KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			confirm();
		}
	}
</script>

<Modal bind:this={addRemoteModal} on:open={onModalOpen}>
	<Modal.Title class="text-18 text-semibold">Add Remote</Modal.Title>

	<Modal.Body>
		<div class="flex flex-col gap-4">
			<p class="text-14 clr-text-2">
				Configure a Git remote to enable push, pull, and background sync for this repository.
			</p>

			<div class="flex flex-col gap-2">
				<label class="text-14 text-semibold">Remote Name</label>
				<Textbox
					bind:this={nameInput}
					value={name}
					placeholder="origin"
					on:input={(e) => (name = e.detail)}
					on:keydown={onNameKeydown}
					disabled={loading}
				/>
			</div>

			<div class="flex flex-col gap-2">
				<label class="text-14 text-semibold">Remote URL</label>
				<Textbox
					bind:this={urlInput}
					value={url}
					placeholder="git@github.com:user/repo.git or https://github.com/user/repo.git"
					on:input={(e) => (url = e.detail)}
					on:keydown={onUrlKeydown}
					disabled={loading}
				/>
			</div>

			{#if error}
				<div class="flex items-center gap-2 text-13 clr-danger">
					<Icon name="info" color="var(--danger)" />
					<span>{error}</span>
				</div>
			{/if}
		</div>
	</Modal.Body>

	<Modal.Footer>
		<div class="flex justify-between gap-3">
			<Button kind="secondary" disabled={loading} onclick={() => addRemoteModal.close()}>
				Cancel
			</Button>
			<Button
				kind="primary"
				disabled={!name.trim() || !url.trim() || loading}
				loading={loading}
				onclick={confirm}
				data-testid={TestId.AddRemoteConfirm}
			>
				Add Remote
			</Button>
		</div>
	</Modal.Footer>
</Modal>

<style lang="postcss">
	.clr-text-2 {
		color: var(--text-2);
	}

	.clr-danger {
		color: var(--danger);
	}
</style>
