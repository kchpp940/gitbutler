<script lang="ts">
	import ProjectSetupTarget from "$components/onboarding/ProjectSetupTarget.svelte";
	import IllustrationSplitLayout from "$components/shared/IllustrationSplitLayout.svelte";
	import ReduxResult from "$components/shared/ReduxResult.svelte";
	import newZenSvg from "$lib/assets/illustrations/new-zen.svg?raw";
	import { PROJECT_LIFECYCLE_STORE } from "$lib/projectLifecycle";
	import { PROJECTS_SERVICE } from "$lib/project/projectsService";
	import { inject } from "@gitbutler/core/context";
	import { TestId } from "@gitbutler/ui";
	import type { RemoteBranchInfo } from "$lib/baseBranch/baseBranch";

	interface Props {
		projectId: string;
		remoteBranches: RemoteBranchInfo[];
	}

	const { projectId, remoteBranches }: Props = $props();

	const projectsService = inject(PROJECTS_SERVICE);
	const lifecycleStore = inject(PROJECT_LIFECYCLE_STORE);
	const projectQuery = $derived(projectsService.getProject(projectId));

	let isActivating = $derived(lifecycleStore.status.current === "activating");

	async function setTarget(branch: string[]) {
		if (!branch[0] || branch[0] === "") return;
		await lifecycleStore.setTargetBranch(projectId, branch[0], branch[1]);
	}
</script>

<IllustrationSplitLayout img={newZenSvg} testId={TestId.ProjectSetupPage}>
	<ReduxResult {projectId} result={projectQuery.result}>
		{#snippet children(project)}
			<ProjectSetupTarget
				{projectId}
				projectName={project.title}
				{remoteBranches}
				loading={isActivating}
				onBranchSelected={async (branch) => {
					await setTarget(branch);
				}}
			/>
		{/snippet}
	</ReduxResult>
</IllustrationSplitLayout>
