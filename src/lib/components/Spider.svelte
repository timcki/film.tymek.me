<script lang="ts">
	/**
	 * §3.6: a spider living in a card's web. It wanders between points on its
	 * web, pausing a while at each, turns at a limited rate so a change of
	 * direction is an arc (or, for a sharp one, a pivot on the spot with the legs
	 * still stepping), and moves its eight legs in the alternating fours real
	 * spiders walk on, at a rate tied to the ground actually covered. With less
	 * motion asked for it sits still in its web.
	 *
	 * `corner` lives in a top-right web, `ledge` on the strip above a poster.
	 */
	let { zone }: { zone: 'corner' | 'ledge' } = $props();

	type Point = [number, number];
	/** where on its web a spider may stop, in its box's own pixels */
	const STOPS: Record<'corner' | 'ledge', Point[]> = {
		corner: [
			[48, 6],
			[30, 18],
			[42, 30],
			[22, 8],
			[50, 20],
			[36, 9]
		],
		ledge: [
			[8, 5],
			[30, 5],
			[52, 4],
			[18, 5],
			[44, 5]
		]
	};
	const BOX: Record<'corner' | 'ledge', Point> = { corner: [56, 40], ledge: [64, 10] };

	/** px per second, and degrees per second at full turn */
	const SPEED = 9;
	const TURN = 140;
	/** a full step cycle per this many px walked */
	const STRIDE = 5;

	// a spider is born into one web and never moves house
	// svelte-ignore state_referenced_locally
	const stops = STOPS[zone];
	let x = $state(stops[0][0]);
	let y = $state(stops[0][1]);
	// degrees, 0 facing up the screen
	// svelte-ignore state_referenced_locally
	let heading = $state(zone === 'corner' ? 225 : 90);
	let phase = $state(0);

	$effect(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		let target = 0;
		let restUntil = performance.now() + 800 + Math.random() * 3000;
		let last = performance.now();
		let frame = requestAnimationFrame(function tick(now) {
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			if (now >= restUntil) {
				const [tx, ty] = stops[target];
				const dx = tx - x;
				const dy = ty - y;
				const distance = Math.hypot(dx, dy);
				if (distance < 0.6) {
					// arrived: sit a while, then pick somewhere else on the web
					restUntil = now + 1200 + Math.random() * 4200;
					let next = target;
					while (next === target) next = Math.floor(Math.random() * stops.length);
					target = next;
				} else {
					const want = (Math.atan2(dx, -dy) * 180) / Math.PI;
					const off = ((want - heading + 540) % 360) - 180;
					const turn = Math.sign(off) * Math.min(Math.abs(off), TURN * dt);
					heading += turn;
					// facing away it barely creeps forward and mostly pivots
					const ahead = Math.max(0, Math.cos((off * Math.PI) / 180));
					const step = Math.min(distance, SPEED * dt * (0.15 + 0.85 * ahead));
					const rad = (heading * Math.PI) / 180;
					x += Math.sin(rad) * step;
					y -= Math.cos(rad) * step;
					// the legs keep stepping through a pivot too
					phase += ((step + Math.abs(turn) * 0.04) / STRIDE) * Math.PI * 2;
				}
			}
			frame = requestAnimationFrame(tick);
		});
		return () => cancelAnimationFrame(frame);
	});

	/** each leg's swing: the alternating fours, front-to-back */
	const swing = (leg: number, side: number) =>
		Math.sin(phase + ((leg + (side > 0 ? 1 : 0)) % 2) * Math.PI) * 14;

	const LEGS = [
		'M-1 -2.8 L-4.6 -6 L-6.4 -10',
		'M-1.2 -2 L-5.8 -3.4 L-9 -5.6',
		'M-1.2 -1.2 L-5.8 0.4 L-9 2.8',
		'M-1 -0.4 L-4.8 3 L-6.6 7.6'
	];
	const ROOTS: Point[] = [
		[-1, -2.8],
		[-1.2, -2],
		[-1.2, -1.2],
		[-1, -0.4]
	];
</script>

<span class="nest {zone}" style:width="{BOX[zone][0]}px" style:height="{BOX[zone][1]}px" aria-hidden="true">
	<svg
		class="spider"
		viewBox="-10 -10 20 20"
		style:transform="translate({x - 7}px, {y - 7}px) rotate({heading}deg)"
	>
		{#each LEGS as leg, i (i)}
			<path d={leg} transform="rotate({swing(i, 1)} {ROOTS[i][0]} {ROOTS[i][1]})" />
			<path
				d={leg}
				transform="scale(-1 1) rotate({swing(i, -1)} {ROOTS[i][0]} {ROOTS[i][1]})"
			/>
		{/each}
		<ellipse class="body" cx="0" cy="3" rx="2.9" ry="3.6" />
		<circle class="body" cx="0" cy="-2" r="1.9" />
		<ellipse class="sheen" cx="-0.9" cy="1.8" rx="0.9" ry="1.4" />
	</svg>
</span>

<style>
	/* on the card's surface, under everything printed on it: the card lifts
	   its poster and its words a layer above this one */
	.nest {
		position: absolute;
		top: 0;
		pointer-events: none;
		z-index: 0;
	}
	.nest.corner {
		right: 0;
	}
	.nest.ledge {
		left: 6px;
	}
	.spider {
		position: absolute;
		top: 0;
		left: 0;
		width: 14px;
		height: 14px;
		overflow: visible;
		transform-origin: 7px 7px;
	}
	/* the dark brown of a real house spider, and a hairline of warm light
	   round it so it does not vanish into a dark card */
	.spider {
		filter: var(--spider-rim, none);
	}
	.spider path {
		fill: none;
		stroke: var(--spider-leg);
		stroke-width: 0.9;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.body {
		fill: var(--spider-body);
	}
	.sheen {
		fill: rgba(255, 225, 190, 0.22);
	}
</style>
