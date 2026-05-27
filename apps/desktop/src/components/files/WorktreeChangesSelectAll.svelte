<script lang="ts">
	import { FILE_SELECTION_MANAGER } from "$lib/selection/fileSelectionManager.svelte";
	import { UNCOMMITTED_SERVICE } from "$lib/selection/uncommittedService.svelte";
	import { inject } from "@gitbutler/core/context";
	import { Checkbox } from "@gitbutler/ui";

	type Props = {
		stackId?: string;
	};

	const { stackId }: Props = $props();

	const uncommittedService = inject(UNCOMMITTED_SERVICE);
	const idSelection = inject(FILE_SELECTION_MANAGER);

	const checkStatus = $derived(uncommittedService.stackCheckStatus(stackId));

	function onCheck(checked: boolean) {
		idSelection.toggleStackHunkSelection(checked, stackId || null);
	}
</script>

<Checkbox
	small
	checked={checkStatus.current === "checked" || checkStatus.current === "indeterminate"}
	indeterminate={checkStatus.current === "indeterminate"}
	onchange={(e) => onCheck(e.currentTarget.checked)}
/>
