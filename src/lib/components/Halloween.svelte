<script lang="ts">
	import Pumpkin from './Pumpkin.svelte';
	import Skull from './Skull.svelte';
	import Bats from './Bats.svelte';
	import HangingBat from './HangingBat.svelte';
	import Night from './Night.svelte';
	import Cat from './Cat.svelte';
	import Lights from './Lights.svelte';

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

	const HUES = ['#ff8a1f', '#a46bff', '#8fef5a', '#ff8a1f', '#ff5a3c'];
</script>

{#if part === 'sky'}
	<Lights hues={HUES} dying>
		{#snippet perch()}<HangingBat />{/snippet}
	</Lights>

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
		.window,
		.fog span {
			animation: none;
		}
	}
</style>
