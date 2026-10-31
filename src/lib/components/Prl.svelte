<script lang="ts">
	import PosterWall from './PosterWall.svelte';

	/**
	 * §3.6: the drawn half of the PRL look; the colours are themes.css's. Only
	 * `sky` has anything in it: the wall of posters behind the page and the
	 * paper's grain over all of it. The page is left to say its piece clear of
	 * any scenery at its foot.
	 */
	let { part }: { part: 'sky' | 'ground' | 'land' | 'foot' } = $props();
</script>

{#if part === 'sky'}
	<PosterWall />
	<div class="grain" aria-hidden="true"></div>
{/if}

<style>
	/* the paper's tooth over everything below the dialogs, taking no pointer */
	.grain {
		position: fixed;
		inset: 0;
		z-index: 70;
		background: var(--grain);
		pointer-events: none;
	}
</style>
