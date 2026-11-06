<script module lang="ts">
	/**
	 * A few shares, round by round, on one 0 to 100% scale. Each is a fraction of
	 * something different, which is why they are kept as percentages: the point
	 * is how each moves, and whether they move together.
	 */
	export type Line = {
		key: string;
		label: string;
		colour: string;
		/** one per round, oldest first; null where the round has nothing to say */
		values: (number | null)[];
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		lines,
		labels,
		detail = null
	}: {
		lines: Line[];
		labels: string[];
		/** what the line under the plot says about the round being pointed at or pressed */
		detail?: Snippet<[number]> | null;
	} = $props();

	let hovered = $state<number | null>(null);
	let pressed = $state<number | null>(null);
	const shown = $derived(hovered ?? pressed);

	// drawn at the pixel size it is shown at, like the stats screen's trends
	let W = $state(340);
	const H = 150;
	const LEFT = 34;
	const RIGHT = 8;
	const TOP = 8;
	const BOTTOM = 18;

	const sx = (i: number) => LEFT + (labels.length > 1 ? i / (labels.length - 1) : 0.5) * (W - LEFT - RIGHT);
	const sy = (value: number) => TOP + (1 - value / 100) * (H - TOP - BOTTOM);

	/** a line breaks where a round has no value rather than bridging the gap */
	function path(values: (number | null)[]): string {
		let d = '';
		let pen = false;
		values.forEach((value, i) => {
			if (value === null) return void (pen = false);
			d += `${pen ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(value).toFixed(1)}`;
			pen = true;
		});
		return d;
	}

	const ticks = $derived(labels.length > 1 ? [0, labels.length - 1] : [0]);
</script>

<div class="lines">
	<div class="key">
		{#each lines as line (line.key)}
			<span class="k" style="--c:{line.colour}">{line.label}</span>
		{/each}
	</div>
	<div bind:clientWidth={W}>
		<svg width={W} height={H} role="img" aria-label={lines.map((line) => line.label).join(', ')}>
			<!-- the ends solid, the middle dashed, the quarters finer still, so a level reads at a glance -->
			{#each [0, 25, 50, 75, 100] as y (y)}
				<line
					class="grid"
					class:half={y === 50}
					class:quarter={y % 50 !== 0}
					x1={LEFT}
					x2={W - RIGHT}
					y1={sy(y)}
					y2={sy(y)}
				/>
				{#if y % 50 === 0}
					<text class="yl" x={LEFT - 6} y={sy(y) + 3}>{y}%</text>
				{/if}
			{/each}
			{#each lines as line (line.key)}
				<path d={path(line.values)} stroke={line.colour} />
				{#each line.values as value, i}
					{#if value !== null}
						<circle cx={sx(i)} cy={sy(value)} r="2.5" fill={line.colour}>
							<title>{labels[i]}: {line.label} {Math.round(value)}%</title>
						</circle>
					{/if}
				{/each}
			{/each}
			{#if shown !== null}
				<line class="cursor" x1={sx(shown)} x2={sx(shown)} y1={TOP} y2={H - BOTTOM} />
			{/if}
			{#if detail}
				{#each labels as label, i (i)}
					<!-- a strip as wide as the gap between rounds, so a thumb finds one -->
					<rect
						class="hit"
						role="button"
						tabindex="0"
						aria-label={label}
						x={sx(i) - (W - LEFT - RIGHT) / Math.max(1, labels.length - 1) / 2}
						y={TOP}
						width={(W - LEFT - RIGHT) / Math.max(1, labels.length - 1)}
						height={H - TOP - BOTTOM}
						onclick={() => (pressed = pressed === i ? null : i)}
						onkeydown={(event) => event.key === 'Enter' && (pressed = pressed === i ? null : i)}
						onpointerenter={(event) => event.pointerType === 'mouse' && (hovered = i)}
						onpointerleave={() => hovered === i && (hovered = null)}
					/>
				{/each}
			{/if}
			{#each ticks as i (i)}
				<text class="xl" x={sx(i)} y={H - 4} text-anchor={i ? 'end' : 'start'}>{labels[i]}</text>
			{/each}
		</svg>
	</div>
	{#if detail}
		<p class="readout" aria-live="polite">
			{#if shown !== null}{@render detail(shown)}{:else}&nbsp;{/if}
		</p>
	{/if}
</div>

<style>
	.lines {
		margin: 6px 0 14px;
	}
	.key {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		font-size: 10.5px;
		color: var(--dim);
		margin-bottom: 8px;
	}
	.k {
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.k::before {
		content: '';
		width: 9px;
		height: 9px;
		border-radius: 3px;
		background: var(--c);
	}
	svg {
		display: block;
		overflow: visible;
	}
	path {
		fill: none;
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.grid {
		stroke: var(--line);
	}
	.grid.half {
		stroke-dasharray: 4 3;
	}
	.grid.quarter {
		stroke-width: 0.5;
		stroke-dasharray: 1 3;
		opacity: 0.7;
	}
	.yl {
		font-size: 9.5px;
		fill: var(--dimmer);
		text-anchor: end;
	}
	.xl {
		font-size: 9.5px;
		fill: var(--dimmer);
	}
	.cursor {
		stroke: var(--line3);
	}
	.hit {
		fill: transparent;
		cursor: pointer;
		outline: none;
	}
	.readout {
		margin: 6px 0 0;
		min-height: 2.8em;
		font-size: 12px;
		line-height: 1.4;
		color: var(--ink2);
	}
</style>
