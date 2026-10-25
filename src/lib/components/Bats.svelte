<script lang="ts">
	import { onMount } from 'svelte';
	import { batSky } from '$lib/bat-sky';
	import { GLIDE, bankFor, drawBat, spread, wingAngle, type BatShape } from '$lib/bat-shape';

	/**
	 * §3.6: the bats. Not three stickers on rails but colonies: a group of a few
	 * leaves one side of the sky for the other at one depth, each bat in it
	 * hunting on its own around the group, darting, dropping after a moth,
	 * beating its wings in bursts and gliding between them. Near groups are big,
	 * fast and dark, far ones small, slow and faded into the sky.
	 *
	 * Drawn straight into the DOM from one animation frame loop rather than
	 * through component state: a few dozen elements updated sixty times a second
	 * is exactly what reactivity is not for. Nothing here takes a pointer.
	 */

	type Bat = BatShape & {
		x: number;
		y: number;
		vx: number;
		vy: number;
		/** where in the group this one keeps to */
		ox: number;
		oy: number;
		/** the current dart, and when it changes */
		jx: number;
		jy: number;
		jUntil: number;
		/** degrees of bank, following the climb or the dive, smoothed */
		heading: number;
		phase: number;
		hz: number;
		glideUntil: number;
		size: number;
	};
	type Group = {
		x: number;
		y: number;
		vx: number;
		vy: number;
		/** the line it holds, corner to corner, and the wobble about it */
		baseVy: number;
		wobble: number;
		depth: number;
		bats: Bat[];
	};

	let sky: HTMLDivElement;

	const rand = (a: number, b: number) => a + Math.random() * (b - a);

	function makeBat(size: number, depth: number): Bat {
		const shape = drawBat(sky, size);
		// far bats sink into the sky
		shape.el.style.opacity = String(0.35 + 0.65 * depth);
		return {
			...shape,
			x: 0,
			y: 0,
			vx: 0,
			vy: 0,
			ox: 0,
			oy: 0,
			jx: 0,
			jy: 0,
			jUntil: 0,
			heading: 0,
			phase: Math.random() * Math.PI * 2,
			// a few deep beats a second; smaller, farther bats a little quicker.
			// Faster than this and at this size they stop reading as bats and
			// start reading as flies
			hz: rand(3.1, 4) + (1 - depth) * 1.2,
			glideUntil: 0,
			size
		};
	}

	/**
	 * A colony setting off. `from` is a point to leave from, for a bat that has
	 * just dropped off its roost; otherwise it enters from either side at a
	 * random height and depth.
	 */
	function launch(
		groups: Group[],
		w: number,
		h: number,
		from?: { x: number; y: number; count: number }
	): void {
		const depth = from ? 1 : [0.35, 0.6, 1][Math.floor(Math.random() * 3)];
		const dir = from ? (from.x < w / 2 ? 1 : -1) : Math.random() < 0.5 ? 1 : -1;
		// a bat in the open is going somewhere: forward is most of what it does.
		// Paced for a phone's width, and scaled up with the screen, so a desktop
		// sky takes about as long to cross as a phone's does
		const reach = Math.min(2.8, Math.max(1, w / 430));
		const speed = (58 + 80 * depth) * reach * dir;
		const size = 30 + 30 * depth;
		const spread = 26 + 40 * depth;
		const count = from?.count ?? Math.floor(rand(8, 16));
		// from near one corner to near the opposite one: in at the top on one
		// side and out at the bottom on the other, or the other way up
		const x = from ? from.x : dir > 0 ? -60 : w + 60;
		const down = from ? true : Math.random() < 0.5;
		const y = from ? from.y : down ? rand(0, 0.18) * h : rand(0.82, 1) * h;
		const endY = down ? rand(0.82, 1.05) * h : rand(-0.05, 0.18) * h;
		const baseVy = ((endY - y) / (w + 120 - (from ? Math.abs(x - (dir > 0 ? -60 : w + 60)) : 0))) * Math.abs(speed);
		const group: Group = { x, y, vx: speed, vy: baseVy, baseVy, wobble: 0, depth, bats: [] };
		for (let i = 0; i < count; i++) {
			const bat = makeBat(size * rand(0.85, 1.1), depth);
			bat.ox = rand(-spread, spread) * 1.6;
			bat.oy = rand(-spread, spread) * 0.7;
			bat.x = x + (from ? 0 : bat.ox - dir * rand(0, spread * 2));
			bat.y = y + (from ? 0 : bat.oy);
			bat.vx = speed;
			bat.vy = from ? 40 : 0;
			group.bats.push(bat);
		}
		groups.push(group);
	}

	const pending: { x: number; y: number; count: number }[] = [];

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		// a hanging bat that lets go joins the sky from where it was
		batSky.release = (x, y) => pending.push({ x, y, count: 1 });
		const groups: Group[] = [];
		let nextGroup = performance.now() + rand(600, 2500);
		let last = performance.now();
		let frame = requestAnimationFrame(function tick(now) {
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			const w = innerWidth;
			const h = innerHeight;
			// big colonies, and not too many of them: one in the air at a time,
			// now and then a second overlapping it
			if (now >= nextGroup && groups.length < 2) {
				launch(groups, w, h);
				nextGroup = now + rand(9000, 16000);
			}
			while (pending.length) launch(groups, w, h, pending.shift());

			for (let g = groups.length - 1; g >= 0; g--) {
				const group = groups[g];
				// the colony holds its diagonal, wobbling a little about it
				group.wobble += rand(-30, 30) * dt;
				group.wobble = Math.max(-16, Math.min(16, group.wobble));
				group.vy = group.baseVy + group.wobble;
				group.x += group.vx * dt;
				group.y += group.vy * dt;

				let out = true;
				for (const bat of group.bats) {
					// hunting: a fresh dart every so often, now and then a dive
					if (now >= bat.jUntil) {
						const dive = Math.random() < 0.1;
						// a dart swerves and surges, but always on the way: never
						// backwards, never a hover in place
						const ahead = Math.sign(group.vx);
						bat.jx = rand(-6, 34) * ahead;
						bat.jy = dive ? rand(70, 110) : rand(-30, 30);
						bat.jUntil = now + (dive ? rand(380, 560) : rand(500, 1100));
						// and long glides with a few beats between them
						if (Math.random() < 0.45) bat.glideUntil = now + rand(700, 1600);
					}
					// held loosely to its place in the group, plus the dart
					const tx = group.x + bat.ox;
					const ty = group.y + bat.oy;
					const ax = (tx - bat.x) * 1.5 + (group.vx - bat.vx) * 1.2 + bat.jx * 3;
					const ay = (ty - bat.y) * 1.5 + (group.vy - bat.vy) * 1.2 + bat.jy * 3;
					bat.vx += ax * dt;
					bat.vy += ay * dt;
					bat.x += bat.vx * dt;
					bat.y += bat.vy * dt;

					// a beat swings each wing about its shoulder, up into a V and
					// down past level. A glide waits for the wings to come round to
					// a slight droop and holds them there, so nothing snaps
					const angle = wingAngle(bat.phase);
					const gliding = now < bat.glideUntil && Math.abs(angle - GLIDE) < 5;
					if (!gliding) bat.phase += bat.hz * Math.PI * 2 * dt;
					spread(bat, gliding ? GLIDE : angle);
					// seen from the front it does not turn to its path, it banks
					bat.heading += (bankFor(bat.vx, bat.vy) - bat.heading) * Math.min(1, dt * 4);
					const half = bat.size / 2;
					bat.el.style.transform = `translate(${(bat.x - half).toFixed(1)}px, ${(bat.y - half / 1.5).toFixed(1)}px) rotate(${bat.heading.toFixed(1)}deg)`;
					if (bat.x > -80 && bat.x < w + 80) out = false;
				}
				if (out && (group.vx > 0 ? group.x > w : group.x < 0)) {
					for (const bat of group.bats) bat.el.remove();
					groups.splice(g, 1);
				}
			}
			frame = requestAnimationFrame(tick);
		});
		return () => {
			batSky.release = () => {};
			cancelAnimationFrame(frame);
			for (const group of groups) for (const bat of group.bats) bat.el.remove();
		};
	});
</script>

<div class="sky" bind:this={sky} aria-hidden="true"></div>

<style>
	/* the whole window, behind the page's cards: a bat shows only in the gaps */
	.sky {
		position: fixed;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		z-index: 1;
	}
	.sky :global(.bat) {
		position: absolute;
		left: 0;
		top: 0;
		overflow: visible;
		fill: var(--bat-body);
		filter: var(--bat-rim, none);
		will-change: transform;
	}
</style>
