<script module lang="ts">
	export type Seat = {
		key: string;
		name: string;
		colour: string;
		avatar: string | null;
		xp: number;
	};

	/** points the first person spent on films the second nominated */
	export type Tie = { from: string; to: string; points: number };
</script>

<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import { ringOrder } from '$lib/ring';

	/**
	 * Everybody on a ring, a ribbon from whoever spends to whoever nominated, as
	 * thick as what was spent. Each ribbon bends to one side of the line between
	 * its ends, so a pair that back each other get two ribbons, not one on top of
	 * the other, and a dot sits where the points land. People are seated next to
	 * whoever they are most tied to, which is what keeps the ribbons short. Press
	 * a face and only its ribbons are left standing: those it sends out in an
	 * 'out' ring, those it takes in in an 'in' one, each in the colour of the
	 * person at the other end. At rest a face is as big as what it sends or takes.
	 */
	let {
		seats,
		ties,
		mode,
		lit = null,
		onpick = null,
		onface = null,
		label
	}: {
		/** the busiest first, which is who the seating starts from */
		seats: Seat[];
		ties: Tie[];
		mode: 'out' | 'in';
		lit?: string | null;
		onpick?: ((key: string) => void) | null;
		onface?: ((key: string, el: EventTarget | null, on: boolean) => void) | null;
		/** what a ribbon says when it is pointed at */
		label: (from: string, to: string, points: number) => string;
	} = $props();

	const FACE = 30;
	const MAX = 400;

	let width = $state(340);
	const size = $derived(Math.min(width, MAX));
	const centre = $derived(size / 2);
	/** where the faces sit, and where a ribbon stops short of them */
	const ring = $derived(size / 2 - FACE / 2 - 3);
	const reach = $derived(ring - FACE / 2 - 1);

	const tied = (a: string, b: string) =>
		ties.reduce((sum, t) => sum + ((t.from === a && t.to === b) || (t.from === b && t.to === a) ? t.points : 0), 0);
	const order = $derived(ringOrder(seats.map((s) => s.key), tied));
	const seatOf = $derived(new Map(seats.map((s) => [s.key, s])));

	const spot = $derived(
		new Map(
			order.map((key, i) => {
				const angle = -Math.PI / 2 + (2 * Math.PI * i) / order.length;
				return [key, { cos: Math.cos(angle), sin: Math.sin(angle) }] as const;
			})
		)
	);

	const most = $derived(Math.max(1, ...ties.map((t) => t.points)));

	/** what each person sends out or takes in, which is how big their face is drawn */
	const totals = $derived.by(() => {
		const out = new Map<string, number>();
		for (const t of ties) {
			const key = mode === 'out' ? t.from : t.to;
			out.set(key, (out.get(key) ?? 0) + t.points);
		}
		return out;
	});
	const biggest = $derived(Math.max(1, ...totals.values()));
	const faceOf = (key: string) =>
		lit === key
			? FACE
			: Math.round(18 + (FACE - 18) * Math.sqrt((totals.get(key) ?? 0) / biggest));

	// the weakest first, so the strongest ties are the ones left on top
	const ribbons = $derived(
		[...ties].reverse().flatMap((tie) => {
			const a = spot.get(tie.from);
			const b = spot.get(tie.to);
			const who = seatOf.get(other(tie));
			if (!a || !b || !who) return [];
			const x0 = centre + a.cos * reach;
			const y0 = centre + a.sin * reach;
			const x1 = centre + b.cos * reach;
			const y1 = centre + b.sin * reach;
			const dx = x1 - x0;
			const dy = y1 - y0;
			const len = Math.hypot(dx, dy) || 1;
			// pulled toward the middle so far-apart people are joined through the
			// ring, then pushed sideways by the direction the points travel
			const qx = centre + ((x0 + x1) / 2 - centre) * 0.4 - (dy / len) * reach * 0.09;
			const qy = centre + ((y0 + y1) / 2 - centre) * 0.4 + (dx / len) * reach * 0.09;
			const strength = Math.sqrt(tie.points / most);
			const w = 1 + 5 * strength;
			return [
				{
					...tie,
					colour: who.colour,
					w,
					// at rest the heavy ties stand out of the tangle; the colour of
					// whose they are comes with a face being pressed
					rest: 0.12 + 0.5 * strength,
					d: `M${x0.toFixed(1)},${y0.toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`,
					x1,
					y1
				}
			];
		})
	);

	const mine = (t: Tie) => (mode === 'out' ? t.from === lit : t.to === lit);
	/** the other end of a ribbon is the person it is a ribbon to or from */
	const other = (t: Tie) => (mode === 'out' ? t.to : t.from);

	/** whoever the lit face is joined to by a ribbon keeps their colour */
	const near = $derived(new Set(lit ? ties.filter(mine).map(other) : []));
</script>

<div class="ring" class:picking={lit !== null} style="height:{size}px;max-width:{MAX}px" bind:clientWidth={width}>
	<svg width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
		<circle class="guide" cx={centre} cy={centre} r={ring} />
		{#each ribbons as r (r.from + '>' + r.to)}
			{@const on = lit === null || mine(r)}
			{@const colour = lit === null ? 'var(--ink2)' : r.colour}
			<g class="ribbon" class:on class:faded={!on} style="--rest:{r.rest}">
				<path d={r.d} stroke={colour} stroke-width={r.w}>
					<title>{label(seatOf.get(r.from)!.name, seatOf.get(r.to)!.name, r.points)}</title>
				</path>
				<circle cx={r.x1} cy={r.y1} r={r.w / 2 + 1.5} fill={colour} />
			</g>
		{/each}
	</svg>
	{#each order as key (key)}
		{@const seat = seatOf.get(key)!}
		{@const at = spot.get(key)!}
		<button
			class="node"
			class:lit={lit === key}
			class:dim={lit !== null && lit !== key && !near.has(key)}
			style="left:{centre + at.cos * ring - FACE / 2}px;top:{centre + at.sin * ring - FACE / 2}px"
			aria-label={seat.name}
			aria-pressed={lit === key}
			onclick={() => onpick?.(key)}
			onpointerenter={(event) => event.pointerType === 'mouse' && onface?.(key, event.currentTarget, true)}
			onpointerleave={(event) => event.pointerType === 'mouse' && onface?.(key, event.currentTarget, false)}
		>
			<Avatar name={seat.name} colour={seat.colour} avatar={seat.avatar} xp={seat.xp} size={faceOf(key)} font={Math.round(faceOf(key) * 0.37)} titled={false} slim />
		</button>
	{/each}
</div>

<style>
	.ring {
		position: relative;
		width: 100%;
		margin: 6px auto 0;
	}
	svg {
		position: absolute;
		inset: 0;
	}
	.guide {
		fill: none;
		stroke: var(--line);
		stroke-width: 1;
	}
	.ribbon path {
		fill: none;
		stroke-linecap: round;
		opacity: var(--rest);
		transition: opacity 0.15s;
	}
	.ribbon circle {
		opacity: var(--rest);
		transition: opacity 0.15s;
	}
	.ring.picking .ribbon.on path {
		opacity: 0.85;
	}
	.ring.picking .ribbon.on circle {
		opacity: 1;
	}
	.ribbon.faded path,
	.ribbon.faded circle {
		opacity: 0.05;
	}
	.node {
		position: absolute;
		width: 30px;
		height: 30px;
		padding: 0;
		border: 0;
		border-radius: 99px;
		background: none;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 0;
		transition: opacity 0.15s;
	}
	.node.dim {
		opacity: 0.3;
	}
	.node.lit {
		filter: drop-shadow(0 0 5px var(--accent));
		z-index: 1;
	}
</style>
