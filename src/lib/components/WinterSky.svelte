<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * §3.6: the night behind a Christmas page. Stars, a full moon, snow falling
	 * past the gaps between the cards, and now and then a sleigh and its team
	 * crossing in front of the moon, a silhouette on its disc and hardly there
	 * anywhere else. Nothing here takes a pointer, and with less motion asked
	 * for the snow is not drawn and the sleigh stays at home.
	 */

	/** a fixed sky, so the stars do not reshuffle on every visit */
	function seeded(seed: number) {
		return () => {
			seed = (seed * 16807) % 2147483647;
			return (seed - 1) / 2147483646;
		};
	}
	const r = seeded(12);
	const STARS = Array.from({ length: 60 }, () => ({
		x: r() * 100,
		y: r() * 62,
		size: r() < 0.85 ? 1 : 2,
		dur: 2.5 + r() * 4,
		delay: -r() * 6
	}));

	let canvas: HTMLCanvasElement;
	let moon: HTMLElement;
	let sleigh = $state<{ id: number; y: number; seconds: number } | null>(null);

	/* --------------------------------------------------------------- snow -- */

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		type Flake = { x: number; y: number; r: number; v: number; sway: number; drift: number; a: number };
		let w = 0;
		let h = 0;
		const flakes: Flake[] = [];
		// mostly fine snow, a few big soft flakes nearer the eye, which fall faster
		const flake = (anywhere: boolean): Flake => {
			const r = Math.random() ** 2 * 2.2 + 0.6;
			return {
				x: Math.random() * w,
				y: anywhere ? Math.random() * h : -4,
				r,
				v: 12 + r * 13,
				sway: Math.random() * Math.PI * 2,
				drift: (Math.random() - 0.5) * 8,
				a: 0.3 + (r / 2.8) * 0.5
			};
		};
		const fit = () => {
			const dpr = Math.min(2, devicePixelRatio || 1);
			w = innerWidth;
			h = innerHeight;
			canvas.width = w * dpr;
			canvas.height = h * dpr;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			const want = Math.round(Math.min(150, (w * h) / 9000));
			while (flakes.length < want) flakes.push(flake(true));
			flakes.length = want;
		};
		fit();
		addEventListener('resize', fit);

		let last = performance.now();
		let frame = requestAnimationFrame(function fall(now) {
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			ctx.clearRect(0, 0, w, h);
			ctx.fillStyle = '#fff';
			for (let i = 0; i < flakes.length; i++) {
				const f = flakes[i];
				f.sway += dt * (0.5 + f.r * 0.25);
				f.x += (f.drift + Math.sin(f.sway) * 5 * f.r) * dt;
				f.y += f.v * dt;
				if (f.y > h + 4 || f.x < -10 || f.x > w + 10) flakes[i] = flake(false);
				ctx.globalAlpha = f.a;
				ctx.beginPath();
				ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
				ctx.fill();
			}
			frame = requestAnimationFrame(fall);
		});
		return () => {
			cancelAnimationFrame(frame);
			removeEventListener('resize', fit);
		};
	});

	/* ------------------------------------------------------------- sleigh -- */

	// across the window in front of the moon, at a pace a team could keep up
	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		let timer: ReturnType<typeof setTimeout>;
		let id = 0;
		const fly = () => {
			const box = moon.getBoundingClientRect();
			sleigh = { id: ++id, y: box.top + box.height / 2 - 18, seconds: (innerWidth + 260) / 95 };
			timer = setTimeout(
				() => {
					sleigh = null;
					timer = setTimeout(fly, 35000 + Math.random() * 40000);
				},
				sleigh.seconds * 1000 + 200
			);
		};
		timer = setTimeout(fly, 9000 + Math.random() * 9000);
		return () => clearTimeout(timer);
	});
</script>

<div class="winter" aria-hidden="true">
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
</div>

<div class="moonlayer" aria-hidden="true">
	<div class="moon" bind:this={moon}>
		<span class="halo"></span>
		<span class="disc"></span>
	</div>
	{#if sleigh}
		{#key sleigh.id}
			<div class="flight" style:top="{sleigh.y}px" style:animation-duration="{sleigh.seconds}s">
				<svg class="team" viewBox="0 0 124 32" width="124" height="32">
					<path class="reins" d="M37 13.4Q62 19 104 10.6" />
					<g class="sled">
						<path d="M10.6 14.6c0-3.4 2.2-5.6 4.8-5.6s4.8 2.2 4.8 5.6z" />
						<path d="M19 15c0-4.2 2.2-6.8 5.2-6.8s5.2 2.6 5.2 6.8z" />
						<circle cx="24.2" cy="6.4" r="2.8" />
						<path d="M21.8 4.8 24.6.6l3.4 3.8z" />
						<path d="M3 15.4h33.6l2.6-6.2h4.4l-3.4 9c-1 2.6-3 4-5.8 4H9.6c-3.6 0-6-2.6-6.6-6.8z" />
						<path class="runner" d="M2 26.2h32c3.6 0 5.8-1.6 7-4.2M10 22.4v3.8M30 22.4v3.8" />
					</g>
					{#each [62, 82, 102] as x, i (x)}
						<g class="deer" style:--x="{x}px" style:--d="{i * -0.12}s">
							<ellipse cx="0" cy="0" rx="7" ry="3.1" />
							<path d="M4.6-1.6 8.2-6.2 10.8-6.8 11.6-5.6 9.2-4.6 6.6-.4z" />
							<path class="line" d="M8.6-6.4 7.6-9.8 6-11M7.6-9.8 8.8-11.4M9.8-6.6 10.8-9.6 10-11.2M10.8-9.6 12.2-10.4" />
							<path class="line legs" d="M-5 1.4-8.6 5M-3.4 2-5.2 6.2M4 2 7.6 5.2M5.6 1.4 9.2 3.4" />
							{#if i === 2}<circle class="nose" cx="11.8" cy="-6" r="1" />{/if}
						</g>
					{/each}
				</svg>
			</div>
		{/key}
	{/if}
</div>

<canvas class="snow" bind:this={canvas} aria-hidden="true"></canvas>

<style>
	.winter,
	.moonlayer {
		position: fixed;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.stars span {
		position: absolute;
		border-radius: 50%;
		background: #eef6ff;
		opacity: 0.25;
		animation: twinkle ease-in-out infinite alternate;
	}
	@keyframes twinkle {
		to {
			opacity: 0.8;
		}
	}

	/* the moon sits where Night's does, under the bar on a phone and up in the
	   bar's empty middle on a desktop, so nothing the page lays down cuts its light */
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
		background: radial-gradient(circle, rgba(220, 236, 255, 0.14), transparent 62%);
		-webkit-mask-image: linear-gradient(transparent 12%, #000 48%);
		mask-image: linear-gradient(transparent 12%, #000 48%);
	}
	.disc {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background:
			radial-gradient(circle at 30% 62%, rgba(60, 80, 110, 0.07) 0 9px, transparent 11px),
			radial-gradient(circle at 66% 40%, rgba(60, 80, 110, 0.05) 0 6px, transparent 8px),
			radial-gradient(circle at 40% 40%, #fbfdff, #e2ebf3 70%, #c9d6e2);
		box-shadow: 0 0 26px rgba(210, 230, 255, 0.4);
		opacity: 0.92;
	}
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
		.halo {
			inset: -44px;
			-webkit-mask-image: linear-gradient(transparent 18%, #000 50%);
			mask-image: linear-gradient(transparent 18%, #000 50%);
		}
	}
	@media (max-width: 420px) {
		.moon {
			top: max(12%, 96px);
			right: 7%;
			width: 50px;
			height: 50px;
		}
	}

	/* the sleigh: from off the left edge to off the right, rising a little as it
	   goes, the team bobbing at a gallop */
	.flight {
		position: absolute;
		left: 0;
		animation: cross linear both;
	}
	@keyframes cross {
		from {
			transform: translate(-140px, 14px);
		}
		to {
			transform: translate(calc(100vw + 20px), -26px);
		}
	}
	.team {
		display: block;
		overflow: visible;
		fill: var(--sleigh);
		filter: var(--sleigh-rim);
	}
	.reins,
	.runner,
	.line {
		fill: none;
		stroke: var(--sleigh);
		stroke-width: 1.1;
		stroke-linecap: round;
	}
	.reins {
		stroke-width: 0.6;
	}
	.deer {
		transform: translate(var(--x), 14px);
		animation: gallop 0.42s ease-in-out var(--d) infinite alternate;
	}
	@keyframes gallop {
		to {
			transform: translate(var(--x), 11.6px);
		}
	}
	.nose {
		fill: #ff4a3d;
		filter: drop-shadow(0 0 2px #ff4a3d);
	}
	.sled {
		animation: bob 0.84s ease-in-out infinite alternate;
	}
	@keyframes bob {
		to {
			transform: translateY(-1.4px);
		}
	}

	/* over the sky and behind the cards, which the page lifts a layer above it */
	.snow {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 1;
		pointer-events: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.stars span {
			animation: none;
		}
		.snow {
			display: none;
		}
	}
</style>
