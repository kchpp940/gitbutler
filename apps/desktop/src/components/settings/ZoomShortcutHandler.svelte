<script lang="ts">
	import { SETTINGS_ORCHESTRATOR } from "$lib/settings/settingsOrchestrator";
	import { SHORTCUT_SERVICE } from "$lib/shortcuts/shortcutService";
	import { UI_STATE } from "$lib/state/uiState.svelte";
	import { inject } from "@gitbutler/core/context";
	import { mergeUnlisten } from "@gitbutler/ui/utils/mergeUnlisten";
	import { onMount } from "svelte";

	const uiState = inject(UI_STATE);
	const shortcutService = inject(SHORTCUT_SERVICE);
	const orchestrator = inject(SETTINGS_ORCHESTRATOR);
	const zoom = uiState.global.zoom;

	const ZOOM_STEP = 0.0625;
	const DEFAULT_ZOOM = 1;

	function setDomZoom(zoomValue: number) {
		document.documentElement.style.fontSize = zoomValue + "rem";
	}

	$effect(() =>
		mergeUnlisten(
			shortcutService.on("zoom-in", () => {
				orchestrator.previewZoom(zoom.current + ZOOM_STEP);
			}),
			shortcutService.on("zoom-out", () => {
				orchestrator.previewZoom(zoom.current - ZOOM_STEP);
			}),
			shortcutService.on("zoom-reset", () => {
				orchestrator.previewZoom(DEFAULT_ZOOM);
			}),
		),
	);

	onMount(() => {
		const currentZoom = zoom.current;
		if (currentZoom !== DEFAULT_ZOOM) {
			setDomZoom(currentZoom);
		}
	});
</script>
