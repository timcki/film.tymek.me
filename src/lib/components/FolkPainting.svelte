<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * §3.6: what the folk look hangs the page in front of: one painting of the
	 * Polish countryside at its bleakest, the realist and symbolist canvases
	 * the Witcher games' Velen was drawn from, chosen afresh for every visit
	 * and left where it is for the rest of it. Every one is public domain, so
	 * they are served from static/folk to anyone, the demo included. Darkened
	 * and drained a little for the page to read over, and named in the corner
	 * the way a museum would.
	 *
	 * `at` is what to keep in view when the screen crops it.
	 */
	const PAINTINGS = [
		{ file: 'wyspianski-chocholy', by: 'Stanisław Wyspiański', title: 'Chochoły', year: 1898, at: '50% 60%' },
		{ file: 'malczewski-topielec', by: 'Jacek Malczewski', title: 'Topielec w uściskach dziwożony', year: 1888, at: '40% 50%' },
		{ file: 'pruszkowski-rusalki', by: 'Witold Pruszkowski', title: 'Rusałki', year: 1877, at: '50% 55%' },
		{ file: 'ruszczyc-ziemia', by: 'Ferdynand Ruszczyc', title: 'Ziemia', year: 1898, at: '50% 65%' },
		{ file: 'ruszczyc-pustka', by: 'Ferdynand Ruszczyc', title: 'Pustka', year: 1901, at: '50% 50%' },
		{ file: 'weyssenhoff-spleen', by: 'Henryk Weyssenhoff', title: 'Spleen', year: 1890, at: '50% 60%' },
		{ file: 'chelmonski-burza', by: 'Józef Chełmoński', title: 'Burza', year: 1896, at: '50% 55%' },
		{ file: 'witkiewicz-wiatr-halny', by: 'Stanisław Witkiewicz', title: 'Wiatr halny', year: 1895, at: '50% 50%' },
		{ file: 'chelmonski-jesien', by: 'Józef Chełmoński', title: 'Jesień', year: 1875, at: '50% 50%' },
		{ file: 'chelmonski-noc', by: 'Józef Chełmoński', title: 'Noc księżycowa', year: 1876, at: '50% 50%' }
	];

	// chosen in the browser, so the server's render and the page's agree
	let painting = $state<(typeof PAINTINGS)[number] | null>(null);
	let hung = $state(false);
	onMount(() => {
		painting = PAINTINGS[Math.floor(Math.random() * PAINTINGS.length)];
	});
</script>

{#if painting}
	<div class="canvas" class:hung aria-hidden="true">
		<img
			src="/folk/{painting.file}.jpg"
			alt=""
			style:object-position={painting.at}
			onload={() => (hung = true)}
		/>
	</div>
	<p class="label" class:hung>{painting.by}, <i>{painting.title}</i>, {painting.year}</p>
{/if}

<style>
	.canvas {
		position: fixed;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		pointer-events: none;
		opacity: 0;
		transition: opacity 1.6s ease;
	}
	.canvas.hung {
		opacity: 1;
	}
	.canvas img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		filter: saturate(0.75) brightness(0.7) contrast(1.06);
		scale: 1.04;
		animation: drift 90s ease-in-out infinite alternate;
	}
	/* the room it hangs in: dark at the top under the header, darker still in
	   the middle where the cards are read, and the corners gone to black */
	.canvas::after {
		content: '';
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse 75% 70% at 50% 45%, transparent 30%, rgba(8, 7, 6, 0.75) 100%),
			linear-gradient(90deg, transparent, rgba(15, 14, 12, 0.45) 22%, rgba(15, 14, 12, 0.45) 78%, transparent),
			linear-gradient(rgba(15, 14, 12, 0.62), rgba(15, 14, 12, 0.3) 40%, rgba(15, 14, 12, 0.4));
	}
	@media (max-width: 700px) {
		.canvas::after {
			background:
				radial-gradient(ellipse 90% 70% at 50% 45%, transparent 30%, rgba(8, 7, 6, 0.75) 100%),
				rgba(15, 14, 12, 0.5);
		}
	}
	/* so slow it is only ever noticed as the painting not quite being a photo */
	@keyframes drift {
		to {
			scale: 1.1;
			translate: -1.2% -0.8%;
		}
	}
	.label {
		position: fixed;
		right: 16px;
		bottom: calc(12px + env(safe-area-inset-bottom, 0px));
		z-index: 1;
		margin: 0;
		font-size: 11px;
		letter-spacing: 0.02em;
		color: var(--dimmer);
		pointer-events: none;
		opacity: 0;
		transition: opacity 1.6s ease 0.6s;
	}
	.label.hung {
		opacity: 1;
	}
	@media (max-width: 700px) {
		.label {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.canvas img {
			animation: none;
		}
	}
</style>
