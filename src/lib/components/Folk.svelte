<script lang="ts">
	import { onMount } from 'svelte';
	import { lights } from '$lib/lights';
	import FolkPainting from './FolkPainting.svelte';
	import Gromnica from './Gromnica.svelte';

	/**
	 * §3.6: the drawn half of the folk look; the colours are themes.css's. `sky`
	 * is a band of red-thread embroidery along the top of the screen and the
	 * painting behind the page, and `foot` a lit gromnica under the rules tip.
	 * The look has no `ground` or `land`. When the room hears a ballot land
	 * (lights.flicker), candlelight runs along the thread.
	 */
	let { part }: { part: 'sky' | 'ground' | 'land' | 'foot' } = $props();

	let glinting = $state(false);
	onMount(() => {
		if (part !== 'sky') return;
		let timer: ReturnType<typeof setTimeout>;
		const flicker = () => {
			clearTimeout(timer);
			glinting = false;
			requestAnimationFrame(() => {
				glinting = true;
				timer = setTimeout(() => (glinting = false), 1600);
			});
		};
		lights.flicker = flicker;
		return () => {
			clearTimeout(timer);
			// whichever look comes next may have registered its own by now
			if (lights.flicker === flicker) lights.flicker = () => {};
		};
	});
</script>

{#if part === 'sky'}
	<div class="band" class:glinting aria-hidden="true"></div>
	<FolkPainting />
{:else if part === 'foot'}
	<Gromnica size={22} />
{/if}

<style>
	/* fixed over the top of the screen like the other looks' strings: 18px of
	   solid page colour, which is what the sticky header parks under
	   (themes.css), with the embroidery run along the middle of it */
	.band {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 18px;
		background: var(--bg);
		pointer-events: none;
		z-index: 60;
	}
	.band::before,
	.band::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 3px;
		height: 12px;
	}
	.band::before {
		background: var(--stitch) repeat-x left center / 11.1px 12px;
	}
	/* the glint: candlelight passing along, showing only where there is thread */
	.band::after {
		background: linear-gradient(90deg, transparent, #ffd28a 50%, transparent) no-repeat;
		background-size: 480px 100%;
		background-position: -480px 0;
		-webkit-mask: var(--stitch) repeat-x left center / 11.1px 12px;
		mask: var(--stitch) repeat-x left center / 11.1px 12px;
		opacity: 0;
	}
	.glinting::after {
		animation: glint 1.6s ease-in-out;
	}
	@keyframes glint {
		from {
			background-position: -480px 0;
			opacity: 1;
		}
		to {
			background-position: calc(100% + 480px) 0;
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.glinting::after {
			animation: none;
		}
	}
</style>
