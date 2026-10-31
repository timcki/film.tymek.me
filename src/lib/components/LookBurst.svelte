<script lang="ts">
	import type { Look } from '$lib/themes';
	import BatBurst from './BatBurst.svelte';
	import Confetti from './Confetti.svelte';

	/**
	 * The decided night's confetti, in the look's own kind. `big` is the
	 * projector's, which has a room to fill; `from` is where it bursts out of.
	 */
	let {
		look,
		big = false,
		from,
		onDone
	}: { look: Look | null; big?: boolean; from?: { x: number; y: number }; onDone: () => void } = $props();
</script>

{#if look === 'halloween'}
	<BatBurst count={big ? 70 : undefined} {from} {onDone} />
{:else if big}
	<Confetti count={120} duration={2400} {onDone} />
{:else}
	<Confetti {onDone} />
{/if}
