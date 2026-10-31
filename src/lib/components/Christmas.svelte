<script lang="ts">
	import Bauble from './Bauble.svelte';
	import Gift from './Gift.svelte';
	import HangingBauble from './HangingBauble.svelte';
	import Lights from './Lights.svelte';
	import Snowman from './Snowman.svelte';
	import WinterSky from './WinterSky.svelte';

	/**
	 * §3.6: the drawn half of the Christmas look; the colours are themes.css's.
	 * `sky` is a string of warm lights with baubles hung off it and the winter
	 * night behind, `ground` the presents and the snowman the page ends on,
	 * `land` the snowy hills, the pines and a cottage with its fire lit, the
	 * whole window wide, and `foot` a present and a bauble under the rules tip.
	 * Only the baubles take a pointer, and with less motion asked for, nothing
	 * moves.
	 */
	let { part }: { part: 'sky' | 'ground' | 'land' | 'foot' } = $props();

	const HUES = ['#ffd27a', '#ff5a4a', '#ffd27a', '#5fd38a', '#ffd27a', '#6aa8ff'];

	/** the far tree's lights, each blinking on its own beat */
	const TWINKLE = [
		[19, 13, '#ff5a4a'],
		[23, 17, '#ffd27a'],
		[16.4, 21, '#6aa8ff'],
		[21.6, 25, '#ff5a4a'],
		[26, 28.6, '#ffd27a'],
		[14.6, 30.4, '#5fd38a'],
		[20, 33.6, '#ffd27a']
	] as const;
</script>

{#if part === 'sky'}
	<Lights hues={HUES} wave="chase">
		{#snippet perch()}<HangingBauble />{/snippet}
	</Lights>

	<WinterSky />
{:else if part === 'land'}
	<!-- the width of the window, at the foot of the page: behind the presents,
	     and a thinner drift of snow blowing in front of them -->
	<div class="land" aria-hidden="true">
		<!-- far off: snowy hills, a stand of pines, one of them dressed, and a
		     cottage with its windows lit and smoke going up; then blowing snow,
		     the presents and the snowman, and a thinner drift over it all -->
		<div class="horizon">
			<svg class="hills" viewBox="0 0 400 60" preserveAspectRatio="none">
				<path class="far" d="M0 60V38c70-12 130-4 190-9s120-4 210 6v25z" />
				<path d="M0 60V36c46-10 86-8 128-3s84-11 144-5 76 9 128-1v33z" />
			</svg>
			<svg class="pine p1" viewBox="0 0 30 46"><path d="M15 0 23 14h-4l7 12h-5l8 13H2l8-13H5l7-12H8z" /><rect x="13" y="39" width="4" height="7" /><path class="cap" d="M15 0 18.4 6c-2 1-4.8 1-6.8 0zM9.4 14.4c3.6 1.4 7.6 1.4 11.2 0l1 1.8c-4.4 1.4-8.8 1.4-13.2 0zM5.6 26.4c6 1.8 12.8 1.8 18.8 0l1.2 1.8c-7 2-14.2 2-21.2 0z" /></svg>
			<svg class="pine p2" viewBox="0 0 30 46"><path d="M15 0 23 14h-4l7 12h-5l8 13H2l8-13H5l7-12H8z" /><rect x="13" y="39" width="4" height="7" /><path class="cap" d="M15 0 18.4 6c-2 1-4.8 1-6.8 0zM9.4 14.4c3.6 1.4 7.6 1.4 11.2 0l1 1.8c-4.4 1.4-8.8 1.4-13.2 0zM5.6 26.4c6 1.8 12.8 1.8 18.8 0l1.2 1.8c-7 2-14.2 2-21.2 0z" /></svg>
			<svg class="pine dressed" viewBox="0 0 40 46">
				<path d="M20 4 28 16h-4l7 11h-5l8 12H6l8-12H9l7-11h-4z" />
				<rect x="18" y="39" width="4" height="7" />
				<path class="cap" d="M14.4 16.4c3.6 1.4 7.6 1.4 11.2 0l1 1.8c-4.4 1.4-8.8 1.4-13.2 0zM10.6 27.4c6 1.8 12.8 1.8 18.8 0l1.2 1.8c-7 2-14.2 2-21.2 0z" />
				<path class="topstar" d="M20 0l1.2 2.6 2.8.2-2.2 1.8.8 2.8L20 5.8l-2.6 1.6.8-2.8-2.2-1.8 2.8-.2z" />
				{#each TWINKLE as [x, y, hue], i (i)}
					<circle class="twinkle" cx={x} cy={y} r="1" fill={hue} style:animation-delay="{i * -0.53}s" />
				{/each}
			</svg>
			<svg class="pine p3" viewBox="0 0 30 46"><path d="M15 0 23 14h-4l7 12h-5l8 13H2l8-13H5l7-12H8z" /><rect x="13" y="39" width="4" height="7" /><path class="cap" d="M15 0 18.4 6c-2 1-4.8 1-6.8 0zM9.4 14.4c3.6 1.4 7.6 1.4 11.2 0l1 1.8c-4.4 1.4-8.8 1.4-13.2 0zM5.6 26.4c6 1.8 12.8 1.8 18.8 0l1.2 1.8c-7 2-14.2 2-21.2 0z" /></svg>
			<div class="cottage">
				<span class="smoke"><i></i><i></i><i></i></span>
				<svg viewBox="0 0 44 36">
					<path d="M4 36V18L18 7l14 11v18zM30 10h4v8h-4z" />
					<path class="cap" d="M1.6 19.4 18 6.4l16.4 13-1.6 1.4L18 9.2 3.2 20.8zM29.4 9h5.2v1.8h-5.2z" />
					<rect class="window" x="9" y="22" width="5" height="5" />
					<rect class="window" x="22" y="22" width="5" height="5" />
					<path class="pane" d="M11.5 22v5M9 24.5h5M24.5 22v5M22 24.5h5" />
					<rect class="door" x="16" y="27" width="4" height="9" />
				</svg>
			</div>
		</div>
		<div class="drift back"><span></span></div>
	</div>
	<div class="land front" aria-hidden="true">
		<div class="drift front"><span></span></div>
	</div>
{:else if part === 'foot'}
	<Bauble size={15} /><Gift size={22} />
{:else}
	<div class="ground" aria-hidden="true">
		<span class="seat"><Snowman size={34} /></span>
		<span class="patch">
			<Gift size={40} />
			<Gift size={26} paper="#2f8a57" ribbon="#ff5a4a" />
			<Gift size={30} paper="#3b6fd1" ribbon="#e8eef4" />
		</span>
		<span class="patch">
			<Gift size={24} paper="#f2c14e" ribbon="#c8283a" />
			<Gift size={36} paper="#2f8a57" ribbon="#f2c14e" />
		</span>
	</div>
{/if}

<style>
	/* ------------------------------------------------------------- ground -- */
	/* on the floor of the page: the wrap keeps room for it at its foot and is at
	   least a screen tall, so a short page has its presents at the bottom of the
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
		gap: 4px;
		padding: 0 6px 2px;
		background: radial-gradient(60% 70% at 50% 100%, rgba(255, 200, 110, 0.16), transparent 70%);
	}

	/* --------------------------------------------------------------- land -- */
	/* full width, at the bottom of the body, level with the foot of the page's
	   column where the presents stand; clipped at the window's sides, so the
	   blowing snow never widens the page */
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
	.horizon > svg,
	.cottage {
		position: absolute;
		bottom: 0;
	}
	.hills {
		left: 0;
		width: 100%;
		height: 46px;
		fill: var(--snowfield);
		-webkit-mask-image: linear-gradient(#000 35%, transparent);
		mask-image: linear-gradient(#000 35%, transparent);
	}
	.hills .far {
		opacity: 0.5;
	}
	/* snow lying on the branches and the roof, a shade off the hills */
	.cap {
		fill: var(--snowcap);
	}
	.pine {
		width: 26px;
		height: 40px;
	}
	.p1 {
		left: 9%;
		bottom: 18px !important;
	}
	.p2 {
		left: 13.5%;
		bottom: 22px !important;
		width: 18px;
		height: 28px;
	}
	.dressed {
		left: 30%;
		bottom: 16px !important;
		width: 40px;
		height: 46px;
	}
	.p3 {
		left: 64%;
		bottom: 22px !important;
		width: 20px;
		height: 31px;
	}
	.topstar {
		fill: #ffd27a;
		filter: drop-shadow(0 0 2px rgba(255, 210, 120, 0.9));
	}
	.twinkle {
		filter: drop-shadow(0 0 1.4px rgba(255, 236, 190, 0.9));
		animation: twinkle 3.2s ease-in-out infinite;
	}
	@keyframes twinkle {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
	}
	.cottage {
		right: 19%;
		bottom: 22px !important;
		width: 46px;
		height: 38px;
	}
	.cottage svg {
		display: block;
		width: 100%;
		height: 100%;
	}
	/* both windows lit, the fire behind them going */
	.window {
		fill: #ffc865;
		filter: drop-shadow(0 0 2.4px rgba(255, 190, 90, 0.85));
		animation: firelight 5s infinite;
	}
	.pane {
		stroke: var(--horizon);
		stroke-width: 0.8;
	}
	.door {
		fill: color-mix(in srgb, var(--horizon) 60%, #000);
	}
	@keyframes firelight {
		0%,
		100% {
			opacity: 0.95;
		}
		40% {
			opacity: 0.8;
		}
		45% {
			opacity: 0.92;
		}
		75% {
			opacity: 0.84;
		}
	}
	/* smoke from the chimney, three puffs rising and spreading as they go */
	.smoke {
		position: absolute;
		left: 70%;
		top: -2px;
	}
	.smoke i {
		position: absolute;
		left: 0;
		bottom: 0;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--smoke);
		filter: blur(1.4px);
		opacity: 0;
		animation: puff 4.2s ease-out infinite;
	}
	.smoke i:nth-child(2) {
		animation-delay: -1.4s;
	}
	.smoke i:nth-child(3) {
		animation-delay: -2.8s;
	}
	@keyframes puff {
		0% {
			opacity: 0;
			transform: translate(0, 0) scale(0.6);
		}
		15% {
			opacity: 0.8;
		}
		100% {
			opacity: 0;
			transform: translate(10px, -30px) scale(2.2);
		}
	}
	/* snow blowing over the ground: soft banks in a band twice the width,
	   sliding so it never ends, thinner and quicker in front */
	.drift {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 70px;
		-webkit-mask-image: linear-gradient(transparent, #000 40%, #000 62%, transparent);
		mask-image: linear-gradient(transparent, #000 40%, #000 62%, transparent);
	}
	.drift span {
		position: absolute;
		inset: 0 auto 0 0;
		width: 200%;
		background: radial-gradient(ellipse 22% 55% at 25% 85%, var(--fog), transparent 70%) repeat-x 0 0 / 50% 100%;
		filter: blur(7px);
		animation: blow 80s linear infinite;
	}
	.drift.back {
		z-index: 1;
	}
	.drift.front {
		height: 48px;
		opacity: 0.55;
	}
	.drift.front span {
		background-size: 36% 100%;
		animation-duration: 48s;
	}
	@keyframes blow {
		to {
			transform: translateX(-50%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.twinkle,
		.window,
		.smoke i,
		.drift span {
			animation: none;
		}
		.smoke {
			display: none;
		}
	}
</style>
