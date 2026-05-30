<script lang="ts">
	import { PROJECT_LIFECYCLE_STORE } from "$lib/projectLifecycle";
	import { SHORTCUT_SERVICE } from "$lib/shortcuts/shortcutService";
	import { inject } from "@gitbutler/core/context";
	import { mergeUnlisten } from "@gitbutler/ui/utils/mergeUnlisten";

	const lifecycleStore = inject(PROJECT_LIFECYCLE_STORE);
	const shortcutService = inject(SHORTCUT_SERVICE);

	$effect(() =>
		mergeUnlisten(
			shortcutService.on("add-local-repo", async () => {
				await lifecycleStore.addProjectAndNavigate();
			}),
			shortcutService.on("clone-repo", async () => {
				lifecycleStore.navigateToClone();
			}),
		),
	);
</script>
