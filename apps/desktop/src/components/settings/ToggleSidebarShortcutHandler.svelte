<script lang="ts">
	import { SETTINGS_ORCHESTRATOR } from "$lib/settings/settingsOrchestrator";
	import { SHORTCUT_SERVICE } from "$lib/shortcuts/shortcutService";
	import { UI_STATE } from "$lib/state/uiState.svelte";
	import { inject } from "@gitbutler/core/context";

	const shortcutService = inject(SHORTCUT_SERVICE);
	const uiState = inject(UI_STATE);
	const orchestrator = inject(SETTINGS_ORCHESTRATOR);

	const unassignedSidebarFolded = uiState.global.unassignedSidebarFolded;

	function toggleSidebar() {
		orchestrator.previewSidebarFolded(!unassignedSidebarFolded.current);
	}

	$effect(() => shortcutService.on("toggle-sidebar", () => toggleSidebar()));
</script>
