<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * §3.6: the folk look's confetti, sparks off a Kupała bonfire: thrown up
	 * from behind the winner, then carried on up by the heat, swaying as they
	 * go, guttering, and going out as they cool, with a flake of ash among
	 * them now and then. Over everything and taking no pointer. `from` is where
	 * the fire is, in viewport px; the middle of the screen when it is not
	 * given.
	 */
	let {
		count = 70,
		from,
		onDone
	}: { count?: number; from?: { x: number; y: number }; onDone?: () => void } = $props();

	let layer: HTMLDivElement;

	const rand = (a: number, b: number) => a + Math.random() * (b - a);

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			onDone?.();
			return;
		}
		const w = innerWidth;
		const origin = from ?? { x: w / 2, y: innerHeight / 2 };
		const reach = Math.max(1, Math.min(2.2, w / 600));
		const sparks = Array.from({ length: count * 1.6 }, (_, i) => {
			const ash = i % 7 === 0;
			const size = (ash ? rand(3, 6) : rand(2.5, 8)) * Math.min(1.4, reach);
			const el = document.createElement('i');
			el.className = ash ? 'ash' : 'ember';
			el.style.width = el.style.height = `${size.toFixed(1)}px`;
			el.style.opacity = '0';
			layer.appendChild(el);
			const angle = rand(-Math.PI * 0.85, -Math.PI * 0.15);
			const speed = rand(160, 520) * reach;
			return {
				el,
				size,
				x: origin.x + rand(-30, 30),
				y: origin.y + rand(-12, 12),
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed,
				// the speed the heat carries it up at once the throw is spent
				rise: (ash ? rand(20, 50) : rand(50, 120)) * reach,
				sway: rand(1, 2.6),
				phase: rand(0, Math.PI * 2),
				flicker: rand(5, 13),
				life: ash ? rand(4000, 6000) : rand(1800, 4600),
				wait: rand(0, 450)
			};
		});

		const start = performance.now();
		let last = start;
		let frame = requestAnimationFrame(function tick(now) {
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			let alive = 0;
			for (const s of sparks) {
				const age = now - start - s.wait;
				if (age < 0) {
					alive++;
					continue;
				}
				if (age > s.life) {
					s.el.style.display = 'none';
					continue;
				}
				alive++;
				const drag = Math.exp(-1.8 * dt);
				s.vx *= drag;
				s.vy = s.vy * drag - (1 - drag) * s.rise;
				s.phase += s.sway * dt;
				s.x += (s.vx + Math.sin(s.phase) * 34) * dt;
				s.y += s.vy * dt;
				const t = age / s.life;
				const gutter = 0.7 + 0.3 * Math.sin((age / 1000) * s.flicker * Math.PI * 2);
				s.el.style.opacity = (Math.min(1, age / 90) * Math.pow(1 - t, 0.6) * gutter).toFixed(2);
				s.el.style.transform = `translate(${(s.x - s.size / 2).toFixed(1)}px, ${(s.y - s.size / 2).toFixed(1)}px) scale(${(1 - 0.55 * t).toFixed(2)})`;
			}
			if (alive && now - start < 7000) frame = requestAnimationFrame(tick);
			else onDone?.();
		});
		return () => {
			cancelAnimationFrame(frame);
			for (const s of sparks) s.el.remove();
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
	.burst :global(i) {
		position: absolute;
		left: 0;
		top: 0;
		border-radius: 50%;
		will-change: transform, opacity;
	}
	.burst :global(.ember) {
		background: radial-gradient(circle, #fff6d6 0 18%, #ffc35c 38%, #f0782a 62%, rgba(200, 70, 20, 0) 72%);
		box-shadow: 0 0 9px 2px rgba(255, 140, 50, 0.6);
	}
	.burst :global(.ash) {
		border-radius: 40% 60% 55% 45%;
		background: #8a8178;
		box-shadow: inset 0 0 0 1px rgba(40, 36, 32, 0.6);
	}
</style>
