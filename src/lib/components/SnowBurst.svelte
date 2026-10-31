<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * §3.6: Christmas's confetti. A handful of snow and gold stars thrown up from
	 * behind the winner like a shaken snow globe: out fast, then caught by the
	 * air and let down slowly, each flake swaying on its own way to the floor.
	 * Over everything and taking no pointer. `from` is where it is thrown from,
	 * in viewport px; the middle of the screen when it is not given.
	 */
	let {
		count = 60,
		from,
		onDone
	}: { count?: number; from?: { x: number; y: number }; onDone?: () => void } = $props();

	let layer: HTMLDivElement;

	const FLAKE =
		'<path d="M12 1v22M2.5 6.5l19 11M2.5 17.5l19-11M12 1l-2.4 2.4M12 1l2.4 2.4M12 23l-2.4-2.4M12 23l2.4-2.4M2.5 6.5l3.3.9M2.5 6.5l.9 3.3M21.5 17.5l-3.3-.9M21.5 17.5l-.9-3.3M2.5 17.5l.9-3.3M2.5 17.5l3.3-.9M21.5 6.5l-.9 3.3M21.5 6.5l-3.3.9"/>';
	const STAR = '<path d="M12 1.5l2.7 7.1 7.6.4-5.9 4.8 2 7.4L12 17l-6.4 4.2 2-7.4-5.9-4.8 7.6-.4z"/>';

	const rand = (a: number, b: number) => a + Math.random() * (b - a);

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			onDone?.();
			return;
		}
		const w = innerWidth;
		const h = innerHeight;
		const origin = from ?? { x: w / 2, y: h / 2 };
		const reach = Math.max(1, Math.min(2.2, w / 600));
		const bits = Array.from({ length: count }, (_, i) => {
			const star = i % 4 === 0;
			const size = (star ? rand(14, 26) : rand(10, 24)) * Math.min(1.5, reach);
			const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			el.setAttribute('viewBox', '0 0 24 24');
			el.setAttribute('width', String(size));
			el.setAttribute('height', String(size));
			el.setAttribute('class', star ? 'star' : 'flake');
			el.innerHTML = star ? STAR : FLAKE;
			el.style.opacity = '0';
			layer.appendChild(el);
			// thrown in a fan over the top, harder for the small ones
			const angle = rand(-Math.PI * 0.92, -Math.PI * 0.08);
			const speed = rand(260, 560) * reach * (1.2 - size / 60);
			return {
				el,
				size,
				x: origin.x + rand(-24, 24),
				y: origin.y + rand(-16, 16),
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed,
				spin: rand(-120, 120),
				turn: rand(0, 360),
				sway: rand(0, Math.PI * 2),
				// the air holds a big flake up longer than a small one
				fall: rand(28, 60) * reach * (0.7 + size / 50),
				wait: rand(0, 220)
			};
		});

		const start = performance.now();
		let last = start;
		let frame = requestAnimationFrame(function tick(now) {
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			let alive = 0;
			for (const bit of bits) {
				const age = now - start - bit.wait;
				if (age < 0) {
					alive++;
					continue;
				}
				// the throw dies off in the air, and what is left is the slow fall
				const drag = Math.exp(-2.6 * dt);
				bit.vx *= drag;
				bit.vy = bit.vy * drag + (1 - drag) * bit.fall;
				bit.sway += dt * 1.6;
				bit.x += (bit.vx + Math.sin(bit.sway) * 26 * Math.min(1, age / 1500)) * dt;
				bit.y += bit.vy * dt;
				bit.turn += bit.spin * dt;
				const fade = Math.min(1, age / 160) * Math.min(1, (9500 - age) / 1500);
				bit.el.style.opacity = fade.toFixed(2);
				bit.el.style.transform = `translate(${(bit.x - bit.size / 2).toFixed(1)}px, ${(bit.y - bit.size / 2).toFixed(1)}px) rotate(${bit.turn.toFixed(1)}deg)`;
				if (bit.y > h + bit.size || fade <= 0) bit.el.style.display = 'none';
				else alive++;
			}
			if (alive && now - start < 9500) frame = requestAnimationFrame(tick);
			else onDone?.();
		});
		return () => {
			cancelAnimationFrame(frame);
			for (const bit of bits) bit.el.remove();
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
	.burst :global(svg) {
		position: absolute;
		left: 0;
		top: 0;
		overflow: visible;
		will-change: transform, opacity;
	}
	.burst :global(.flake) {
		fill: none;
		stroke: #f4f8ff;
		stroke-width: 1.6;
		stroke-linecap: round;
		filter: drop-shadow(0 0 2px rgba(190, 220, 255, 0.7));
	}
	.burst :global(.star) {
		fill: #f6cf62;
		filter: drop-shadow(0 0 3px rgba(255, 210, 110, 0.85));
	}
</style>
