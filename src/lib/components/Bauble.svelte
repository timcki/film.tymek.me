<script lang="ts">
	/**
	 * §3.6: a glass bauble, Christmas's lantern, drawn the same size and shape
	 * of box as the pumpkin so either sits in the same place. Lit, it is glossy
	 * and glows; unlit it is the matte red of one still in its box.
	 *
	 * `live` is for one somebody switches: while lit a glint slides across the
	 * glass now and then; lighting it sends a few sparkles off it, and putting
	 * it out lets it sway once on its loop. The one-shot effects never play for
	 * the state it was first drawn in, only for a change.
	 *
	 * `carve` paints a number on it in gold in place of its band, the way the
	 * room's ranking wears its places.
	 */
	let {
		size = 32,
		lit = true,
		live = false,
		carve
	}: { size?: number; lit?: boolean; live?: boolean; carve?: string } = $props();

	const id = $props.id();

	let lightings = $state(0);
	let snuffs = $state(0);
	let was: boolean | null = null;
	$effect(() => {
		const now = lit;
		if (was !== null && now !== was) {
			if (now) lightings += 1;
			else snuffs += 1;
		}
		was = now;
	});
</script>

<svg
	class="bauble"
	class:lit
	class:flare={live && lightings > 0}
	width={size}
	height={size * 0.9}
	viewBox="0 0 40 36"
	aria-hidden="true"
>
	<defs>
		<radialGradient id="{id}-glass" cx="0.36" cy="0.32" r="0.78">
			<stop offset="0" class="g0" />
			<stop offset="0.55" class="g1" />
			<stop offset="1" class="g2" />
		</radialGradient>
		<clipPath id="{id}-ball"><circle cx="20" cy="21.5" r="13.2" /></clipPath>
	</defs>
	{#key snuffs}
		<g class="hang" class:sway={live && snuffs > 0}>
			<circle class="loop" cx="20" cy="2.6" r="1.4" />
			<path class="cap" d="M17.2 4.4h5.6l.9 3.9-1 .5-.9-.5-.9.5-.9-.5-.9.5-.9-.5-.9.5-1-.5z" />
			<path class="ridge" d="M18.6 4.8l-.3 2.8M20 4.8v2.8M21.4 4.8l.3 2.8" />
			<circle class="ball" cx="20" cy="21.5" r="13.2" fill="url(#{id}-glass)" />
			<g clip-path="url(#{id}-ball)">
				{#if carve}
					<text class="carved" x="20" y="27">{carve}</text>
				{:else}
					<path class="band" d="M6 19.6q3.5-3 7 0t7 0 7 0 7 0M6 23.6q3.5 3 7 0t7 0 7 0 7 0" />
					<circle class="dot" cx="13" cy="21.6" r="1" />
					<circle class="dot" cx="20" cy="21.6" r="1" />
					<circle class="dot" cx="27" cy="21.6" r="1" />
				{/if}
				{#if live && lit}
					<rect class="glint" x="-6" y="6" width="5" height="34" />
				{/if}
			</g>
			<ellipse class="shine" cx="14.4" cy="15" rx="3.4" ry="2.2" transform="rotate(-32 14.4 15)" />
		</g>
	{/key}
	{#if live}
		{#key lightings}
			{#if lightings && lit}
				<g class="sparks">
					<path d="M0-2.6.6-.6 2.6 0 .6.6 0 2.6-.6.6-2.6 0-.6-.6z" style="--x:6px;--y:8px;--dx:-5px;--dy:-6px;--d:0s" />
					<path d="M0-2.6.6-.6 2.6 0 .6.6 0 2.6-.6.6-2.6 0-.6-.6z" style="--x:34px;--y:10px;--dx:5px;--dy:-7px;--d:.07s" />
					<path d="M0-2.6.6-.6 2.6 0 .6.6 0 2.6-.6.6-2.6 0-.6-.6z" style="--x:36px;--y:28px;--dx:6px;--dy:3px;--d:.14s" />
					<path d="M0-2.6.6-.6 2.6 0 .6.6 0 2.6-.6.6-2.6 0-.6-.6z" style="--x:4px;--y:30px;--dx:-6px;--dy:4px;--d:.2s" />
					<path d="M0-2.6.6-.6 2.6 0 .6.6 0 2.6-.6.6-2.6 0-.6-.6z" style="--x:20px;--y:2px;--dx:0px;--dy:-7px;--d:.1s" />
				</g>
			{/if}
		{/key}
	{/if}
</svg>

<style>
	.bauble {
		display: inline-block;
		vertical-align: middle;
		overflow: visible;
	}
	.loop {
		fill: none;
		stroke: #c9a24a;
		stroke-width: 0.8;
	}
	.cap {
		fill: #d9ae48;
	}
	.ridge {
		stroke: #9c7726;
		stroke-width: 0.6;
	}
	/* a bauble nobody has hung yet: the same red, gone flat and dark */
	.g0 {
		stop-color: #b8424a;
	}
	.g1 {
		stop-color: #7d1f27;
	}
	.g2 {
		stop-color: #4a1015;
	}
	.lit .g0 {
		stop-color: #ff8a7e;
	}
	.lit .g1 {
		stop-color: #e0283a;
	}
	.lit .g2 {
		stop-color: #8c0d1c;
	}
	.g0,
	.g1,
	.g2 {
		transition: stop-color 0.4s ease;
	}
	.ball {
		transition: filter 0.4s ease;
	}
	.lit .ball {
		filter: drop-shadow(0 0 3px rgba(255, 120, 100, 0.55));
	}
	.band {
		fill: none;
		stroke: #e6c066;
		stroke-width: 1.2;
		stroke-linecap: round;
		opacity: 0.55;
	}
	.dot {
		fill: #f3d58a;
		opacity: 0.6;
	}
	.lit .band,
	.lit .dot {
		opacity: 1;
	}
	.carved {
		font: 800 15px/1 ui-sans-serif, system-ui, sans-serif;
		text-anchor: middle;
		font-variant-numeric: tabular-nums;
		fill: #d9b25a;
		opacity: 0.7;
		transition: opacity 0.3s ease;
	}
	.lit .carved {
		fill: #ffe39a;
		opacity: 1;
		filter: drop-shadow(0 0 2px rgba(255, 220, 140, 0.8));
	}
	.shine {
		fill: #fff;
		opacity: 0.22;
		transition: opacity 0.4s ease;
	}
	.lit .shine {
		opacity: 0.75;
	}
	/* now and then light from the room slides across the glass */
	.glint {
		fill: rgba(255, 255, 255, 0.45);
		transform: skewX(-18deg);
		animation: glint 4.6s ease-in-out infinite;
	}
	@keyframes glint {
		0%,
		62% {
			translate: 0 0;
		}
		86%,
		100% {
			translate: 54px 0;
		}
	}
	/* lit: a bright breath that settles */
	.flare.lit .ball {
		animation: catch 0.55s ease-out;
	}
	@keyframes catch {
		45% {
			filter: drop-shadow(0 0 7px rgba(255, 200, 150, 1)) brightness(1.25);
		}
	}
	/* put out, it sways once on its loop, the way one does when a hand lets go */
	.hang {
		transform-box: view-box;
		transform-origin: 20px 1.5px;
	}
	.hang.sway {
		animation: sway 1.1s ease-out;
	}
	@keyframes sway {
		20% {
			rotate: 9deg;
		}
		45% {
			rotate: -6deg;
		}
		70% {
			rotate: 3deg;
		}
	}
	.sparks path {
		fill: #fff3c4;
		opacity: 0;
		translate: var(--x) var(--y);
		animation: spark 0.8s ease-out var(--d) forwards;
	}
	@keyframes spark {
		0% {
			opacity: 1;
			scale: 0.4;
		}
		40% {
			opacity: 1;
			scale: 1.2;
		}
		100% {
			opacity: 0;
			scale: 0.6;
			translate: calc(var(--x) + var(--dx)) calc(var(--y) + var(--dy));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.glint,
		.flare.lit .ball,
		.hang.sway {
			animation: none;
		}
		.sparks {
			display: none;
		}
		.g0,
		.g1,
		.g2,
		.ball,
		.shine,
		.carved {
			transition: none;
		}
	}
</style>
