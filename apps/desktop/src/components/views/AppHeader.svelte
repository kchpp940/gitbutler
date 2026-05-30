<script lang="ts">
	import CreateBranchModal from "$components/branch/CreateBranchModal.svelte";
	import SyncButton from "$components/forge/SyncButton.svelte";
	import IntegrateUpstreamModal from "$components/upstream/IntegrateUpstreamModal.svelte";
	import { BACKEND } from "$lib/backend";
	import { BASE_BRANCH_SERVICE } from "$lib/baseBranch/baseBranchService.svelte";
	import { MODE_SERVICE } from "$lib/mode/modeService";
	import { PROJECT_LIFECYCLE_STORE, ProjectCard } from "$lib/projectLifecycle";
	import { PROJECTS_SERVICE } from "$lib/project/projectsService";
	import { isWorkspacePath } from "$lib/routes/routes.svelte";
	import { SETTINGS_SERVICE } from "$lib/settings/appSettings";
	import { SHORTCUT_SERVICE } from "$lib/shortcuts/shortcutService";
	import { inject } from "@gitbutler/core/context";
	import { Button, Icon, SelectItem, TestId, Tooltip } from "@gitbutler/ui";
	import { focusable } from "@gitbutler/ui/focus/focusable";

	type Props = {
		projectId: string;
		projectTitle: string;
		actionsDisabled?: boolean;
	};

	const { projectId, projectTitle, actionsDisabled = false }: Props = $props();

	const projectsService = inject(PROJECTS_SERVICE);
	const lifecycleStore = inject(PROJECT_LIFECYCLE_STORE);
	const serverCapabilitiesQuery = $derived(projectsService.serverCapabilities());
	const canAddProjects = $derived(serverCapabilitiesQuery.response?.canAddProjects ?? true);
	const baseBranchService = inject(BASE_BRANCH_SERVICE);
	const settingsService = inject(SETTINGS_SERVICE);
	const modeService = inject(MODE_SERVICE);
	const shortcutService = inject(SHORTCUT_SERVICE);
	const baseReponse = $derived(projectId ? baseBranchService.baseBranch(projectId) : undefined);
	const base = $derived(baseReponse?.response);
	const settingsStore = $derived(settingsService.appSettings);
	const singleBranchMode = $derived($settingsStore?.featureFlags.singleBranch ?? false);
	const useCustomTitleBar = $derived(!($settingsStore?.ui.useNativeTitleBar ?? false));
	const backend = inject(BACKEND);
	const mode = $derived(modeService.mode(projectId));
	const currentMode = $derived(mode.response);
	const currentBranchName = $derived.by(() => {
		if (currentMode?.type === "OpenWorkspace") {
			return "gitbutler/workspace";
		} else if (currentMode?.type === "OutsideWorkspace") {
			return currentMode.subject.branchName || "detached HEAD";
		} else if (currentMode?.type === "Edit") {
			return "gitbutler/edit";
		}
		return "gitbutler/workspace";
	});

	const isNotInWorkspace = $derived(
		currentMode?.type !== "OpenWorkspace" && currentMode?.type !== "Edit",
	);
	const [switchBackToWorkspace, workspaceSwitch] = baseBranchService.switchBackToWorkspace;

	async function switchToWorkspace() {
		if (base) {
			await switchBackToWorkspace({
				projectId,
			});
		}
	}

	const upstreamCommits = $derived(base?.behind ?? 0);
	const isHasUpstreamCommits = $derived(upstreamCommits > 0);

	let modal = $state<ReturnType<typeof IntegrateUpstreamModal>>();

	const projects = $derived(projectsService.projects());

	let newProjectLoading = $state(false);
	let projectSelectorOpen = $state(false);
	let showProjectList = $state(false);

	const isOnWorkspacePage = $derived(!!isWorkspacePath());

	function openModal() {
		modal?.show();
	}

	let createBranchModal = $state<CreateBranchModal>();

	$effect(() => shortcutService.on("create-branch", () => createBranchModal?.show()));
	$effect(() =>
		shortcutService.on("create-dependent-branch", () => createBranchModal?.show("dependent")),
	);
</script>

{#if projectId}
	<IntegrateUpstreamModal bind:this={modal} {projectId} />
{/if}

<div
	class="chrome-header"
	class:mac={backend.platformName === "macos"}
	data-tauri-drag-region={useCustomTitleBar}
	class:single-branch={singleBranchMode}
	use:focusable
>
	<div class="chrome-left" data-tauri-drag-region={useCustomTitleBar}>
		<div class="chrome-left-buttons" class:has-traffic-lights={useCustomTitleBar}>
			<SyncButton {projectId} disabled={actionsDisabled} />

			{#if isHasUpstreamCommits}
				<Button
					testId={TestId.IntegrateUpstreamCommitsButton}
					style="pop"
					onclick={openModal}
					disabled={!projectId || actionsDisabled}
				>
					{upstreamCommits} upstream {upstreamCommits === 1 ? "commit" : "commits"}
				</Button>
			{:else}
				<div class="chrome-you-are-up-to-date">
					<Icon name="tick" />
					<span class="text-12">You’re up to date</span>
				</div>
			{/if}
		</div>
	</div>

	<div class="chrome-center" data-tauri-drag-region={useCustomTitleBar}>
		<div class="chrome-selector-wrapper">
			<div class="project-selector-trigger">
				<Button
					testId={TestId.ChromeHeaderProjectSelector}
					reversedDirection
					width="auto"
					kind="outline"
					isDropdown
					dropdownOpen={showProjectList}
					class="project-selector-btn"
					onclick={() => (showProjectList = !showProjectList)}
				>
					{#snippet custom()}
						<div class="project-selector-btn__content">
							<Icon name="repo" color="var(--text-2)" />
							<span class="text-12 text-bold">{projectTitle}</span>
						</div>
					{/snippet}
				</Button>

				{#if showProjectList}
					<div class="project-selector-dropdown">
						<div class="project-selector-dropdown__list">
							{#if projects.response}
								{#each projects.response as project}
									<button
										type="button"
										class="project-selector-dropdown__card"
										onclick={() => {
											showProjectList = false;
											if (project.id !== projectId) {
												lifecycleStore.switchToProject(project.id);
											}
										}}
									>
										<ProjectCard
											{project}
											selected={project.id === projectId}
											onOpen={() => {
												showProjectList = false;
												lifecycleStore.switchToProject(project.id);
											}}
										/>
									</button>
								{/each}
							{/if}
						</div>

						<div class="project-selector-dropdown__actions">
							{#if canAddProjects}
								<SelectItem
									icon="plus"
									testId={TestId.ChromeHeaderProjectSelectorAddLocalProject}
									loading={newProjectLoading}
									onClick={async () => {
										newProjectLoading = true;
										try {
											await lifecycleStore.addProjectAndNavigate();
										} finally {
											newProjectLoading = false;
										}
									}}
								>
									Add local repository
								</SelectItem>
							{/if}
							<SelectItem
								icon="clone"
								onClick={() => {
									showProjectList = false;
									lifecycleStore.navigateToClone();
								}}
							>
								Clone repository
							</SelectItem>
						</div>
					</div>
				{/if}
			</div>
			{#if singleBranchMode}
				<Tooltip text="Current branch">
					<div class="chrome-current-branch">
						<div class="chrome-current-branch__content">
							<Icon name="branch" color="var(--text-2)" />
							<span class="text-12 text-bold clr-text-2 truncate">{currentBranchName}</span>
							{#if isNotInWorkspace}
								<span class="text-12 text-bold clr-text-2 op-60"> read-only </span>
							{/if}
						</div>
					</div>
				</Tooltip>
			{/if}
		</div>

		{#if currentMode && isNotInWorkspace}
			<Tooltip text="Switch back to gitbutler/workspace">
				<Button
					kind="outline"
					testId={TestId.ChromeHeaderSwitchBackToWorkspaceButton}
					icon="undo"
					style="warning"
					onclick={switchToWorkspace}
					reversedDirection
					disabled={workspaceSwitch.current.isLoading}
				>
					Back to workspace
				</Button>
			</Tooltip>
		{/if}
	</div>

	<div class="chrome-right" data-tauri-drag-region={useCustomTitleBar}>
		{#if isOnWorkspacePage}
			<Button
				testId={TestId.ChromeHeaderCreateBranchButton}
				kind="outline"
				icon="plus"
				hotkey="⌘B"
				reversedDirection
				onclick={() => createBranchModal?.show()}
			>
				Create branch
			</Button>
		{/if}
	</div>
</div>

<CreateBranchModal bind:this={createBranchModal} {projectId} />

<style>
	.chrome-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px;
		overflow: hidden;
		gap: 12px;
	}

	.chrome-selector-wrapper {
		display: flex;
		position: relative;
		overflow: hidden;
	}

	.project-selector-trigger {
		position: relative;
	}

	.project-selector-dropdown {
		display: flex;
		z-index: 100;
		position: absolute;
		top: 100%;
		left: 50%;
		flex-direction: column;
		min-width: 360px;
		max-height: 480px;
		padding: 8px;
		overflow-y: auto;
		gap: 8px;
		transform: translateX(-50%);
		border: 1px solid var(--border-1);
		border-radius: var(--radius-m);
		background-color: var(--bg-2);
		box-shadow: var(--shadow-popup);
	}

	.project-selector-dropdown__list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.project-selector-dropdown__card {
		width: 100%;
		padding: 0;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.project-selector-dropdown__actions {
		display: flex;
		padding-top: 8px;
		gap: 4px;
		border-top: 1px solid var(--border-1);
	}

	:global(.chrome-header.single-branch .project-selector-btn) {
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
	}

	.project-selector-btn__content {
		display: flex;
		align-items: center;
		padding-right: 2px;
		gap: 6px;
		text-wrap: nowrap;
	}

	.chrome-current-branch {
		display: flex;
		align-items: center;
		padding: 0 10px 0 6px;
		overflow: hidden;
		border: 1px solid var(--border-2);
		border-left: none;
		border-top-right-radius: 100px;
		border-bottom-right-radius: 100px;
	}

	.chrome-current-branch__content {
		display: flex;
		align-items: center;
		overflow: hidden;
		gap: 4px;
		text-wrap: nowrap;
		opacity: 0.8;
	}

	.chrome-left {
		display: flex;
		gap: 14px;
	}

	.chrome-center {
		display: flex;
		flex-shrink: 1;
		overflow: hidden;
		gap: 8px;
	}

	.chrome-right {
		display: flex;
		justify-content: right;
		gap: 4px;
	}

	/** Flex basis 0 means they grow by the same amount. */
	.chrome-right,
	.chrome-left {
		flex-grow: 1;
		flex-basis: 0;
		min-width: max-content;
	}

	.chrome-left-buttons {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	/** Mac padding added here to not affect header flex-box sizing, only applied when using custom title bar. */
	.mac .chrome-left-buttons.has-traffic-lights {
		padding-left: 70px;
	}

	.chrome-you-are-up-to-date {
		display: flex;
		align-items: center;
		padding: 0 4px;
		gap: 4px;
		color: var(--text-2);
	}
</style>
