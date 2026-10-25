<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * §3.6: the night behind the page. A hazy moon with clouds drifting over it,
	 * a sparse field of stars, and now and then a small ghost drifting through.
	 * All of it sits under the bats and under the cards; only the ghost answers
	 * a pointer, and it does it by listening to the window, because the page
	 * lies over it: a tap anywhere near it, and it is gone in a puff.
	 */

	/** a fixed sky, so the stars do not reshuffle on every visit */
	function seeded(seed: number) {
		return () => {
			seed = (seed * 16807) % 2147483647;
			return (seed - 1) / 2147483646;
		};
	}
	const r = seeded(31);
	const STARS = Array.from({ length: 70 }, () => ({
		x: r() * 100,
		y: r() * 70,
		size: r() < 0.85 ? 1 : 2,
		dur: 2.5 + r() * 4,
		delay: -r() * 6
	}));

	type Ghost = { id: number; poof: boolean; left: boolean };
	let ghost = $state<Ghost | null>(null);
	let ghostEl = $state<HTMLElement>();

	/**
	 * A ghost's wander, in its own loop like the bats': it drifts in from an
	 * edge, roams erratically for a while (meandering turns, a near-stop to
	 * hover, now and then doubling back on itself), then leaves by whichever
	 * edge it likes, the one it came in by included.
	 */
	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const rand = (a: number, b: number) => a + Math.random() * (b - a);
		let timer: ReturnType<typeof setTimeout>;
		let frame = 0;
		let id = 0;

		// a point just off one edge of the window: 0 top, 1 right, 2 bottom, 3 left
		const edgePoint = (edge: number): [number, number] => {
			const t = rand(0.1, 0.9);
			const w = innerWidth;
			const h = innerHeight;
			return edge === 0 ? [t * w, -50] : edge === 1 ? [w + 40, t * h] : edge === 2 ? [t * w, h + 50] : [-40, t * h];
		};

		const haunt = () => {
			const w = innerWidth;
			const h = innerHeight;
			let [x, y] = edgePoint(Math.floor(Math.random() * 4));
			// first heading: into the window, toward somewhere in the middle of it
			let heading = Math.atan2(rand(0.25, 0.75) * h - y, rand(0.25, 0.75) * w - x);
			let speed = rand(55, 80);
			// where it means to go; the heading drifts round to it rather than
			// snapping, so a change of mind is an arc, a turn about a slow U
			let want = heading;
			let nextWhim = 0;
			let hoverUntil = 0;
			const born = performance.now();
			const lifetime = rand(7000, 13000);
			let exit: [number, number] | null = null;
			let last = born;
			ghost = { id: ++id, poof: false, left: Math.cos(heading) < 0 };

			const step = (now: number) => {
				const dt = Math.min(0.05, (now - last) / 1000);
				last = now;
				if (!ghost || ghost.poof) return;
				const age = now - born;
				if (!exit && age > lifetime) exit = edgePoint(Math.floor(Math.random() * 4));

				let cruise = 68;
				if (exit) {
					// on its way out: it means to reach the exit
					want = Math.atan2(exit[1] - y, exit[0] - x);
					cruise = 72;
				} else {
					// wandering: now and then a new whim, a lazy veer, a pause to
					// hover, or a mind to go back the way it came
					if (now >= nextWhim) {
						const whim = Math.random();
						if (whim < 0.2) want = heading + Math.PI * rand(0.8, 1.05) * (Math.random() < 0.5 ? -1 : 1);
						else if (whim < 0.38) hoverUntil = now + rand(900, 1800);
						else want = heading + rand(-0.9, 0.9);
						nextWhim = now + rand(1400, 2600);
					}
					if (now < hoverUntil) cruise = 14;
					// near an edge while still haunting, it means to turn back in
					const m = 60;
					if (x < m || x > w - m || y < m || y > h - m) want = Math.atan2(h / 2 - y, w / 2 - x);
				}
				// the heading eases round to what it wants, never faster than a
				// slow turn, with a faint sway on top so even a straight run floats
				const off = Math.atan2(Math.sin(want - heading), Math.cos(want - heading));
				const maxTurn = 1.1 * dt;
				heading += Math.max(-maxTurn, Math.min(maxTurn, off * Math.min(1, dt * 1.6)));
				heading += Math.sin(now / 900) * 0.18 * dt;
				speed += (cruise - speed) * Math.min(1, dt * 1.1);
				x += Math.cos(heading) * speed * dt;
				y += Math.sin(heading) * speed * dt;

				// it faces the way it drifts, and fades in and out at the edges
				const vx = Math.cos(heading) * speed;
				if (Math.abs(vx) > 20 && ghost.left !== vx < 0) ghost = { ...ghost, left: vx < 0 };
				const fadeIn = Math.min(1, age / 700);
				const outside = Math.max(0, -x, x - w, -y, y - h);
				const opacity = Math.min(fadeIn, 1 - Math.min(1, outside / 40));
				if (ghostEl) {
					ghostEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
					ghostEl.style.opacity = opacity.toFixed(2);
				}
				if (exit && outside > 45) {
					done();
					return;
				}
				frame = requestAnimationFrame(step);
			};
			frame = requestAnimationFrame(step);
		};

		const next = (wait: number) => {
			timer = setTimeout(haunt, wait);
		};
		const done = () => {
			cancelAnimationFrame(frame);
			ghost = null;
			next(rand(25000, 50000));
		};
		next(rand(6000, 16000));

		// the page lies over the sky, so the ghost cannot take a tap itself:
		// a pointer coming down near it is what spooks it
		const onDown = (event: PointerEvent) => {
			if (!ghost || ghost.poof || !ghostEl) return;
			const box = ghostEl.getBoundingClientRect();
			const dx = event.clientX - (box.left + box.width / 2);
			const dy = event.clientY - (box.top + box.height / 2);
			if (Math.hypot(dx, dy) < 60) ghost = { ...ghost, poof: true };
		};
		addEventListener('pointerdown', onDown);
		gone = done;
		return () => {
			clearTimeout(timer);
			cancelAnimationFrame(frame);
			removeEventListener('pointerdown', onDown);
		};
	});
	let gone = () => {};
</script>

<!-- the moon has a layer of its own: on a desktop it rides in the bar's empty
     middle, over the bar's ground and under the string of lights -->
<div class="moonlayer" aria-hidden="true">
	<div class="moon">
		<span class="halo"></span>
		<span class="disc"></span>
		<span class="cloud c1"></span>
		<span class="cloud c2"></span>
	</div>
</div>

<div class="night" aria-hidden="true">
	<div class="stars">
		{#each STARS as star, i (i)}
			<span
				style:left="{star.x}%"
				style:top="{star.y}%"
				style:width="{star.size}px"
				style:height="{star.size}px"
				style:animation-duration="{star.dur}s"
				style:animation-delay="{star.delay}s"
			></span>
		{/each}
	</div>


	{#if ghost}
		{#key ghost.id}
			<div
				class="ghost"
				class:poof={ghost.poof}
				class:rtl={ghost.left}
				bind:this={ghostEl}
				onanimationend={(event) => {
					// spooked: the puff has played and it is gone
					if (event.animationName.endsWith('poof')) gone();
				}}
				>
				<svg viewBox="0 0 30 36" width="30" height="36">
					<path
						class="ghost-sheet"
						d="M15 1C7.3 1 3 6.8 3 14v18.5c1.6 1.8 3.4 1.8 5 0 1.6 1.8 3.4 1.8 5 0 1.4 1.8 2.6 1.8 4 0 1.6 1.8 3.4 1.8 5 0 1.6 1.8 3.4 1.8 5 0V14C27 6.8 22.7 1 15 1z"
					/>
					<!-- a face it can be seen to be making: eyes, and a mouth caught
					     mid-"oo" -->
					<ellipse class="ghost-face" cx="10.6" cy="13.6" rx="2.1" ry="3" />
					<ellipse class="ghost-face" cx="19.4" cy="13.6" rx="2.1" ry="3" />
					<ellipse class="ghost-face" cx="15" cy="21.4" rx="2.6" ry="3.4" />
					<ellipse class="ghost-glint" cx="11.2" cy="12.6" rx="0.6" ry="0.8" />
					<ellipse class="ghost-glint" cx="20" cy="12.6" rx="0.6" ry="0.8" />
				</svg>
			</div>
		{/key}
	{/if}
</div>

<style>
	.night {
		position: fixed;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		pointer-events: none;
	}

	/* --------------------------------------------------------------- stars -- */
	.stars span {
		position: absolute;
		border-radius: 50%;
		background: #f4ecff;
		opacity: 0.25;
		animation: twinkle ease-in-out infinite alternate;
	}
	@keyframes twinkle {
		to {
			opacity: 0.75;
		}
	}
	/* stars on parchment are a mistake, not a sky */
	:global(:root[data-theme='light']) .stars {
		display: none;
	}

	/* ---------------------------------------------------------------- moon -- */
	.moonlayer {
		position: fixed;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		pointer-events: none;
	}
	/* below the sticky bar, whose solid ground would otherwise cut its light
	   in a straight line, and the glow fades out upward for the same reason */
	.moon {
		position: absolute;
		top: max(12%, 112px);
		right: 9%;
		width: 64px;
		height: 64px;
	}
	.halo {
		position: absolute;
		inset: -70px;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(255, 236, 205, 0.13), transparent 62%);
		-webkit-mask-image: linear-gradient(transparent 12%, #000 48%);
		mask-image: linear-gradient(transparent 12%, #000 48%);
	}
	.disc {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background:
			radial-gradient(circle at 34% 38%, rgba(0, 0, 0, 0.08) 0 7px, transparent 8px),
			radial-gradient(circle at 62% 60%, rgba(0, 0, 0, 0.07) 0 10px, transparent 11px),
			radial-gradient(circle at 58% 30%, rgba(0, 0, 0, 0.06) 0 4px, transparent 5px),
			radial-gradient(circle at 40% 40%, #fff6e2, #e9dcc0 70%, #d8c8a6);
		box-shadow: 0 0 24px rgba(255, 238, 200, 0.35);
		opacity: 0.88;
	}
	.cloud {
		position: absolute;
		height: 16px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--bg) 70%, #6a5a78);
		filter: blur(5px);
		opacity: 0.85;
		animation: cloud linear infinite;
	}
	.c1 {
		top: 18px;
		width: 120px;
		animation-duration: 70s;
		animation-delay: -24s;
	}
	.c2 {
		top: 40px;
		width: 90px;
		height: 12px;
		animation-duration: 95s;
		animation-delay: -70s;
	}
	@keyframes cloud {
		from {
			transform: translateX(-220px);
		}
		to {
			transform: translateX(200px);
		}
	}
	/* by day the moon is a pale ghost of itself */
	:global(:root[data-theme='light']) .moon {
		opacity: 0.4;
	}
	/* a desktop bar has a wide empty middle, and the moon sits up in it, above
	   the bar's solid ground, so nothing the page lays down can cut its light */
	@media (min-width: 960px) {
		.moonlayer {
			z-index: 3;
		}
		.moon {
			top: 34px;
			right: 27%;
			width: 50px;
			height: 50px;
		}
		/* and its glow thins out upward before it reaches the solid band the
		   light string draws over the top of the window, which would cut it */
		.halo {
			inset: -44px;
			-webkit-mask-image: linear-gradient(transparent 18%, #000 50%);
			mask-image: linear-gradient(transparent 18%, #000 50%);
		}
	}
	@media (max-width: 560px) {
		.moon {
			top: max(12%, 96px);
			right: 7%;
			width: 50px;
			height: 50px;
		}
	}

	/* --------------------------------------------------------------- ghost -- */
	.ghost {
		position: absolute;
		left: -15px;
		top: -18px;
		opacity: 0;
		will-change: transform, opacity;
	}
	.ghost svg {
		display: block;
		overflow: visible;
		animation: bob 3.2s ease-in-out infinite;
	}
	/* turning to face the other way is a soft half-second turn, not a flip */
	.ghost svg {
		transition: transform 0.55s ease-in-out;
	}
	.ghost.rtl svg {
		transform: scaleX(-1);
	}
	.ghost-sheet {
		fill: rgba(246, 241, 252, 0.7);
		filter: drop-shadow(0 0 6px rgba(230, 220, 255, 0.45));
	}
	.ghost-face {
		fill: #160e1c;
	}
	.ghost-glint {
		fill: rgba(255, 255, 255, 0.7);
	}
	@keyframes bob {
		0%,
		100% {
			translate: 0 0;
			rotate: -4deg;
		}
		50% {
			translate: 0 -10px;
			rotate: 4deg;
		}
	}
	/* spooked: it swells and is gone where it stood */
	.ghost.poof svg {
		animation: poof 0.45s ease-out forwards;
	}
	@keyframes poof {
		to {
			scale: 1.8;
			opacity: 0;
			filter: blur(4px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.stars span,
		.cloud {
			animation: none;
		}
	}
</style>
