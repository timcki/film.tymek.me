<script lang="ts">
	import { rollingMedian, trendLine, type TimePoint } from '$lib/trend';

	/**
	 * One measure against time, a dot a film. Two lines say where the dots are
	 * heading: the straight one is the overall lean (robust to the odd epic), the
	 * wavy one is the median of the nine films around each, which shows a turn
	 * the straight one cannot. The scale covers the middle 90% of the films, and
	 * a film beyond it sits on the edge as a ring, so one outlier does not squash
	 * everything else into a strip.
	 */
	let {
		points,
		colour,
		step,
		fmt,
		caption,
		lang
	}: {
		points: TimePoint[];
		colour: string;
		/** the scale ends on a multiple of this */
		step: number;
		fmt: (value: number) => string;
		/** what the straight line says, from where it starts to where it ends */
		caption: (from: string, to: string) => string;
		lang: string;
	} = $props();

	const uid = $props.id();
	const monthName = $derived(new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' }));

	// drawn at the pixel size it is shown at, so the type and the lines are the
	// same on a phone as on a desktop instead of scaling with the screen
	let W = $state(340);
	const H = 190;
	const LEFT = 46;
	const RIGHT = 8;
	const TOP = 8;
	const BOTTOM = 18;
	const DAY = 86_400_000;

	const xs = $derived(points.map((p) => p.day));
	const x0 = $derived(Math.min(...xs));
	const x1 = $derived(Math.max(...xs));

	const range = $derived.by(() => {
		const sorted = points.map((p) => p.value).sort((a, b) => a - b);
		const at = (q: number) => sorted[Math.floor(q * (sorted.length - 1))];
		const lo = Math.floor(at(0.05) / step) * step;
		const hi = Math.ceil(at(0.95) / step) * step;
		return { lo, hi: hi === lo ? lo + step : hi };
	});

	const sx = (day: number) => LEFT + ((day - x0) / Math.max(1, x1 - x0)) * (W - LEFT - RIGHT);
	const sy = (value: number) => {
		const { lo, hi } = range;
		const clamped = Math.min(hi, Math.max(lo, value));
		return TOP + (1 - (clamped - lo) / (hi - lo)) * (H - TOP - BOTTOM);
	};

	const yTicks = $derived([range.lo, (range.lo + range.hi) / 2, range.hi]);

	/**
	 * A tick on the 1st of a month the plot spans, every few months so there are
	 * at most six; the year stands in for January, and for a long history the
	 * months give way to years alone.
	 */
	const xTicks = $derived.by(() => {
		const from = new Date(x0 * DAY);
		const to = new Date(x1 * DAY);
		const months =
			(to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
		const every = months > 36 ? 12 : Math.max(1, Math.ceil(months / 6));
		const out: { label: string; day: number }[] = [];
		for (let m = from.getUTCMonth() + 1; ; m++) {
			const tick = Date.UTC(from.getUTCFullYear(), m, 1);
			if (tick / DAY > x1) break;
			const month = new Date(tick).getUTCMonth();
			if (every === 12 ? month !== 0 : month % every !== 0) continue;
			out.push({
				label: month === 0 ? String(new Date(tick).getUTCFullYear()) : monthName.format(tick),
				day: tick / DAY
			});
		}
		return out;
	});

	const line = $derived(trendLine(points.map((p) => ({ x: p.day, y: p.value }))));
	const wavy = $derived(
		rollingMedian(
			points.map((p) => ({ x: p.day, y: p.value })),
			4
		)
			.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
			.join(' ')
	);
	const fitted = (day: number) => (line ? line.slope * day + line.intercept : 0);
</script>

<div class="trend" bind:clientWidth={W}>
	<svg width={W} height={H} viewBox="0 0 {W} {H}" role="img" aria-label={caption(fmt(fitted(x0)), fmt(fitted(x1)))}>
		<defs>
			<clipPath id="{uid}-plot">
				<rect x={LEFT} y={TOP} width={W - LEFT - RIGHT} height={H - TOP - BOTTOM} />
			</clipPath>
		</defs>
		{#each yTicks as tick (tick)}
			<line class="grid" x1={LEFT} x2={W - RIGHT} y1={sy(tick)} y2={sy(tick)} />
			<text class="tick" x={LEFT - 5} y={sy(tick) + 3} text-anchor="end">{fmt(tick)}</text>
		{/each}
		{#each xTicks as tick (tick.day)}
			<line class="grid" x1={sx(tick.day)} x2={sx(tick.day)} y1={TOP} y2={H - BOTTOM} />
			<text class="tick" x={sx(tick.day)} y={H - 5} text-anchor="middle">{tick.label}</text>
		{/each}

		{#each points as point}
			{@const out = point.value < range.lo || point.value > range.hi}
			<circle
				class="dot"
				class:ring={out}
				cx={sx(point.day)}
				cy={sy(point.value)}
				r="3"
				stroke={colour}
				fill={out ? 'none' : colour}
			>
				<title>{point.title}: {fmt(point.value)}</title>
			</circle>
		{/each}

		<g clip-path="url(#{uid}-plot)">
			<polyline class="wavy" points={wavy} stroke={colour} />
			{#if line}
				<line
					class="lean"
					x1={sx(x0)}
					x2={sx(x1)}
					y1={sy(fitted(x0))}
					y2={sy(fitted(x1))}
					stroke={colour}
				/>
			{/if}
		</g>
	</svg>
	{#if line}<p class="readout">{caption(fmt(fitted(x0)), fmt(fitted(x1)))}</p>{/if}
</div>

<style>
	.trend {
		margin-top: 6px;
	}
	svg {
		display: block;
	}
	.grid {
		stroke: var(--line);
		stroke-width: 1;
	}
	.tick {
		font-size: 9px;
		fill: var(--dimmer);
	}
	.dot {
		fill-opacity: 0.5;
		stroke-width: 1;
		stroke-opacity: 0.7;
	}
	.dot.ring {
		fill-opacity: 0;
		stroke-opacity: 1;
	}
	.wavy {
		fill: none;
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.lean {
		stroke-width: 1.5;
		stroke-dasharray: 4 3;
	}
	.readout {
		margin: 6px 0 0;
		font-size: 12px;
		color: var(--ink2);
	}
</style>
