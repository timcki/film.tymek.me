<script module lang="ts">
	/**
	 * Two counts crossed, a face where each person lands. Both axes are small
	 * counts, so people do share a point; those fan out around it rather than
	 * sitting on top of each other, and the line under the plot says exactly
	 * where the face being pointed at, or pressed, is.
	 */
	export type Dot = {
		key: string;
		name: string;
		colour: string;
		avatar: string | null;
		xp: number;
		x: number;
		y: number;
	};
</script>

<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';

	let {
		dots,
		xMax,
		yMax,
		xTitle,
		yTitle,
		lit = null,
		onpick = null,
		onface = null
	}: {
		dots: Dot[];
		xMax: number;
		yMax: number;
		xTitle: string;
		yTitle: string;
		lit?: string | null;
		onpick?: ((key: string, el: EventTarget | null) => void) | null;
		/** a mouse pointing at a face, which is worth a bigger picture */
		onface?: ((key: string, el: EventTarget | null, on: boolean) => void) | null;
	} = $props();

	const SIZE = 22;

	/** whole numbers only, at most six of them, always including both ends */
	function ticks(max: number): number[] {
		const step = Math.max(1, Math.ceil(max / 5));
		const out: number[] = [];
		for (let at = 0; at < max; at += step) out.push(at);
		return [...out, max];
	}

	const xTicks = $derived(ticks(Math.max(1, xMax)));
	const yTicks = $derived(ticks(Math.max(1, yMax)));
	const left = (x: number) => (x / Math.max(1, xMax)) * 100;
	const bottom = (y: number) => (y / Math.max(1, yMax)) * 100;

	/** everybody on one point, in a ring around it whose size grows with the crowd */
	const placed = $derived.by(() => {
		const at = new Map<string, Dot[]>();
		for (const dot of dots) {
			const key = `${dot.x}:${dot.y}`;
			at.set(key, [...(at.get(key) ?? []), dot]);
		}
		return [...at.values()].flatMap((group) =>
			group.map((dot, i) => {
				const radius = group.length > 1 ? SIZE * 0.45 + group.length * 1.6 : 0;
				const angle = (2 * Math.PI * i) / group.length - Math.PI / 2;
				return { dot, dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius };
			})
		);
	});

	let hovered = $state<string | null>(null);
	const shown = $derived(dots.find((dot) => dot.key === (hovered ?? lit)) ?? null);
</script>

<div class="scatter" class:picking={lit !== null}>
	<div class="ytitle">{yTitle}</div>
	<div class="frame">
		<div class="yaxis">
			{#each yTicks as tick (tick)}
				<span style:bottom="{bottom(tick)}%">{tick}</span>
			{/each}
		</div>
		<div class="plot">
			{#each yTicks as tick (tick)}
				<i class="hline" style:bottom="{bottom(tick)}%"></i>
			{/each}
			{#each xTicks as tick (tick)}
				<i class="vline" style:left="{left(tick)}%"></i>
			{/each}
			{#each placed as { dot, dx, dy } (dot.key)}
				<button
					class="dot"
					class:lit={lit === dot.key}
					style:left="calc({left(dot.x)}% + {dx}px)"
					style:bottom="calc({bottom(dot.y)}% - {dy}px)"
					aria-label="{dot.name}: {xTitle} {dot.x}, {yTitle} {dot.y}"
					onclick={(event) => onpick?.(dot.key, event.currentTarget)}
					onpointerenter={(event) => {
						if (event.pointerType !== 'mouse') return;
						hovered = dot.key;
						onface?.(dot.key, event.currentTarget, true);
					}}
					onpointerleave={(event) => {
						if (event.pointerType !== 'mouse') return;
						if (hovered === dot.key) hovered = null;
						onface?.(dot.key, event.currentTarget, false);
					}}
				>
					<Avatar
						name={dot.name}
						colour={dot.colour}
						avatar={dot.avatar}
						xp={dot.xp}
						size={SIZE}
						font={9}
						titled={false}
						slim
					/>
				</button>
			{/each}
		</div>
		<div class="xaxis">
			{#each xTicks as tick (tick)}
				<span style:left="{left(tick)}%">{tick}</span>
			{/each}
		</div>
	</div>
	<div class="xtitle">{xTitle}</div>
	<p class="readout" aria-live="polite">
		{#if shown}
			<b>{shown.name}</b> · {xTitle}: {shown.x} / {xMax} · {yTitle}: {shown.y} / {yMax}
		{:else}
			&nbsp;
		{/if}
	</p>
</div>

<style>
	.scatter {
		margin-top: 6px;
	}
	/* the gutter for the counts up the side, the plot, and the counts along the foot */
	.frame {
		display: grid;
		grid-template-columns: 26px 1fr;
		grid-template-rows: 220px 18px;
		padding: 12px 14px 0 0;
	}
	.yaxis,
	.xaxis {
		position: relative;
		font-size: 10px;
		color: var(--dimmer);
	}
	.yaxis span {
		position: absolute;
		right: 6px;
		transform: translateY(50%);
	}
	.xaxis {
		grid-column: 2;
	}
	.xaxis span {
		position: absolute;
		top: 4px;
		transform: translateX(-50%);
	}
	.plot {
		position: relative;
		background: color-mix(in srgb, var(--sunk) 45%, transparent);
		border-radius: 8px;
	}
	.hline,
	.vline {
		position: absolute;
		background: var(--line);
	}
	.hline {
		left: 0;
		right: 0;
		height: 1px;
	}
	.vline {
		top: 0;
		bottom: 0;
		width: 1px;
	}
	.dot {
		position: absolute;
		transform: translate(-50%, 50%);
		border: 0;
		padding: 0;
		background: none;
		line-height: 0;
		border-radius: 99px;
		cursor: pointer;
		transition: opacity 0.15s;
	}
	.dot:hover,
	.dot:focus-visible {
		z-index: 2;
		box-shadow: 0 0 0 2px var(--line3);
	}
	.scatter.picking .dot:not(.lit) {
		opacity: 0.3;
	}
	/* the face you pressed keeps its own halo, so it can be found in a crowd */
	.dot.lit {
		z-index: 1;
		box-shadow: 0 0 0 2px var(--accent);
	}
	.ytitle,
	.xtitle {
		font-size: 10.5px;
		color: var(--dim);
	}
	.xtitle {
		margin-top: 4px;
		text-align: right;
	}
	.readout {
		margin: 8px 0 0;
		min-height: 1.4em;
		font-size: 12px;
		color: var(--ink2);
	}
</style>
