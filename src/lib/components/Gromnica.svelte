<script lang="ts">
	/**
	 * §3.6: the gromnica, the folk look's lantern: the beeswax candle a Polish
	 * house kept for storms and lit at a deathbed, a red ribbon tied round it.
	 * Drawn the same size and shape of box as the pumpkin, so either sits in
	 * the same place. Unlit it is a cold stub with a black wick; lit it burns.
	 *
	 * `live` is for one somebody switches: while lit the flame gutters the way
	 * a real one does; lighting it flares it once. The flame catching and going
	 * out play for any change, but the flare never plays for the state it was
	 * first drawn in.
	 *
	 * `carve` scratches a number into the wax, the way the room's ranking wears
	 * its places.
	 */
	let {
		size = 32,
		lit = true,
		live = false,
		carve
	}: { size?: number; lit?: boolean; live?: boolean; carve?: string } = $props();

	const id = $props.id();

	let lightings = $state(0);
	let was: boolean | null = null;
	$effect(() => {
		const now = lit;
		if (was !== null && now && !was) lightings += 1;
		was = now;
	});
</script>

<svg
	class="gromnica"
	class:lit
	class:live
	width={size}
	height={size * 0.9}
	viewBox="0 0 40 36"
	aria-hidden="true"
>
	<defs>
		<linearGradient id="{id}-wax" x1="14.5" x2="25.5" y1="0" y2="0" gradientUnits="userSpaceOnUse">
			<stop offset="0" stop-color="#6e5a36" />
			<stop offset="0.3" stop-color="#d9c38c" />
			<stop offset="0.48" stop-color="#efe0b4" />
			<stop offset="0.75" stop-color="#b89c62" />
			<stop offset="1" stop-color="#5c4a2c" />
		</linearGradient>
		<radialGradient id="{id}-flame" cx="20" cy="11" r="10" fx="20" fy="12" gradientUnits="userSpaceOnUse">
			<stop offset="0" stop-color="#fffbe8" />
			<stop offset="0.3" stop-color="#ffe7a3" />
			<stop offset="0.6" stop-color="#f6a640" />
			<stop offset="1" stop-color="#c8501e" />
		</radialGradient>
		<radialGradient id="{id}-halo" cx="20" cy="8" r="13" gradientUnits="userSpaceOnUse">
			<stop offset="0" stop-color="rgba(255, 196, 110, 0.55)" />
			<stop offset="1" stop-color="rgba(255, 150, 60, 0)" />
		</radialGradient>
	</defs>
	<circle class="halo" cx="20" cy="8" r="13" fill="url(#{id}-halo)" />
	<g class="body">
		<rect x="14.5" y="15" width="11" height="21" rx="1" fill="url(#{id}-wax)" />
		<path class="rim" d="M14.5 15.2c0-1 2.5-1.6 5.5-1.6s5.5.6 5.5 1.6c-.5.7-2.7 1-5.5 1s-5-.3-5.5-1z" />
		<path class="drip" d="M15.6 15.6c.2 2.6 1.3 3.2 1.3 5.6 0 1 1.3 1 1.3 0 0-2.2-.5-3.8-.3-5.2z" />
		<path class="drip" d="M22.8 15.8c.3 1.5.9 2 .9 3.4 0 .8 1 .8 1 0 0-1.5-.3-2.4-.1-3.4z" />
		<rect class="ribbon" x="14.5" y="29" width="11" height="2.4" />
	</g>
	<path class="wick" d="M20 14.6c0-1.3.4-2.1.1-3.4" />
	<g class="flame">
		<path
			d="M20 0c3.4 4.2 5 7.2 5 9.6 0 2.8-2.2 4.4-5 4.4s-5-1.6-5-4.4c0-2.4 1.6-5.4 5-9.6z"
			fill="url(#{id}-flame)"
		/>
		<ellipse class="blue" cx="20" cy="12.6" rx="1.7" ry="1.2" />
	</g>
	{#if carve}
		<text class="carved" x="20" y="25.4">{carve}</text>
	{/if}
	{#if live}
		{#key lightings}
			{#if lightings && lit}
				<circle class="flare" cx="20" cy="8" r="9" fill="url(#{id}-halo)" />
			{/if}
		{/key}
	{/if}
</svg>

<style>
	.gromnica {
		display: inline-block;
		vertical-align: middle;
		overflow: visible;
	}
	.body {
		transition: filter 0.4s ease;
		filter: brightness(0.62) saturate(0.8);
	}
	.lit .body {
		filter: none;
	}
	.rim {
		fill: #e6d39e;
	}
	.drip {
		fill: #e9d7a6;
	}
	.ribbon {
		fill: #8e2620;
	}
	.wick {
		fill: none;
		stroke: #1d1510;
		stroke-width: 0.9;
		stroke-linecap: round;
	}
	.flame,
	.halo {
		transform-origin: 20px 14px;
		opacity: 0;
		scale: 0.2;
		transition:
			opacity 0.3s ease,
			scale 0.45s cubic-bezier(0.3, 1.4, 0.5, 1);
	}
	.lit .flame,
	.lit .halo {
		opacity: 1;
		scale: 1;
	}
	.blue {
		fill: #7aa2ff;
		opacity: 0.55;
	}
	.carved {
		font: 800 7.6px/1 ui-sans-serif, system-ui, sans-serif;
		text-anchor: middle;
		font-variant-numeric: tabular-nums;
		fill: #4a3518;
	}
	/* lit and live: the flame gutters, never twice the same way in a row */
	.live.lit .flame {
		animation: gutter 1.9s ease-in-out infinite;
	}
	.live.lit .halo {
		animation: breathe 2.6s ease-in-out infinite;
	}
	@keyframes gutter {
		0%,
		100% {
			scale: 1 1;
			rotate: 0deg;
		}
		22% {
			scale: 0.94 1.06;
			rotate: -3deg;
		}
		47% {
			scale: 1.04 0.95;
			rotate: 2deg;
		}
		71% {
			scale: 0.97 1.04;
			rotate: -1deg;
		}
	}
	@keyframes breathe {
		50% {
			opacity: 0.72;
		}
	}
	.flare {
		transform-origin: 20px 8px;
		animation: flare 0.7s ease-out forwards;
	}
	@keyframes flare {
		from {
			opacity: 1;
			scale: 0.8;
		}
		to {
			opacity: 0;
			scale: 2.2;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.live.lit .flame,
		.live.lit .halo {
			animation: none;
		}
		.flare {
			display: none;
		}
		.body,
		.flame,
		.halo {
			transition: none;
		}
	}
</style>
