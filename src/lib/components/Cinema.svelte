<script lang="ts">
	import { onMount } from 'svelte';
	import { lights } from '$lib/lights';

	/**
	 * The everyday look's scenery, drawn the way Halloween.svelte draws its own
	 * and only while no special look is on; the colours are themes.css's.
	 * `sky` is a marquee's row of bulbs along the top of the page, chasing slowly,
	 * and `seats` the back row of the house at the foot of it, heads and all,
	 * caught in the light off the screen, which is the page. Nothing takes a
	 * pointer, and with less motion asked for, nothing moves.
	 */
	let { part }: { part: 'sky' | 'seats' } = $props();

	/** one bulb every SPACE px, lit in three turns the way a marquee chases */
	const SPACE = 14;
	const BULBS = 160;
	const width = BULBS * SPACE;
	const bulbs = Array.from({ length: BULBS }, (_, i) => ({ x: i * SPACE + SPACE / 2, turn: i % 3 }));

	/** a seat every SEAT px; the audience repeats every ROW of them */
	const SEAT = 46;
	const ROW = 7;
	const seats = Array.from({ length: ROW }, (_, i) => i * SEAT);
	// who came: a seat's offset, and how big a head it is; a couple leaning in
	// over a shared bucket, a kid low in their seat, and the tall one at the end
	const heads = [
		{ seat: 0, dx: 0, cy: 25, rx: 7.5, ry: 9 },
		{ seat: 2, dx: 4, cy: 26, rx: 7, ry: 8.5 },
		{ seat: 3, dx: -4, cy: 25, rx: 7.5, ry: 9 },
		{ seat: 5, dx: 0, cy: 22, rx: 8, ry: 10 },
		{ seat: 6, dx: 1, cy: 30, rx: 6, ry: 7 }
	];

	/* ------------------------------------------------------------- chase -- */

	// a ballot landing on the projector sets the bulbs racing for a moment
	let racing = $state(false);
	onMount(() => {
		if (part !== 'sky') return;
		let timer: ReturnType<typeof setTimeout>;
		const race = () => {
			clearTimeout(timer);
			racing = false;
			requestAnimationFrame(() => {
				racing = true;
				timer = setTimeout(() => (racing = false), 1800);
			});
		};
		lights.flicker = race;
		return () => {
			clearTimeout(timer);
			// the other look may have strung its own lights by now
			if (lights.flicker === race) lights.flicker = () => {};
		};
	});
</script>

{#if part === 'sky'}
	<div class="marquee" class:racing aria-hidden="true">
		<svg {width} height="16" viewBox="0 0 {width} 16">
			<defs>
				<filter id="mglow" x="-150%" y="-150%" width="400%" height="400%">
					<feGaussianBlur stdDeviation="1.8" result="blur" />
					<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
				</filter>
			</defs>
			{#each bulbs as bulb, i (i)}
				<circle class="socket" cx={bulb.x} cy="8" r="3.2" />
				<circle class="bulb t{bulb.turn}" cx={bulb.x} cy="8" r="2.4" filter="url(#mglow)" />
			{/each}
		</svg>
	</div>
{:else}
	<div class="house" aria-hidden="true">
		<svg width="100%" height="64">
			<defs>
				<pattern id="row" width={SEAT * ROW} height="64" patternUnits="userSpaceOnUse">
					{#each heads as head (head.seat)}
						<ellipse
							class="head"
							cx={head.seat * SEAT + SEAT / 2 + head.dx}
							cy={head.cy}
							rx={head.rx}
							ry={head.ry}
						/>
					{/each}
					<!-- the couple's popcorn, held up between them -->
					<g transform="translate({3 * SEAT - 6} 17)">
						<path class="corn" d="M0 5q1-4 3-3 1-3 3-1 2-2 3 1 3-1 3 3z" />
						<path class="tub" d="M0 5h12l-1.4 9H1.4z" />
						<path class="stripe" d="M3.4 5l.4 9M8.6 5l-.4 9" />
					</g>
					{#each seats as x (x)}
						<path class="seat" d="M{x + 4} 64V36q0-6 6-6h26q6 0 6 6v28z" />
						<path class="rim" d="M{x + 6} 33q1-3 4-3h26q3 0 4 3" />
					{/each}
				</pattern>
			</defs>
			<rect width="100%" height="64" fill="url(#row)" />
		</svg>
	</div>
{/if}

<style>
	/* ------------------------------------------------------------ marquee -- */
	/* fixed over the top of the screen like Halloween's lights, on a strip of
	   solid page colour the sticky header parks under (themes.css) */
	.marquee {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 16px;
		background: var(--bg);
		box-shadow: inset 0 -1px 0 var(--marquee-edge);
		overflow: hidden;
		pointer-events: none;
		z-index: 60;
	}
	.socket {
		fill: var(--socket);
	}
	.bulb {
		fill: var(--bulb);
		animation: chase 3.6s ease-in-out infinite;
	}
	.t1 {
		animation-delay: -1.2s;
	}
	.t2 {
		animation-delay: -2.4s;
	}
	@keyframes chase {
		0%,
		100% {
			opacity: 1;
		}
		33%,
		67% {
			opacity: 0.3;
		}
	}
	/* a ballot in: the chase runs at full marquee speed for a few turns */
	.racing .bulb {
		animation-duration: 0.45s;
		animation-timing-function: steps(1);
	}
	.racing .t1 {
		animation-delay: -0.15s;
	}
	.racing .t2 {
		animation-delay: -0.3s;
	}

	/* -------------------------------------------------------------- seats -- */
	/* the width of the window at the foot of the body, the way Halloween's land
	   is: the wrap keeps room for it and is at least a screen tall (themes.css),
	   so a short page still has its back row at the bottom of the window */
	.house {
		position: absolute;
		left: 0;
		right: 0;
		bottom: calc(32px + env(safe-area-inset-bottom, 0px));
		height: 64px;
		overflow: hidden;
		pointer-events: none;
		/* the light off the screen, which is behind the heads from here */
		background: radial-gradient(60% 70% at 50% 62%, var(--screenlight), transparent 70%);
		/* the row sinks into the dark rather than stopping on a line, so the foot
		   of the page is the plain --bg Safari carries on under its bar */
		-webkit-mask-image: linear-gradient(#000 55%, transparent);
		mask-image: linear-gradient(#000 55%, transparent);
	}
	.house svg {
		display: block;
	}
	.head {
		fill: var(--head);
	}
	.seat {
		fill: var(--seat);
	}
	.rim {
		fill: none;
		stroke: var(--seat-rim);
		stroke-width: 1.2;
		stroke-linecap: round;
	}
	.corn {
		fill: var(--popcorn);
	}
	.tub {
		fill: var(--popcorn-tub);
	}
	.stripe {
		fill: none;
		stroke: var(--popcorn);
		stroke-width: 1.6;
	}

	@media (prefers-reduced-motion: reduce) {
		.bulb,
		.racing .bulb {
			animation: none;
		}
	}
</style>
