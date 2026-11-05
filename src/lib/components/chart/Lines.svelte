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
	let { lines, labels }: { lines: Line[]; labels: string[] } = $props();

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
			{#each [0, 50, 100] as y (y)}
				<line class="grid" x1={LEFT} x2={W - RIGHT} y1={sy(y)} y2={sy(y)} />
				<text class="yl" x={LEFT - 6} y={sy(y) + 3}>{y}%</text>
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
			{#each ticks as i (i)}
				<text class="xl" x={sx(i)} y={H - 4} text-anchor={i ? 'end' : 'start'}>{labels[i]}</text>
			{/each}
		</svg>
	</div>
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
		stroke-dasharray: 3 3;
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
</style>
