<script lang="ts">
	/**
	 * The everyday look's scenery, drawn the way Halloween.svelte draws its own
	 * and only while no special look is on; the colours are themes.css's. A
	 * living room at the foot of the page, where film night actually happens:
	 * a blue sofa with the group on it, a red beanbag with somebody asleep, a
	 * floor lamp, and plants, more of them the wider the window. Lamplight at
	 * night, sunlight on paper. Everything is placed from the middle outwards,
	 * so a phone shows the sofa and its neighbours and a wide screen the whole
	 * jungle. Nothing takes a pointer; with less motion asked for, nothing moves.
	 */

	// the jungle, placed from the middle of the window outwards: a phone shows
	// the nearest few, a wide screen all of them. Each is a kind of plant drawn
	// below, where it stands (its left edge, from the middle), how wide, and
	// whether it sways. Two stand behind the sofa and peek over its back
	type Kind = 'snake' | 'monstera' | 'fig' | 'cactus' | 'sprout' | 'pothos' | 'fern' | 'palm' | 'succulent';
	type Plant = { kind: Kind; at: number; w: number; sway?: 'slow' | 'fast' };
	const behind: Plant[] = [
		{ kind: 'palm', at: -118, w: 54, sway: 'slow' },
		{ kind: 'snake', at: 64, w: 40 }
	];
	const plants: Plant[] = [
		// left of the beanbag
		{ kind: 'monstera', at: -262, w: 64, sway: 'fast' },
		{ kind: 'succulent', at: -200, w: 22 },
		{ kind: 'pothos', at: -318, w: 40, sway: 'slow' },
		{ kind: 'fern', at: -378, w: 52, sway: 'fast' },
		{ kind: 'cactus', at: -420, w: 28 },
		{ kind: 'fig', at: -476, w: 46, sway: 'slow' },
		{ kind: 'snake', at: -530, w: 46 },
		{ kind: 'sprout', at: -570, w: 40, sway: 'fast' },
		{ kind: 'monstera', at: -650, w: 64, sway: 'slow' },
		{ kind: 'succulent', at: -690, w: 22 },
		// right of the lamp
		{ kind: 'fern', at: 136, w: 52, sway: 'slow' },
		{ kind: 'fig', at: 184, w: 46, sway: 'fast' },
		{ kind: 'cactus', at: 234, w: 28 },
		{ kind: 'snake', at: 262, w: 46 },
		{ kind: 'pothos', at: 310, w: 40, sway: 'slow' },
		{ kind: 'monstera', at: 352, w: 64, sway: 'fast' },
		{ kind: 'succulent', at: 418, w: 22 },
		{ kind: 'sprout', at: 444, w: 40, sway: 'slow' },
		{ kind: 'palm', at: 486, w: 54, sway: 'fast' },
		{ kind: 'cactus', at: 546, w: 28 },
		{ kind: 'fig', at: 580, w: 46, sway: 'slow' },
		{ kind: 'fern', at: 632, w: 52, sway: 'fast' }
	];
</script>

{#snippet plant(p: Plant)}
	<svg
		class="thing plant {p.kind}"
		class:sway={p.sway}
		class:slow={p.sway === 'slow'}
		style="--at:{p.at}px;--w:{p.w}px"
		viewBox={{
			snake: '0 0 46 96',
			monstera: '0 0 64 100',
			fig: '0 0 46 108',
			cactus: '0 0 28 64',
			sprout: '0 0 40 70',
			pothos: '0 0 40 92',
			fern: '0 0 52 70',
			palm: '0 0 54 110',
			succulent: '0 0 22 30'
		}[p.kind]}
	>
		{#if p.kind === 'snake'}
			<path class="pot" d="M13 78h20l-2 18H15z" />
			<path class="leaf l3" d="M23 80C21 60 22 40 23 8c2 32 2 52 0 72z" />
			<path class="leaf l1" d="M22 80C14 62 8 46 6 22c8 20 12 38 16 58z" />
			<path class="leaf l2" d="M24 80c8-18 13-34 16-56-8 20-12 36-16 56z" />
			<path class="leaf l1" d="M22 80c-4-12-10-22-18-30 10 6 16 16 18 30z" />
			<path class="leaf l2" d="M24 80c4-12 10-22 18-28-10 6-16 14-18 28z" />
		{:else if p.kind === 'monstera'}
			<path class="pot" d="M20 80h24l-3 20H23z" />
			<path class="stem" d="M32 80c-2-14-8-26-16-36M32 80c0-18 2-32 6-48M32 80c4-12 12-22 22-28" />
			<path class="leaf l2" d="M16 46c-12-2-16-14-10-22 8-6 20 0 20 12-2 6-6 10-10 10zm-6-14 6 4m-8 2 7 1" />
			<path class="leaf l1" d="M38 34c-4-10 0-24 12-26 10 2 12 16 4 24-6 4-12 4-16 2zm6-12 6-6m-4 12 8-2" />
			<path class="leaf l3" d="M54 52c8-6 10-18 2-22-8-2-14 6-12 14 2 6 6 8 10 8zm-4-10 4-4" />
		{:else if p.kind === 'fig'}
			<path class="pot" d="M14 90h18l-2 18H16z" />
			<path class="stem" d="M23 90V24" />
			{#each [[23, 16, 0], [14, 28, -40], [32, 30, 40], [12, 44, -55], [34, 46, 50], [16, 60, -45], [30, 62, 45], [20, 74, -30]] as [x, y, r] (`${x}${y}`)}
				<ellipse class="leaf {y % 3 ? 'l1' : 'l2'}" cx={x} cy={y} rx="7" ry="10" transform="rotate({r} {x} {y})" />
			{/each}
		{:else if p.kind === 'cactus'}
			<path class="pot" d="M6 48h16l-2 16H8z" />
			<path class="leaf l3" d="M10 50V18a4 4 0 0 1 8 0v32z" />
			<path class="leaf l3" d="M10 36H6v-8a2.5 2.5 0 0 1 5 0" />
			<path class="leaf l3" d="M18 30h4v-8a2.5 2.5 0 0 0-5 0" />
		{:else if p.kind === 'sprout'}
			<path class="pot" d="M12 52h16l-2 18H14z" />
			<path class="leaf l1" d="M20 54c-8-6-16-6-18-14 8 2 14 6 18 14z" />
			<path class="leaf l2" d="M20 54c8-8 14-10 18-18-8 2-14 8-18 18z" />
			<path class="leaf l3" d="M20 54c-2-10 0-20 4-30-6 8-8 18-4 30z" />
		{:else if p.kind === 'pothos'}
			<path class="stand" d="M8 92 12 56h16l4 36M12 70h16" />
			<path class="pot" d="M10 44h20l-2 12H12z" />
			<path class="vine" d="M12 46c-6 10-6 22-2 34M28 46c6 8 8 18 4 28" />
			{#each [[10, 52], [8, 62], [9, 72], [10, 80], [30, 52], [33, 62], [32, 72], [16, 40], [24, 38], [20, 36]] as [x, y] (`${x}${y}`)}
				<path class="leaf l1" d="M{x} {y + 4}c-4-2-5-6-2-8 1 0 2 1 2 2 0-1 1-2 2-2 3 2 2 6-2 8z" />
			{/each}
		{:else if p.kind === 'fern'}
			<path class="pot" d="M17 54h18l-2 16H19z" />
			{#each [-70, -45, -20, 0, 20, 45, 70] as turn, i (turn)}
				<path
					class="leaf {i % 2 ? 'l1' : 'l2'}"
					transform="rotate({turn} 26 54)"
					d="M26 54c-3-14-2-28 0-40 2 12 3 26 0 40z"
				/>
			{/each}
		{:else if p.kind === 'palm'}
			<path class="pot" d="M17 92h20l-2 18H19z" />
			<path class="stem" d="M27 92c0-20-4-36-2-52M27 92c2-16 8-28 14-40" />
			<path class="leaf l2" d="M25 40c-8-12-18-16-24-12 8 0 16 6 24 12z" />
			<path class="leaf l1" d="M25 40c-2-14 4-26 12-32-4 10-8 20-12 32z" />
			<path class="leaf l3" d="M25 42c-10-4-18 0-22 8 6-4 14-6 22-8z" />
			<path class="leaf l2" d="M41 52c4-10 12-14 13-24-6 6-10 14-13 24z" />
			<path class="leaf l1" d="M41 52c-6-8-14-10-20-8 8 2 14 4 20 8z" />
		{:else}
			<path class="pot" d="M3 18h16l-2 12H5z" />
			{#each [[11, 8, 0], [6, 12, -50], [16, 12, 50], [8, 16, -80], [14, 16, 80]] as [x, y, r] (`${x}${y}`)}
				<ellipse class="leaf l2" cx={x} cy={y} rx="3" ry="6" transform="rotate({r} {x} {y})" />
			{/each}
		{/if}
	</svg>
{/snippet}

<div class="room" aria-hidden="true">
	<span class="glow"></span>
	<span class="sun"></span>
	<span class="rug"></span>

	{#each plants as p, i (i)}{@render plant(p)}{/each}

	<!-- with bananas on, a banana plant, fruit and all -->
	<svg class="thing plant sway nana" style="--at:-610px;--w:56px" viewBox="0 0 56 112">
		<path class="pot" d="M18 94h20l-2 18H20z" />
		<path class="trunk" d="M26 94V40h4v54z" />
		<path class="leaf l2" d="M28 42C18 30 8 28 0 34c10-2 18 2 28 8z" />
		<path class="leaf l1" d="M28 40c8-14 18-18 28-14-10 0-18 6-28 14z" />
		<path class="leaf l3" d="M28 42C26 26 30 12 38 4c-4 10-6 22-10 38z" />
		<path class="leaf l2" d="M28 44C20 38 10 40 4 48c8-4 16-6 24-4z" />
		<g class="fruit">
			<path d="M30 48c4 2 6 6 5 10-1-3-3-6-6-8zM29 50c2 3 2 7 0 10 0-3 0-6-2-8zM31 47c4 0 7 3 8 6-2-2-5-4-8-4z" />
		</g>
	</svg>

	<!-- two peek over the back of the sofa -->
	{#each behind as p, i (i)}{@render plant(p)}{/each}

	<!-- the floor lamp, on the sofa's right: lit at night and off by day -->
	<svg class="thing lamp" style="--at:100px;--w:34px" viewBox="0 0 34 112">
		<path class="pole" d="M17 30v76M9 108h16" />
		<path class="shade" d="M7 30h20l-5-22H12z" />
	</svg>

	<!-- the sofa, sat right on the floor, the group on it and a red blanket
	     thrown over its right end -->
	<svg class="thing sofa" style="--at:-95px;--w:190px" viewBox="0 0 190 84">
		<!-- three of them, behind the cushions, one leaning on the next -->
		<g class="figure">
			<circle cx="58" cy="20" r="10" />
			<path d="M42 58V40a16 14 0 0 1 32 0v18z" />
			<circle cx="97" cy="18" r="10.5" transform="rotate(-12 97 40)" />
			<path d="M80 58V38a17 14 0 0 1 34 0v20z" />
			<circle cx="136" cy="22" r="9.5" />
			<path d="M121 58V42a15 13 0 0 1 30 0v16z" />
		</g>
		<rect class="back" x="14" y="34" width="162" height="40" rx="12" />
		<rect class="cushion" x="22" y="40" width="48" height="22" rx="8" />
		<rect class="cushion" x="120" y="40" width="48" height="22" rx="8" />
		<rect class="seat" x="10" y="60" width="170" height="24" rx="7" />
		<rect class="arm" x="2" y="46" width="22" height="38" rx="10" />
		<rect class="arm" x="166" y="46" width="22" height="38" rx="10" />
		<!-- the blanket: over the back, down the cushion and off the arm -->
		<path
			class="blanket"
			d="M118 36c14-4 34-4 50 0 8 2 12 8 12 16l2 22c1 6-3 9-8 8l-8-2c2-8 0-16-4-20-8-4-20-4-30-2-6 1-12-1-14-6-3-8 0-14 0-16z"
		/>
		<path class="blanketfold" d="M126 44c10-2 24-2 36 2M150 60c6 2 10 6 12 12" />
	</svg>

	<!-- the beanbag, on the sofa's left, and the one who has been asleep there
	     since the trailers -->
	<div class="thing bag" style="--at:-178px;--w:76px">
		<svg viewBox="0 0 76 54">
			<path
				class="bean"
				d="M6 50C-2 40 4 22 18 16 30 10 40 18 50 14c14-4 26 8 24 22-1 10-4 14-8 14z"
			/>
			<path class="beanfold" d="M24 30c6 6 18 8 30 4" />
			<g class="figure">
				<circle cx="22" cy="16" r="8" />
				<path d="M28 22c10-4 22-2 30 6 4 4 2 8-4 8-10-2-18-4-26-6-4-2-4-6 0-8z" />
			</g>
		</svg>
		<span class="zzz"><i>z</i><i>z</i><i>Z</i></span>
	</div>
</div>

<style>
	/* the width of the window at the foot of the body: the wrap keeps room for
	   it and is at least a screen tall (themes.css), so a short page still has
	   the room at the bottom of the window */
	.room {
		position: absolute;
		left: 0;
		right: 0;
		bottom: calc(26px + env(safe-area-inset-bottom, 0px));
		height: 118px;
		overflow: hidden;
		pointer-events: none;
		/* the room fades into the page rather than stopping on a line */
		-webkit-mask-image: linear-gradient(transparent, #000 14%, #000 86%, transparent);
		mask-image: linear-gradient(transparent, #000 14%, #000 86%, transparent);
	}
	/* everything stands on the floor, placed from the middle of the window */
	.thing {
		position: absolute;
		bottom: 8px;
		left: calc(50% + var(--at));
		width: var(--w);
		height: auto;
		overflow: visible;
	}
	.thing svg {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.rug {
		position: absolute;
		left: calc(50% - 200px);
		width: 340px;
		bottom: 2px;
		height: 14px;
		border-radius: 50%;
		background: var(--rug);
	}

	/* the light: a lamp's warm pool at night, a slant of sun on paper */
	.glow {
		position: absolute;
		left: calc(50% - 300px);
		width: 600px;
		bottom: -40px;
		height: 220px;
		background: radial-gradient(closest-side at 70% 40%, var(--lamplight), transparent);
		animation: breathe 6s ease-in-out infinite alternate;
	}
	@keyframes breathe {
		to {
			opacity: 0.75;
		}
	}
	.sun {
		position: absolute;
		inset: -40px -10% 0;
		/* soft shafts, no edges: each one fades in and out across its width */
		background: repeating-linear-gradient(
			115deg,
			transparent 0,
			var(--sunlight) 60px,
			var(--sunlight) 90px,
			transparent 150px,
			transparent 240px
		);
		filter: blur(6px);
		display: none;
	}

	/* the plants: a few greens, a terracotta pot, and a slow sway from the pot */
	.pot {
		fill: var(--pot);
	}
	.stand {
		fill: none;
		stroke: var(--wood);
		stroke-width: 2.5;
		stroke-linecap: round;
	}
	.stem,
	.vine {
		fill: none;
		stroke: var(--leaf3);
		stroke-width: 2;
		stroke-linecap: round;
	}
	.trunk {
		fill: var(--leaf3);
	}
	.leaf {
		stroke: var(--leafline);
		stroke-width: 0.8;
	}
	.l1 {
		fill: var(--leaf1);
	}
	.l2 {
		fill: var(--leaf2);
	}
	.l3 {
		fill: var(--leaf3);
	}
	.fruit {
		fill: #ffd43b;
		stroke: #5a2a10;
		stroke-width: 0.6;
	}
	.nana {
		display: none;
	}
	:global(:root[data-banana]) .nana {
		display: block;
	}
	.sway {
		transform-origin: 50% 100%;
		animation: sway 7s ease-in-out infinite alternate;
	}
	.sway.slow {
		animation-duration: 9s;
		animation-delay: -3s;
	}
	.sway:nth-of-type(3n) {
		animation-delay: -5s;
	}
	@keyframes sway {
		from {
			transform: rotate(-1.4deg);
		}
		to {
			transform: rotate(1.4deg);
		}
	}

	/* the lamp */
	.pole {
		fill: none;
		stroke: var(--wood);
		stroke-width: 2.4;
		stroke-linecap: round;
	}
	.shade {
		fill: var(--shade);
	}

	/* the sofa, and the people on it in silhouette */
	.back,
	.arm {
		fill: var(--sofa);
	}
	.seat,
	.cushion {
		fill: var(--sofa-lit);
	}
	.blanket {
		fill: var(--blanket);
	}
	.blanketfold {
		fill: none;
		stroke: var(--blanket-fold);
		stroke-width: 1.4;
		stroke-linecap: round;
	}
	.figure {
		fill: var(--figure);
	}

	/* the beanbag and its sleeper */
	.bean {
		fill: var(--beanbag);
	}
	.beanfold {
		fill: none;
		stroke: var(--beanbag-fold);
		stroke-width: 1.5;
		stroke-linecap: round;
	}
	.zzz {
		position: absolute;
		left: 30%;
		top: -6px;
	}
	.zzz i {
		position: absolute;
		left: 0;
		top: 0;
		font: italic 700 11px/1 ui-sans-serif, sans-serif;
		color: var(--zzz);
		opacity: 0;
		animation: zzz 4.5s ease-in infinite;
	}
	.zzz i:nth-child(2) {
		animation-delay: 1.5s;
		font-size: 13px;
	}
	.zzz i:nth-child(3) {
		animation-delay: 3s;
		font-size: 15px;
	}
	/* each z drifts up and off to the side, growing, and fades */
	@keyframes zzz {
		0% {
			opacity: 0;
			transform: translate(0, 0) scale(0.6);
		}
		20% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: translate(18px, -34px) scale(1.1);
		}
	}

	/* by day the lamp is off and the sun comes in */
	:global(:root[data-theme='light']) .glow {
		display: none;
	}
	:global(:root[data-theme='light']) .sun {
		display: block;
	}

	@media (prefers-reduced-motion: reduce) {
		.glow,
		.sway,
		.zzz i {
			animation: none;
		}
		.zzz i {
			opacity: 0.8;
		}
		.zzz i:nth-child(2) {
			transform: translate(8px, -12px);
		}
		.zzz i:nth-child(3) {
			transform: translate(16px, -24px);
		}
	}
</style>
