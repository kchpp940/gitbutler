<script lang="ts">
	import { PROJECT_DRAFT_STORE } from "$lib/settings/projectDraftStore";
	import { CardGroup, Spacer, Textarea, Textbox } from "@gitbutler/ui";

	const { projectId, projectPath }: { projectId: string; projectPath: string } = $props();
	const projectDraftStore = PROJECT_DRAFT_STORE;
</script>

<CardGroup>
	<div class="fields-wrapper">
		<Textbox label="Project path" readonly id="path" value={projectPath} />
		<div class="description-wrapper">
			<Textbox
				label="Project name"
				id="name"
				placeholder="Project name can't be empty"
				value={projectDraftStore.draft.title}
				required
				onchange={(value: string) => {
					projectDraftStore.updateProjectDetails(projectId, { title: value });
				}}
			/>
			<Textarea
				id="description"
				minRows={3}
				maxRows={6}
				placeholder="Project description"
				value={projectDraftStore.draft.description}
				oninput={(e: Event) => {
					const target = e.currentTarget as HTMLTextAreaElement;
					projectDraftStore.updateProjectDetails(projectId, {
						description: target.value,
					});
				}}
			/>
		</div>
	</div>
</CardGroup>

<Spacer />

<style>
	.fields-wrapper {
		display: flex;
		flex-direction: column;
		padding: 16px;
		gap: 16px;
	}

	.description-wrapper {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
</style>
