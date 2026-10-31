<script lang="ts">
	import type { Look } from '$lib/themes';
	import Halloween from './Halloween.svelte';

	/**
	 * §3.6: the drawn half of a look, in the four places the layout leaves for
	 * it: `sky` over the top of the screen, `ground` at the foot of the page's
	 * column, `land` the window's width behind and in front of it, and `foot`
	 * the little still life under the rules tip.
	 */
	let { look, part }: { look: Look; part: 'sky' | 'ground' | 'land' | 'foot' } = $props();
</script>

{#if look === 'halloween'}
	<Halloween {part} />
{/if}
