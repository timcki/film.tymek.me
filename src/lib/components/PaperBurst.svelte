<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * §3.6: the PRL look's confetti, the off-cuts of a poster school print run:
	 * discs, triangles, half moons, squares and zigzags in brick red, ink,
	 * mustard and teal, and a pigeon's grey feathers among them, thrown up from behind the winner and tumbling down the
	 * way paper does, edge on and face on in turn. Over everything and taking no
	 * pointer. `from` is where it is thrown from, in viewport px; the middle of
	 * the screen when it is not given.
	 */
	let {
		count = 70,
		from,
		onDone
	}: { count?: number; from?: { x: number; y: number }; onDone?: () => void } = $props();

	let layer: HTMLDivElement;

	const SHAPES = [
		'<circle cx="12" cy="12" r="10"/>',
		'<path d="M12 2 22 21H2z"/>',
		'<path d="M2 14a10 10 0 0 1 20 0z"/>',
		'<rect x="3" y="3" width="18" height="18"/>',
		'<path d="M1 15l4-6 4 6 4-6 4 6 4-6 2 3v4l-2-3-4 6-4-6-4 6-4-6-4 6z"/>'
	];
	const FEATHER = '<path d="M12 1c5 6 6 13 0 22-6-9-5-16 0-22z"/><path d="M12 4v19" stroke="#5d626c" stroke-width=".8"/>';
	const INKS = ['#c8493b', '#c8493b', '#c4c0b5', '#c39a3c', '#6f9a9b', '#e6e0cf', '#8e8a80'];

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
			const size = rand(10, 26) * Math.min(1.5, reach);
			const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			el.setAttribute('viewBox', '0 0 24 24');
			el.setAttribute('width', String(size));
			el.setAttribute('height', String(size));
			const feather = i % 5 === 0;
			el.setAttribute('fill', feather ? '#a3a9b2' : INKS[i % INKS.length]);
			el.innerHTML = feather ? FEATHER : SHAPES[Math.floor(Math.random() * SHAPES.length)];
			el.style.opacity = '0';
			layer.appendChild(el);
			const angle = rand(-Math.PI * 0.9, -Math.PI * 0.1);
			const speed = rand(320, 640) * reach * (1.2 - size / 60);
			return {
				el,
				size,
				x: origin.x + rand(-24, 24),
				y: origin.y + rand(-16, 16),
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed,
				spin: rand(-200, 200),
				turn: rand(0, 360),
				// how fast it goes over and over, face on to edge on and back
				tumble: rand(4, 9),
				phase: rand(0, Math.PI * 2),
				fall: rand(70, 130) * reach,
				wait: rand(0, 180)
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
				const drag = Math.exp(-2.2 * dt);
				bit.vx *= drag;
				bit.vy = bit.vy * drag + (1 - drag) * bit.fall;
				bit.phase += bit.tumble * dt;
				// edge on, paper slips sideways and drops; face on, it is held up
				const face = Math.cos(bit.phase);
				bit.x += (bit.vx + Math.sin(bit.phase) * 40) * dt;
				bit.y += bit.vy * (1.25 - 0.5 * Math.abs(face)) * dt;
				bit.turn += bit.spin * dt;
				const fade = Math.min(1, age / 120) * Math.min(1, (8000 - age) / 1200);
				bit.el.style.opacity = fade.toFixed(2);
				bit.el.style.transform = `translate(${(bit.x - bit.size / 2).toFixed(1)}px, ${(bit.y - bit.size / 2).toFixed(1)}px) rotate(${bit.turn.toFixed(1)}deg) scaleY(${face.toFixed(2)})`;
				if (bit.y > h + bit.size || fade <= 0) bit.el.style.display = 'none';
				else alive++;
			}
			if (alive && now - start < 8000) frame = requestAnimationFrame(tick);
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
		filter: drop-shadow(1px 1px 0 rgba(29, 26, 22, 0.25));
	}
</style>
