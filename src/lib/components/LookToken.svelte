<script lang="ts">
	import type { Look } from '$lib/themes';
	import Bauble from './Bauble.svelte';
	import Pigeon from './Pigeon.svelte';
	import Pumpkin from './Pumpkin.svelte';

	/**
	 * §3.6: what a look draws a vote as: the lamp on a pick, a ballot in the room,
	 * a place in the ranking. `lit` is the vote cast, `live` lets the change
	 * play, `carve` puts a number on it in place of its face.
	 */
	let {
		look,
		size = 32,
		lit = true,
		live = false,
		carve
	}: { look: Look; size?: number; lit?: boolean; live?: boolean; carve?: string } = $props();
</script>

{#if look === 'halloween'}
	<Pumpkin {size} {lit} {live} {carve} />
{:else if look === 'swieta'}
	<Bauble {size} {lit} {live} {carve} />
{:else if look === 'prl'}
	<Pigeon {size} {lit} {live} {carve} />
{/if}
