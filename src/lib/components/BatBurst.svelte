<script lang="ts">
	import { onMount } from 'svelte';
	import { bankFor, drawBat, spread, wingAngle, type BatShape } from '$lib/bat-shape';

	/**
	 * §3.6: the Halloween night's confetti. A colony bursts out from behind the
	 * winner, startled: every bat off in its own direction, mostly up and out,
	 * beating hard at first and then settling into its stroke as it clears the
	 * screen. Over everything, like the confetti it stands in for, and taking no
	 * pointer. `from` is where they burst out of, in viewport px; the middle of
	 * the screen when it is not given.
	 */
	let {
		count = 46,
		from,
		onDone
	}: { count?: number; from?: { x: number; y: number }; onDone?: () => void } = $props();

	let layer: HTMLDivElement;

	type Bat = BatShape & {
		x: number;
		y: number;
		vx: number;
		vy: number;
		/** a slow curl to its course, so the burst does not fly in straight lines */
		curl: number;
		heading: number;
		phase: number;
		hz: number;
		size: number;
		/** ms after the burst before this one breaks cover */
		wait: number;
	};

	const rand = (a: number, b: number) => a + Math.random() * (b - a);

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			onDone?.();
			return;
		}
		const w = innerWidth;
		const h = innerHeight;
		const origin = from ?? { x: w / 2, y: h / 2 };
		// paced to the screen, so a projector's burst takes about as long to clear
		// it as a phone's does, a few seconds of wings either way
		const reach = Math.max(1, Math.min(2.2, w / 600));
		const bats: Bat[] = Array.from({ length: count }, () => {
			// mostly up and outwards: a fan over the top, a few low ones skimming off
			const angle = Math.random() < 0.82 ? rand(-Math.PI * 0.95, -Math.PI * 0.05) : rand(-0.35, 0.35) + (Math.random() < 0.5 ? 0 : Math.PI);
			const speed = rand(150, 330) * reach;
			const size = rand(26, 58) * Math.min(1.5, reach);
			const shape = drawBat(layer, size);
			shape.el.style.opacity = '0';
			return {
				...shape,
				x: origin.x + rand(-30, 30),
				y: origin.y + rand(-20, 20),
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed,
				curl: rand(-1.1, 1.1),
				heading: 0,
				phase: Math.random() * Math.PI * 2,
				hz: rand(5.2, 6.4),
				size,
				wait: rand(0, 650)
			};
		});

		const start = performance.now();
		let last = start;
		let frame = requestAnimationFrame(function tick(now) {
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			let alive = 0;
			for (const bat of bats) {
				const age = now - start - bat.wait;
				if (age < 0) {
					alive++;
					continue;
				}
				// the course curls a little, the flight eases as the fright wears off
				const turn = bat.curl * dt;
				const vx = bat.vx * Math.cos(turn) - bat.vy * Math.sin(turn);
				const vy = bat.vx * Math.sin(turn) + bat.vy * Math.cos(turn);
				const ease = Math.max(0.55, 1 - age / 4000);
				bat.vx = vx;
				bat.vy = vy;
				bat.x += vx * ease * dt;
				bat.y += vy * ease * dt;
				// beating hard out of the burst, then the ordinary few strokes a second
				bat.phase += (bat.hz - Math.min(2, age / 600)) * Math.PI * 2 * dt;
				spread(bat, wingAngle(bat.phase));
				bat.heading += (bankFor(vx, vy) - bat.heading) * Math.min(1, dt * 6);
				// out from behind it: small and faint for the first beat, then full size
				const grown = Math.min(1, age / 260);
				const half = bat.size / 2;
				bat.el.style.opacity = String(grown);
				bat.el.style.transform = `translate(${(bat.x - half).toFixed(1)}px, ${(bat.y - half / 1.5).toFixed(1)}px) rotate(${bat.heading.toFixed(1)}deg) scale(${(0.35 + 0.65 * grown).toFixed(3)})`;
				const gone = bat.x < -bat.size * 2 || bat.x > w + bat.size * 2 || bat.y < -bat.size * 2 || bat.y > h + bat.size * 2;
				if (gone) bat.el.style.display = 'none';
				else alive++;
			}
			if (alive && now - start < 9000) frame = requestAnimationFrame(tick);
			else onDone?.();
		});
		return () => {
			cancelAnimationFrame(frame);
			for (const bat of bats) bat.el.remove();
		};
	});
</script>

<div class="burst" bind:this={layer} aria-hidden="true"></div>

<style>
	.burst {
		position: fixed;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		z-index: 9999;
	}
	.burst :global(.bat) {
		position: absolute;
		left: 0;
		top: 0;
		overflow: visible;
		fill: var(--bat-body, #1a1214);
		filter: var(--bat-rim, none);
		will-change: transform, opacity;
	}
</style>
