<script lang="ts">
	import { goto } from "$app/navigation";
	import { handleAddProjectOutcome, handleProjectCommandError } from "$lib/project/project";
	import { PROJECT_ERROR_STORE } from "$lib/project/projectErrorStore";
	import { PROJECTS_SERVICE } from "$lib/project/projectsService";
	import { clonePath, projectPath } from "$lib/routes/routes.svelte";
	import { SHORTCUT_SERVICE } from "$lib/shortcuts/shortcutService";
	import { inject } from "@gitbutler/core/context";
	import { mergeUnlisten } from "@gitbutler/ui/utils/mergeUnlisten";

	const projectsService = inject(PROJECTS_SERVICE);
	const shortcutService = inject(SHORTCUT_SERVICE);

	async function tryAddProject() {
		const outcome = await projectsService.addProject();
		if (!outcome) return;
		if (outcome.type === "added" || outcome.type === "alreadyExists") {
			handleAddProjectOutcome(outcome, (project) => goto(projectPath(project.id)));
		} else {
			PROJECT_ERROR_STORE.addOutcomeError(outcome, {
				retry: tryAddProject,
			});
		}
	}

	$effect(() =>
		mergeUnlisten(
			shortcutService.on("add-local-repo", async () => {
				try {
					await tryAddProject();
				} catch (e: unknown) {
					handleProjectCommandError(e, {
						retry: tryAddProject,
					});
				}
			}),
			shortcutService.on("clone-repo", async () => {
				goto(clonePath());
			}),
		),
	);
</script>
