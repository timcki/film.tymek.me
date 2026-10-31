<script lang="ts">
	import { onMount } from 'svelte';
	import Pumpkin from './Pumpkin.svelte';
	import Skull from './Skull.svelte';
	import Bats from './Bats.svelte';
	import HangingBat from './HangingBat.svelte';
	import Night from './Night.svelte';
	import Cat from './Cat.svelte';
	import { lights } from '$lib/lights';

	/**
	 * §3.6: the drawn half of the Halloween look; the colours are themes.css's.
	 * `sky` is a string of lights along the top of the page, a bat roosting on
	 * it and colonies of them crossing the sky, `ground` the pumpkins and skulls
	 * the page ends on, and `land` the far horizon and the fog behind and in
	 * front of them, which spans the whole window rather than the page's column;
	 * `foot` is a skull and a pumpkin under the rules tip.
	 * Only the roosting bat takes a pointer, and with less motion asked for,
	 * nothing moves.
	 */
	let { part }: { part: 'sky' | 'ground' | 'land' | 'foot' } = $props();

	/** one bulb every SPACE px, sagging in swags of SWAG bulbs */
	const SPACE = 34;
	const SWAG = 4;
	const BULBS = 60;
	const HUES = ['#ff8a1f', '#a46bff', '#8fef5a', '#ff8a1f', '#ff5a3c'];
	const sag = (t: number) => 3 + 36 * t * (1 - t);
	const width = BULBS * SPACE;
	const wire = Array.from({ length: BULBS / SWAG }, (_, k) => {
		const x0 = k * SWAG * SPACE;
		const x1 = x0 + SWAG * SPACE;
		return `M${x0} 3Q${(x0 + x1) / 2} 21 ${x1} 3`;
	}).join('');
	const bulbs = Array.from({ length: BULBS }, (_, i) => {
		const t = ((i % SWAG) + 0.5) / SWAG;
		return {
			x: Math.floor(i / SWAG) * SWAG * SPACE + t * SWAG * SPACE,
			y: sag(t),
			hue: HUES[i % HUES.length],
			// a few are on their way out, which is what makes the rest look haunted
			dying: i % 13 === 7,
			delay: -((i * 0.73) % 4)
		};
	});

	/* --------------------------------------------------------------- roost -- */

	// bats hang from the wire's peaks, a few of them spread across the window;
	// the peaks fall every swag, so a narrow phone may have room for fewer
	let roosts = $state<number[]>([]);
	onMount(() => {
		const swag = SWAG * SPACE;
		const peaks = [0.2, 0.52, 0.8]
			.map((at) => Math.round((innerWidth * at) / swag) * swag)
			.filter((x) => x > 16 && x < innerWidth - 16);
		roosts = [...new Set(peaks)];
	});

	/* ------------------------------------------------------------- shiver -- */

	// a shiver along the string: off again once its wave has reached the far end
	let shivering = $state(false);
	onMount(() => {
		if (part !== 'sky') return;
		let timer: ReturnType<typeof setTimeout>;
		lights.flicker = () => {
			clearTimeout(timer);
			shivering = false;
			requestAnimationFrame(() => {
				shivering = true;
				timer = setTimeout(() => (shivering = false), 1600);
			});
		};
		return () => {
			clearTimeout(timer);
			lights.flicker = () => {};
		};
	});
</script>

{#if part === 'sky'}
	<div class="lights" class:shivering aria-hidden="true">
		<svg {width} height="34" viewBox="0 0 {width} 34">
			<defs>
				<filter id="hglow" x="-150%" y="-100%" width="400%" height="300%">
					<feGaussianBlur stdDeviation="2.4" result="blur" />
					<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
				</filter>
			</defs>
			<path class="wire" d={wire} />
			{#each bulbs as bulb, i (i)}
				<g transform="translate({bulb.x} {bulb.y})">
					<rect class="socket" x="-1.8" y="0" width="3.6" height="3.6" rx="0.8" />
					<ellipse
						class="bulb"
						class:dying={bulb.dying}
						cx="0"
						cy="8"
						rx="3"
						ry="4.6"
						fill={bulb.hue}
						filter="url(#hglow)"
						style="animation-delay:{bulb.delay}s;--i:{i}"
					/>
				</g>
			{/each}
		</svg>
		{#each roosts as x (x)}
			<span class="perch" style:left="{x - 10}px"><HangingBat /></span>
		{/each}
	</div>

	<Night />
	<Bats />
{:else if part === 'land'}
	<!-- the width of the window, at the foot of the page: behind the pumpkins,
	     and a thinner fog in front of them -->
	<div class="land" aria-hidden="true">
		<!-- far off: hills, a crooked tree, a few graves and a house with one
		     window lit; then fog, the pumpkins and the cat, and a thinner fog
		     rolling over the front of it all -->
		<div class="horizon">
			<svg class="hills" viewBox="0 0 400 60" preserveAspectRatio="none">
				<path class="far" d="M0 60V40c60-10 120-2 180-8s120-6 220 4v24z" />
				<path d="M0 60V34c40-12 80-8 120-4s80-12 140-6 80 10 140-2v38z" />
			</svg>
			<svg class="tree" viewBox="0 0 40 70">
				<path
					d="M19 70c1-10 2-20-1-30-2-6-6-9-9-14 4 3 8 5 10 9 0-6-1-12 2-18-1 6 0 10 2 14 2-5 6-8 10-10-3 4-6 8-7 13 3-2 7-3 10-2-4 1-8 3-10 7-1 10 1 20 2 31z"
				/>
				<path class="twig" d="M10 26 4 22M9 25l-2-7M30 12l5-3M31 13l3 4M21 8l-1-6" />
			</svg>
			<svg class="grave g1" viewBox="0 0 14 18"><path d="M2 18V7c0-3.6 2.4-6 5-6s5 2.4 5 6v11z" /></svg>
			<svg class="grave g2" viewBox="0 0 14 18"><path d="M2 18V7c0-3.6 2.4-6 5-6s5 2.4 5 6v11z" /></svg>
			<svg class="grave g3" viewBox="0 0 14 18"><path d="M6 18V8H2V5h4V1h2v4h4v3H8v10z" /></svg>
			<svg class="house" viewBox="0 0 40 36">
				<path d="M2 36V18L12 8l10 10v18zM22 36V22h12v14zM21 22l7-8 7 8zM6 14V8h3v3z" />
				<rect class="window" x="10" y="22" width="4" height="5" />
				<rect class="window dark" x="26.5" y="25" width="3" height="4" />
			</svg>
		</div>
		<div class="fog back"><span></span></div>
	</div>
	<div class="land front" aria-hidden="true">
		<div class="fog front"><span></span></div>
	</div>
{:else if part === 'foot'}
	<Skull size={15} /><Pumpkin size={24} />
{:else}
	<div class="ground" aria-hidden="true">
		<span class="seat"><Cat /></span>
		<span class="patch">
			<Pumpkin size={46} />
			<Skull size={24} />
			<Pumpkin size={28} />
		</span>
		<span class="patch">
			<Skull size={20} />
			<Pumpkin size={36} />
		</span>
	</div>
{/if}

<style>
	/* ------------------------------------------------------------- lights -- */
	/* fixed over the top of the screen, so it stays strung while the page
	   scrolls. Its first 18px are solid page colour, which is where the
	   wire runs and what the sticky header parks under (themes.css), so nothing
	   scrolls into view behind the wire; the bulbs hang over the header below it */
	.lights {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 34px;
		background: linear-gradient(var(--bg) 0 18px, transparent 18px);
		overflow: hidden;
		pointer-events: none;
		z-index: 60;
	}
	.wire {
		fill: none;
		stroke: color-mix(in srgb, var(--ink) 30%, var(--bg));
		stroke-width: 1.2;
	}
	.socket {
		fill: color-mix(in srgb, var(--ink) 35%, var(--bg));
	}
	.bulb {
		animation: glow 4s ease-in-out infinite;
	}
	.bulb.dying {
		animation: dying 2.7s steps(1) infinite;
	}
	@keyframes glow {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.62;
		}
	}
	/* something walked past: the bulbs falter one after another along the
	   string, left to right, and come back */
	.shivering .bulb,
	.shivering .bulb.dying {
		animation: shiver 0.55s steps(1) calc(var(--i) * 14ms) both;
	}
	@keyframes shiver {
		0%,
		100% {
			opacity: 1;
		}
		18% {
			opacity: 0.12;
		}
		34% {
			opacity: 0.85;
		}
		52% {
			opacity: 0.05;
		}
		78% {
			opacity: 0.7;
		}
	}
	@keyframes dying {
		0%,
		100% {
			opacity: 0.9;
		}
		12% {
			opacity: 0.12;
		}
		16% {
			opacity: 0.8;
		}
		19% {
			opacity: 0.1;
		}
		55% {
			opacity: 0.15;
		}
		61% {
			opacity: 0.85;
		}
	}

	/* --------------------------------------------------------------- bats -- */
	/* the page is lifted one layer so the bats fly behind the cards and only
	   show in the gaps between them, never across a line of text */
	:global(:root[data-special] .wrap) {
		position: relative;
		z-index: 2;
	}

	/* the roosting bat's peak on the wire */
	.perch {
		position: absolute;
		top: 3px;
	}

	/* ------------------------------------------------------------- ground -- */
	/* on the floor of the page: the wrap keeps room for it at its foot and is at
	   least a screen tall, so a short page has its pumpkins at the bottom of the
	   window, where themes.css lights the ground */
	.ground {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 100px;
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		padding: 0 18px;
		pointer-events: none;
	}
	/* full width, at the bottom of the body, level with the foot of the page's
	   column where the pumpkins stand; clipped at the window's sides, so the
	   rolling fog never widens the page */
	.land {
		position: absolute;
		left: 0;
		right: 0;
		bottom: calc(32px + env(safe-area-inset-bottom, 0px));
		height: 100px;
		z-index: 1;
		overflow: hidden;
		pointer-events: none;
	}
	.land.front {
		z-index: 3;
		height: 60px;
	}
	.horizon {
		position: absolute;
		inset: 0;
		z-index: 0;
		fill: var(--horizon);
	}
	.horizon svg {
		position: absolute;
		bottom: 0;
	}
	.hills {
		left: 0;
		width: 100%;
		height: 46px;
		/* the land sinks into the dark rather than stopping on a line, so the
		   foot of the page is the plain night Safari carries on under its bar */
		-webkit-mask-image: linear-gradient(#000 35%, transparent);
		mask-image: linear-gradient(#000 35%, transparent);
	}
	.hills .far {
		opacity: 0.55;
	}
	.tree {
		left: 15%;
		bottom: 16px !important;
		height: 76px;
		width: 44px;
	}
	.twig {
		fill: none;
		stroke: var(--horizon);
		stroke-width: 1.4;
		stroke-linecap: round;
	}
	.grave {
		width: 11px;
		height: 14px;
	}
	.g1 {
		left: 31%;
		bottom: 20px !important;
		rotate: -7deg;
	}
	.g2 {
		left: 36%;
		bottom: 18px !important;
		width: 9px;
		height: 11px;
		rotate: 5deg;
	}
	.g3 {
		left: 61%;
		bottom: 22px !important;
		rotate: 4deg;
	}
	.house {
		right: 21%;
		bottom: 24px !important;
		width: 42px;
		height: 38px;
	}
	/* one window lit, by a candle by the look of it */
	.window {
		fill: #ffcf6a;
		filter: drop-shadow(0 0 2px rgba(255, 200, 100, 0.8));
		animation: candlelight 4.4s infinite;
	}
	.window.dark {
		fill: var(--bg);
		filter: none;
		animation: none;
		opacity: 0.6;
	}
	@keyframes candlelight {
		0%,
		100% {
			opacity: 0.9;
		}
		30% {
			opacity: 0.65;
		}
		33% {
			opacity: 0.85;
		}
		70% {
			opacity: 0.7;
		}
	}
	/* fog: soft banks in a band twice the width, sliding so it never ends */
	/* soft above and below, so the bank thins out rather than ending on a line */
	.fog {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 70px;
		-webkit-mask-image: linear-gradient(transparent, #000 40%, #000 62%, transparent);
		mask-image: linear-gradient(transparent, #000 40%, #000 62%, transparent);
	}
	.fog span {
		position: absolute;
		inset: 0 auto 0 0;
		width: 200%;
		background: radial-gradient(ellipse 22% 55% at 25% 85%, var(--fog), transparent 70%) repeat-x
			0 0 / 50% 100%;
		filter: blur(7px);
		animation: roll 90s linear infinite;
	}
	.fog.back {
		z-index: 1;
	}
	.fog.front {
		height: 48px;
		opacity: 0.55;
	}
	.fog.front span {
		background-size: 36% 100%;
		animation-duration: 55s;
		animation-direction: reverse;
	}
	@keyframes roll {
		to {
			transform: translateX(-50%);
		}
	}
	.seat {
		position: absolute;
		left: 41%;
		bottom: 2px;
		z-index: 2;
	}
	.patch {
		position: relative;
		z-index: 2;
		display: inline-flex;
		align-items: flex-end;
		gap: 6px;
		padding: 0 6px 2px;
		background: radial-gradient(60% 70% at 50% 100%, rgba(255, 150, 50, 0.16), transparent 70%);
	}

	@media (prefers-reduced-motion: reduce) {
		.bulb,
		.bulb.dying,
		.shivering .bulb,
		.shivering .bulb.dying,
		.window,
		.fog span {
			animation: none;
		}
	}
</style>
