<script lang="ts">
	/**
	 * The everyday look's scenery, drawn the way Halloween.svelte draws its own
	 * and only while no special look is on; the colours are themes.css's. A
	 * living room at the foot of the page, seen from behind the sofa: the group
	 * on it, heads over the back, a red blanket over it, a sleeper on a beanbag,
	 * a lamp, and plants gathered round the furniture and against the walls. On
	 * a wide window the beanbag and the sofa part to either side and between
	 * them a projector throws a film onto a screen. Lamplight at night,
	 * sunlight on paper. Nothing takes a pointer; with less motion asked for,
	 * nothing moves.
	 */

	type Kind = 'snake' | 'monstera' | 'fig' | 'tree' | 'sprout' | 'pothos' | 'fern' | 'palm' | 'succulent';
	/**
	 * Where a plant stands: by the sofa or the beanbag (its left edge from that
	 * piece's middle), or against a wall (from that edge of the window). `wide`
	 * ones only come in where there is room for them
	 */
	type Plant = {
		kind: Kind;
		by: 'sofa' | 'bag' | 'left' | 'right';
		at: number;
		w: number;
		sway?: 'slow' | 'fast';
		wide?: boolean;
	};
	// two stand behind the sofa and show over its back
	const behind: Plant[] = [
		{ kind: 'palm', by: 'sofa', at: -100, w: 54, sway: 'slow' },
		{ kind: 'snake', by: 'sofa', at: 50, w: 40 }
	];
	const plants: Plant[] = [
		// round the sofa
		{ kind: 'succulent', by: 'sofa', at: -114, w: 22, wide: true },
		{ kind: 'monstera', by: 'sofa', at: 136, w: 64, sway: 'fast', wide: true },
		{ kind: 'fig', by: 'sofa', at: 200, w: 46, sway: 'slow', wide: true },
		{ kind: 'sprout', by: 'sofa', at: 226, w: 40, sway: 'slow', wide: true },
		// round the beanbag
		{ kind: 'monstera', by: 'bag', at: -100, w: 64, sway: 'slow', wide: true },
		{ kind: 'fern', by: 'bag', at: 34, w: 52, sway: 'fast', wide: true },
		// against the left wall
		{ kind: 'tree', by: 'left', at: 40, w: 48, sway: 'slow' },
		// against the right wall
		{ kind: 'fern', by: 'right', at: -12, w: 52, sway: 'slow' },
		{ kind: 'snake', by: 'sofa', at: 98, w: 40 },
		{ kind: 'sprout', by: 'right', at: 30, w: 36, sway: 'fast' },
		{ kind: 'succulent', by: 'sofa', at: 88, w: 20 },
		{ kind: 'palm', by: 'right', at: 44, w: 54, sway: 'fast', wide: true },
		{ kind: 'fig', by: 'right', at: 96, w: 46, sway: 'slow', wide: true },
		{ kind: 'succulent', by: 'right', at: 140, w: 22, wide: true }
	];
	// the tree's crown, leaf by leaf: clusters round the ends of its branches,
	// each a fan of pointed leaves at their own angles, in three greens
	const treeLeaves = [
		[33, 30, 14],
		[20, 42, 11],
		[46, 40, 11],
		[26, 22, 9],
		[41, 21, 9],
		[33, 48, 9],
		[13, 30, 7],
		[53, 28, 7]
	].flatMap(([cx, cy, n], c) =>
		Array.from({ length: n }, (_, k) => {
			const turn = (k / n) * 360 + c * 23;
			const reach = 3 + ((k * 7 + c * 3) % 5);
			const a = (turn * Math.PI) / 180;
			return {
				x: +(cx + Math.sin(a) * reach).toFixed(1),
				y: +(cy - Math.cos(a) * reach).toFixed(1),
				r: Math.round(turn),
				l: ['l1', 'l2', 'l3'][(k + c) % 3]
			};
		})
	);

	// the ivy on the projector: a mound of small leaves over its basket, and
	// strands trailing off it, each a curve (start, bend, end) with leaves set
	// along it, turned this way and that, in three greens
	const ivyMound = [
		[0.95, 9],
		[0.65, 7],
		[0.32, 4],
		[0, 1]
	].flatMap(([ring, n], c) =>
		Array.from({ length: n }, (_, k) => {
			const a = n === 1 ? Math.PI / 2 : (k / (n - 1)) * Math.PI;
			return {
				x: +(28 - Math.cos(a) * 13 * ring).toFixed(1),
				y: +(47.5 - Math.sin(a) * 10 * ring - (ring ? 0 : 9)).toFixed(1),
				r: ((k * 53 + c * 31) % 120) - 60,
				l: ['l1', 'l2', 'l3'][(k + c) % 3]
			};
		})
	);
	// off the basket's sides, clear of the box's back, two a side
	const ivyStrands = [
		[17, 48, 6, 56, 6, 82],
		[19, 50, 11, 60, 11, 71],
		[39, 48, 52, 58, 51, 102],
		[37, 50, 46, 62, 46.5, 88]
	].map(([x0, y0, cx, cy, x1, y1], s) => ({
		d: `M${x0} ${y0}Q${cx} ${cy} ${x1} ${y1}`,
		leaves: (y1 - y0 > 45
			? [0.22, 0.36, 0.5, 0.63, 0.75, 0.86, 0.95, 1]
			: y1 - y0 > 30
				? [0.25, 0.42, 0.58, 0.74, 0.88, 1]
				: y1 - y0 > 26
					? [0.3, 0.5, 0.7, 0.88, 1]
					: [0.4, 0.7, 1]
		).map((t, k) => {
			const u = 1 - t;
			return {
				x: +(u * u * x0 + 2 * u * t * cx + t * t * x1 + (k % 2 ? 1.4 : -1.4)).toFixed(1),
				y: +(u * u * y0 + 2 * u * t * cy + t * t * y1).toFixed(1),
				r: (k % 2 ? 50 : -50) + 180,
				l: ['l1', 'l2', 'l3'][(k + s) % 3]
			};
		})
	}));
	// one ivy leaf, three-lobed, drawn about its own stem
	const ivy = 'M0 0c-1.7-.3-2.8-1.4-2.5-2.6.6.1 1.1.5 1.3.9-.2-1 .3-2 1.2-2.5.9.5 1.4 1.5 1.2 2.5.2-.4.7-.8 1.3-.9.3 1.2-.8 2.3-2.5 2.6z';

	const place = (p: Plant) =>
		p.by === 'left'
			? `left:${p.at}px`
			: p.by === 'right'
				? `right:${p.at}px`
				: `left:calc(var(--${p.by}-x) + ${p.at}px)`;
</script>

{#snippet plant(p: Plant)}
	<svg
		class="thing plant {p.kind}"
		class:sway={p.sway}
		class:slow={p.sway === 'slow'}
		class:wide={p.wide}
		style="{place(p)};--w:{p.w}px"
		viewBox={{
			snake: '0 0 46 96',
			monstera: '0 0 64 100',
			fig: '0 0 46 108',
			tree: '0 0 66 124',
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
		{:else if p.kind === 'tree'}
			<!-- a small tree in a big pot: a trunk that forks, and a round crown
			     of leaves in a few greens -->
			<path class="pot" d="M20 102h26l-3 22H23z" />
			<path class="trunkline" d="M33 103c0-14-2-24 0-38M33 76c-6-6-10-12-12-20M33 70c6-6 10-12 12-20" />
			{#each treeLeaves as leaf, i (i)}
				<path
					class="leaf {leaf.l}"
					transform="translate({leaf.x} {leaf.y}) rotate({leaf.r})"
					d="M0 0C3.2-2.6 3.4-7.4 0-11-3.4 3.6-3.2 8.4 0 11z"
				/>
			{/each}
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

	<!-- the left edge of the screen is the room's wall, seen end on: the
	     window cut through it, the light it lets in across the floor (the moon
	     after dark, the sun by day), and its sill out into the room, pots on it -->
	<svg class="wall" viewBox="0 0 180 140" preserveAspectRatio="xMinYMax meet">
		<defs>
			<radialGradient id="orbglow">
				<stop offset="0.3" style="stop-color: var(--orb); stop-opacity: 0.45" />
				<stop offset="1" style="stop-color: var(--orb); stop-opacity: 0" />
			</radialGradient>
			<linearGradient id="walllight" x1="0" y1="0" x2="1" y2="0.6">
				<stop offset="0" style="stop-color: var(--window-light)" />
				<stop offset="1" style="stop-color: var(--window-light); stop-opacity: 0" />
			</linearGradient>
		</defs>
		<path class="inlight" d="M12 14V76L110 132H170Z" />
		<rect class="side" x="0" y="0" width="12" height="140" />
		<rect class="opening" x="0" y="12" width="12" height="64" />
		<path class="glass" d="M5 14v60" />
		<rect class="frame" x="0" y="10" width="13" height="4" />
		<rect class="sill" x="0" y="76" width="40" height="3.5" rx="1.2" />
		<path class="sillshade" d="M12 79.5h26" />
		<!-- in the corner on the floor, a ball lamp, softly lit -->
		<circle class="orbglow" cx="22" cy="122" r="22" />
		<!-- its foot: a little stand the ball sits in -->
		<path class="orbfoot" d="M16 132.5h12l-1.6-4.4h-8.8z" />
		<circle class="orb" cx="22" cy="121" r="7.5" />
		<!-- on the sill, two small leafy pots -->
		<path class="pot" d="M13 70h7l-1 6h-5z" />
		{#each [[16.5, 65, 0], [13.5, 67, -55], [19.5, 67, 55]] as [x, y, r] (`${x}${y}`)}
			<ellipse class="leaf l2" cx={x} cy={y} rx="2" ry="4.4" transform="rotate({r} {x} {y})" />
		{/each}
		<path class="pot" d="M21.5 70h8l-1 6h-6z" />
		<path class="vine" d="M23 71c-2 4-2 9-1 13" />
		{#each [[22.5, 76], [22.5, 81], [25.5, 64], [23.5, 67], [28, 66]] as [x, y] (`${x}${y}`)}
			<ellipse class="leaf l1" cx={x} cy={y} rx="2" ry="1.6" />
		{/each}
	</svg>

	<!-- the film, thrown on the wall: no screen, just the picture in light,
	     soft at its edges. Behind the sofa on a phone, the group's heads before
	     it; on a wide window out between the beanbag and the sofa, with the
	     beam from the projector by the sofa -->
	<div class="cinema">
		<span class="spill"></span>
		<span class="beam wide"></span>
		<svg class="screen" viewBox="0 0 128 72">
			<g class="film">
				<rect class="sky" width="128" height="72" />
				<circle class="sunset" cx="86" cy="42" r="14" />
				<path class="hills" d="M0 72V52c18-10 34-8 50 0s32 4 46-6 24-2 32 4v22z" />
				<path class="hills2" d="M0 72V60c22-6 40-2 60 2s44 0 68-6v16z" />
				<path class="rider" d="M34 54h3l1-5 3-1 2 3h3l-1 3h-2l-1 3-2-3h-3l-1 3h-2z" />
			</g>
			<rect class="flicker" width="128" height="72" />
		</svg>
		<!-- a digital projector up by the ceiling, seen from behind: its back
		     panel to us and its lens to the screen, so the beam comes out from
		     behind it. Nothing holds it up that we can see: it is mounted on the
		     wall we are looking through. On top, a woven basket of ivy, trailing -->
		<svg class="projector wide" viewBox="0 0 56 104">
			<rect class="foot" x="13" y="71.5" width="4" height="2" rx="0.6" />
			<rect class="foot" x="39" y="71.5" width="4" height="2" rx="0.6" />
			<rect class="box" x="8" y="58" width="40" height="14" rx="4" />
			<rect class="panel" x="11" y="60.5" width="34" height="9" rx="2" />
			<rect class="port" x="14" y="64" width="4" height="2.6" rx="0.5" />
			<rect class="port" x="20" y="64" width="2.6" height="2.6" rx="0.5" />
			<circle class="led" cx="15.2" cy="62" r="0.8" />
			<path class="vents" d="M29 62.5v5M31.6 62.5v5M34.2 62.5v5M36.8 62.5v5M39.4 62.5v5M42 62.5v5" />
			<!-- the strands go down behind the basket and over the box -->
			{#each ivyStrands as strand, i (i)}
				<g class="trail" style:animation-delay="{-i * 1.7}s">
					<path class="vine" d={strand.d} />
					{#each strand.leaves as leaf, k (k)}
						<path
							class="leaf {leaf.l}"
							d={ivy}
							transform="translate({leaf.x} {leaf.y}) rotate({leaf.r}) scale(1.1)"
						/>
					{/each}
				</g>
			{/each}
			{#each ivyMound as leaf, k (k)}
				<path
					class="leaf {leaf.l}"
					d={ivy}
					transform="translate({leaf.x} {leaf.y + 2.5}) rotate({leaf.r}) scale(1.5)"
				/>
			{/each}
			<path class="basket" d="M16.5 47.5h23l-2.2 9c-.3 1-1 1.5-2 1.5H20.7c-1 0-1.7-.5-2-1.5z" />
			<path
				class="weave"
				d="M17.6 51h20.8M18.6 54.4h18.8M21 48.6l.7 9M25 48.6l.3 9.4M29 48.6v9.4M33 48.6l-.3 9.4M37 48.6l-.7 9"
			/>
			<rect class="basket rim" x="16" y="46.4" width="24" height="2.4" rx="1.2" />
		</svg>
	</div>

	<!-- the floor lamp, at the sofa's end, the plants round it in front of it:
	     lit at night and off by day -->
	<svg class="thing lamp" style="left:calc(var(--sofa-x) + 92px);--w:34px" viewBox="0 0 34 113">
		<ellipse class="contact" cx="17" cy="111.5" rx="11" ry="1.6" />
		<path class="pole" d="M17 30v80" />
		<path class="base" d="M9 111.4h16" />
	</svg>

	{#each plants as p, i (i)}{@render plant(p)}{/each}

	<!-- the lamp's shade, over the leaves round it, so the lamp reads among
	     them while its foot stays behind the pots -->
	<svg class="thing lamp" style="left:calc(var(--sofa-x) + 92px);--w:34px" viewBox="0 0 34 113">
		<path class="shade" d="M7 30h20l-5-22H12z" />
	</svg>

	<!-- with bananas on, a banana plant, fruit and all -->
	<svg class="thing plant sway nana wide" style="left:70px;--w:56px" viewBox="0 0 56 112">
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

	<!-- behind the sofa, further back in the room, so their pots sit higher
	     than its foot and never show under it -->
	<div class="behind">{#each behind as p, i (i)}{@render plant(p)}{/each}</div>


	<!-- the sofa from behind: the back of it, the group's heads over it, one
	     leaning on the next, and the red blanket thrown over the top -->
	<svg class="thing sofa" style="left:calc(var(--sofa-x) - 90px);--w:180px" viewBox="0 0 180 77">
		<ellipse class="contact" cx="90" cy="76" rx="94" ry="3.2" />
		<g class="figure">
			<circle cx="52" cy="16" r="10" />
			<path d="M36 40a16 14 0 0 1 32 0z" />
			<circle cx="88" cy="15" r="10.5" transform="rotate(-14 88 34)" />
			<path d="M72 40a17 14 0 0 1 34 0z" />
			<circle cx="128" cy="18" r="9.5" />
			<path d="M113 40a15 13 0 0 1 30 0z" />
		</g>
		<!-- arms rounded on top only: the sofa meets the floor flat, all along -->
		<path class="arm" d="M0 76V46a10 10 0 0 1 10-10h4a10 10 0 0 1 10 10v30z" />
		<path class="arm" d="M156 76V46a10 10 0 0 1 10-10h4a10 10 0 0 1 10 10v30z" />
		<path class="back" d="M12 76V40c0-8 6-12 14-12h128c8 0 14 4 14 12v36z" />
		<path class="seam" d="M22 44h136" />
		<rect class="plinth" x="0" y="72" width="180" height="4.5" />
		<path
			class="blanket"
			d="M98 30c18-4 40-4 58 0 6 2 10 6 10 12v22c0 4-4 6-8 4l-6-4c-2 6-6 8-10 4-4-6-2-14-6-18-8-4-22-2-30-4-8-2-12-12-8-16z"
		/>
		<path class="blanketfold" d="M108 34c14-2 30-2 44 2M146 44c4 6 6 12 4 18" />
	</svg>

	<!-- the beanbag, and the one who has been asleep there since the trailers -->
	<div class="thing bag" style="left:calc(var(--bag-x) - 38px);--w:76px">
		<svg viewBox="0 0 76 53">
			<ellipse class="contact" cx="38" cy="50.5" rx="36" ry="2.6" />
			<path
				class="bean"
				d="M7 51C-2 41 4 22 18 16 30 10 40 18 50 14c14-4 26 8 24 22-1 10-4 15-8 15z"
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
	/* where the furniture stands: side by side on a phone, parted on a wide
	   window to make room for the screen between them */
	.room {
		--sofa-x: calc(50% + 56px);
		--bag-x: calc(50% - 78px);
		position: absolute;
		left: 0;
		right: 0;
		bottom: calc(26px + env(safe-area-inset-bottom, 0px));
		height: 140px;
		overflow: hidden;
		pointer-events: none;
		/* the room fades into the page rather than stopping on a line */
		-webkit-mask-image: linear-gradient(transparent, #000 14%, #000 95%, transparent);
		mask-image: linear-gradient(transparent, #000 14%, #000 95%, transparent);
	}
	/* everything stands on the floor */
	.thing {
		position: absolute;
		bottom: 8px;
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
		left: calc(var(--bag-x) - 70px);
		right: calc(100% - var(--sofa-x) - 120px);
		bottom: 2px;
		height: 14px;
		border-radius: 50%;
		background: var(--rug);
	}

	/* the light: a lamp's warm pool at night, a slant of sun on paper */
	.glow {
		position: absolute;
		left: calc(var(--sofa-x) - 200px);
		width: 600px;
		bottom: -40px;
		height: 220px;
		background: radial-gradient(closest-side at 50% 40%, var(--lamplight), transparent);
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

	/* the wall at the window's edge, end on, full height of the room */
	.wall {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 100%;
		width: auto;
		overflow: visible;
	}
	.wall .side {
		fill: var(--wall);
	}
	.wall .opening {
		fill: var(--window-sky);
	}
	.wall .glass {
		fill: none;
		stroke: var(--window-glass);
		stroke-width: 1.4;
	}
	.wall .frame,
	.wall .sill {
		fill: var(--window-frame);
	}
	.wall .sillshade {
		stroke: rgba(0, 0, 0, 0.25);
		stroke-width: 1.5;
	}
	.wall .orb {
		fill: var(--orb);
		filter: drop-shadow(0 0 6px var(--orb));
	}
	.wall .orbfoot {
		fill: var(--orb-foot);
	}
	.wall .orbglow {
		fill: url(#orbglow);
		animation: breathe 5s ease-in-out infinite alternate;
	}
	.wall .inlight {
		fill: url(#walllight);
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
	.trunkline {
		fill: none;
		stroke: var(--wood);
		stroke-width: 3;
		stroke-linecap: round;
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
	/* the banana plant only comes in where the room is wide (below) */
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
	.lamp .base {
		fill: none;
		stroke: var(--wood);
		stroke-width: 3;
		stroke-linecap: round;
	}

	/* the sofa, and the people on it in silhouette */
	.back,
	.arm {
		fill: var(--sofa);
	}

	.behind {
		position: absolute;
		inset: 0 0 12px;
	}
	.plinth {
		fill: rgba(0, 0, 0, 0.22);
	}
	.seam {
		fill: none;
		stroke: var(--sofa-lit);
		stroke-width: 1.4;
		stroke-linecap: round;
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
	/* what stands on the floor sits on a soft shadow of its own */
	.contact {
		fill: rgba(0, 0, 0, 0.35);
		filter: blur(1.2px);
	}
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

	/* the wide room: the pieces part, and the screen comes in between */
	.wide {
		display: none;
	}
	@media (min-width: 760px) {
		.room {
			--sofa-x: 78%;
			--bag-x: 21%;
			/* a head taller, for the ivy on the projector to clear the fade at
			   the top; everything stands on the floor, so nothing else moves */
			height: 172px;
		}
		.wide {
			display: block;
		}
		.nana {
			display: none;
		}
		:global(:root[data-banana]) .nana {
			display: block;
		}
	}
	.cinema {
		position: absolute;
		inset: 0;
	}
	/* the picture on the wall: light, not a thing, so its edges fade into the
	   wall and it glows a little onto it. On a phone it is over the sofa, the
	   heads in front of it */
	.screen {
		position: absolute;
		left: calc(var(--sofa-x) - 86px);
		bottom: 30px;
		width: 172px;
		opacity: var(--projection);
		/* a rectangle of light with feathered edges, as a projection lands */
		-webkit-mask-image:
			linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent),
			linear-gradient(transparent, #000 7%, #000 93%, transparent);
		-webkit-mask-composite: source-in;
		mask-image:
			linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent),
			linear-gradient(transparent, #000 7%, #000 93%, transparent);
		mask-composite: intersect;
	}
	/* the light the picture spills onto the wall round it */
	.spill {
		position: absolute;
		left: calc(var(--sofa-x) - 116px);
		bottom: 10px;
		width: 232px;
		height: 136px;
		background: radial-gradient(closest-side, var(--spill), transparent);
	}
	@media (min-width: 760px) {
		.spill {
			left: calc(43% - 125px);
			width: 250px;
			height: 146px;
		}
	}
	/* on a wide window it is left of the middle, so the beam has a room's
	   width to cross from the projector by the sofa */
	@media (min-width: 760px) {
		.screen {
			left: calc(43% - 95px);
			bottom: 34px;
			width: 190px;
		}
	}
	.sky {
		fill: var(--film-sky);
	}
	.sunset {
		fill: var(--film-sun);
	}
	.hills {
		fill: var(--film-hill);
	}
	.hills2 {
		fill: var(--film-hill2);
	}
	.rider {
		fill: var(--film-hill2);
	}
	/* the film runs: its light flickers, and the rider crosses the hills */
	.flicker {
		fill: #fff;
		opacity: 0;
		animation: flicker 3.2s steps(1) infinite;
	}
	@keyframes flicker {
		0%,
		100% {
			opacity: 0;
		}
		8% {
			opacity: 0.06;
		}
		12% {
			opacity: 0;
		}
		47% {
			opacity: 0.04;
		}
		51% {
			opacity: 0;
		}
	}
	.rider {
		animation: ride 14s linear infinite;
	}
	@keyframes ride {
		from {
			transform: translateX(-30px);
		}
		to {
			transform: translateX(80px);
		}
	}
	/* its middle 105px up, over the heads, level with the top of the picture,
	   and 119px left of the sofa's middle, where the beam starts from */
	.projector {
		position: absolute;
		left: calc(var(--sofa-x) - 147px);
		bottom: 66px;
		width: 56px;
		overflow: visible;
	}
	.panel {
		fill: var(--projector-dark);
		opacity: 0.16;
	}
	.port,
	.foot {
		fill: var(--projector-dark);
	}
	.basket {
		fill: var(--basket);
	}
	.rim {
		fill: var(--basket-weave);
	}
	.weave {
		fill: none;
		stroke: var(--basket-weave);
		stroke-width: 0.6;
		stroke-linecap: round;
	}
	.vine {
		fill: none;
		stroke: var(--leaf3);
		stroke-width: 0.7;
		stroke-linecap: round;
	}
	/* the strands hang from the basket's lip and stir a little */
	.trail {
		transform-box: view-box;
		transform-origin: 28px 48px;
		animation: trail 8s ease-in-out infinite alternate;
	}
	@keyframes trail {
		from {
			transform: rotate(-1.6deg);
		}
		to {
			transform: rotate(1.6deg);
		}
	}
	/* white, so it is given an edge to keep it off a pale wall */
	.box {
		fill: var(--projector);
		stroke: var(--projector-dark);
		stroke-width: 0.8;
	}
	.vents {
		fill: none;
		stroke: var(--projector-dark);
		stroke-width: 1.2;
		stroke-linecap: round;
	}
	.led {
		fill: #7cf08a;
	}
	/* the beam, from behind the projector (its right end, up high, hidden by
	   the box) out to the screen's face, widening, a little haze in it */
	.beam {
		position: absolute;
		left: calc(43% + 88px);
		right: calc(100% - var(--sofa-x) + 119px);
		bottom: 34px;
		height: 107px;
		background: linear-gradient(90deg, var(--beam-far), var(--beam-near));
		clip-path: polygon(0 6%, 100% 30%, 100% 36%, 0 94%);
		filter: blur(1.5px);
		animation: beam 3.2s steps(1) infinite;
	}
	@keyframes beam {
		0%,
		100% {
			opacity: 1;
		}
		8% {
			opacity: 0.8;
		}
		12% {
			opacity: 1;
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
		.trail,
		.flicker,
		.rider,
		.beam,
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
