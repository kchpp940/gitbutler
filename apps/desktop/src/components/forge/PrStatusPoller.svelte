<script lang="ts">
	import { DEFAULT_FORGE_FACTORY } from "$lib/forge/forgeFactory.svelte";
	import { inject } from "@gitbutler/core/context";

	type Props = {
		number: number;
	};

	const { number }: Props = $props();
	const forge = inject(DEFAULT_FORGE_FACTORY);
	const prService = $derived(forge.current.prService);
	const prQuery = $derived(prService?.get(number));
</script>
