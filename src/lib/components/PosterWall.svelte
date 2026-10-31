<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * §3.6: what a PRL page is laid against: a wall pasted over with film
	 * posters of the Polish School, dealt from the list the server keeps
	 * (src/lib/server/posters.ts), afresh on every page and none of them twice.
	 * Pasted a little crooked over one another, some torn back to the older one
	 * underneath, the lot gone dark with the weather and darkest behind the
	 * column the page reads in. Every so often somebody pastes one not yet up
	 * over one in sight, and a flock of pigeons goes over. Nothing here takes a
	 * pointer, and with less motion asked for the wall stays as it was dealt and
	 * the pigeons stay put.
	 */

	const COUNT = 84;
	const UNDER = ['#3a3833', '#5a3a30', '#4a4639', '#2e3a3a'];
	const r = Math.random;
	const pick = <T,>(list: T[]) => list[Math.floor(r() * list.length)];
	const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

	/** a lower corner torn away, ragged, back to the bill underneath */
	function torn(left: boolean) {
		const from = 45 + r() * 35;
		const to = 50 + r() * 35;
		const edge = Array.from({ length: 7 }, (_, i) => {
			const t = i / 6;
			const jag = i % 2 ? 3 + r() * 5 : 0;
			const x = 100 - (100 - to) * t - jag;
			const y = from + (100 - from) * t - jag;
			return `${(left ? 100 - x : x).toFixed(0)}% ${y.toFixed(0)}%`;
		});
		return left
			? `polygon(0 0, 100% 0, 100% 100%, ${edge.reverse().join(', ')})`
			: `polygon(0 0, 100% 0, ${edge.join(', ')}, 0 100%)`;
	}

	type Bill = { id: number; src: string; tilt: number; shift: number; under: string; torn: string | null; fresh: boolean };
	let posters: string[] = [];
	// a shuffled deck, dealt afresh only once it runs out, so a poster comes
	// round again after every other one has; only the demo's few ever repeat
	let deck: string[] = [];
	function draw() {
		if (!deck.length) {
			deck = [...posters];
			for (let i = deck.length - 1; i > 0; i--) {
				const j = Math.floor(r() * (i + 1));
				[deck[i], deck[j]] = [deck[j], deck[i]];
			}
		}
		return deck.pop()!;
	}
	let dealt = 0;
	function bill(src: string, fresh = false): Bill {
		return {
			id: ++dealt,
			src,
			tilt: (r() - 0.5) * 5,
			shift: (r() - 0.5) * 10,
			under: pick(UNDER),
			torn: r() < 0.28 ? torn(r() < 0.5) : null,
			fresh
		};
	}

	let wall = $state<HTMLElement>();
	let bills = $state<Bill[]>([]);
	onMount(() => {
		let gone = false;
		let timer: ReturnType<typeof setTimeout>;
		const later = () => (timer = setTimeout(paste, 9000 + r() * 14000));
		// over one somebody walking past would see
		const paste = () => {
			const seen = [...(wall?.children ?? [])].flatMap((el, i) => {
				const box = el.getBoundingClientRect();
				return box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth ? [i] : [];
			});
			const up = new Set(bills.map((b) => b.src));
			let src = draw();
			for (let i = 0; i < posters.length && up.has(src); i++) src = draw();
			if (seen.length) bills[pick(seen)] = bill(src, true);
			later();
		};
		fetch('/wall')
			.then((res) => res.json())
			.then((list: string[]) => {
				if (gone) return;
				posters = list;
				bills = Array.from({ length: COUNT }, () => bill(draw()));
				if (!reduced()) later();
			});
		return () => {
			gone = true;
			clearTimeout(timer);
		};
	});

	let flock = $state<{ id: number; y: number; seconds: number } | null>(null);
	const BIRDS = [
		{ x: 0, y: 0, d: 0 },
		{ x: 26, y: -10, d: -0.11 },
		{ x: 44, y: 6, d: -0.2 },
		{ x: 70, y: -4, d: -0.07 }
	];
	onMount(() => {
		if (reduced()) return;
		let timer: ReturnType<typeof setTimeout>;
		let id = 0;
		const fly = () => {
			flock = { id: ++id, y: innerHeight * (0.12 + Math.random() * 0.3), seconds: (innerWidth + 200) / 130 };
			timer = setTimeout(
				() => {
					flock = null;
					timer = setTimeout(fly, 30000 + Math.random() * 35000);
				},
				flock.seconds * 1000 + 200
			);
		};
		timer = setTimeout(fly, 7000 + Math.random() * 8000);
		return () => clearTimeout(timer);
	});
</script>

<div class="wall" aria-hidden="true">
	<div class="bills" bind:this={wall}>
		{#each bills as bill (bill.id)}
			<div
				class="bill"
				class:fresh={bill.fresh}
				style:--tilt="{bill.tilt}deg"
				style:--shift="{bill.shift}px"
				style:background={bill.under}
			>
				<img src={bill.src} alt="" loading="lazy" decoding="async" style:clip-path={bill.torn} />
			</div>
		{/each}
	</div>
	<div class="weather"></div>
</div>

<div class="sky" aria-hidden="true">
	{#if flock}
		{#key flock.id}
			<div class="flight" style:top="{flock.y}px" style:animation-duration="{flock.seconds}s">
				{#each BIRDS as bird, i (i)}
					<svg
						class="bird"
						viewBox="-16 -10 32 16"
						width="26"
						height="13"
						style:left="{bird.x}px"
						style:top="{bird.y}px"
						style:--d="{bird.d}s"
					>
						<path class="wing" d="M0 0Q-6-9-15-7-8-3 0 1z" />
						<path class="wing" d="M0 0Q6-9 15-7 8-3 0 1z" />
						<ellipse cx="0" cy="1" rx="5.4" ry="2.1" />
						<circle cx="-5.2" cy="0" r="1.8" />
					</svg>
				{/each}
			</div>
		{/key}
	{/if}
</div>

<style>
	.wall,
	.sky {
		position: fixed;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		pointer-events: none;
	}
	/* bills pasted edge to edge and over one another, a few rows more than any
	   screen is tall */
	.bills {
		position: absolute;
		inset: -24px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(max(112px, 8.4vw), 1fr));
		gap: 0;
		filter: saturate(0.55) brightness(0.6) contrast(1.05);
	}
	.bill {
		aspect-ratio: 18 / 25;
		margin: -4px;
		rotate: var(--tilt);
		translate: 0 var(--shift);
		box-shadow: 1px 2px 3px rgba(0, 0, 0, 0.5);
		animation: dealt 0.8s ease-out both;
	}
	/* brushed on from the top, and dark with paste until it dries */
	.bill.fresh {
		animation: pasted 1.4s ease-in-out both;
	}
	@keyframes dealt {
		from {
			opacity: 0;
		}
	}
	@keyframes pasted {
		from {
			clip-path: inset(0 0 100% 0);
			filter: brightness(0.6);
		}
		60% {
			clip-path: inset(0);
			filter: brightness(0.6);
		}
		to {
			clip-path: inset(0);
		}
	}
	.bill img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	/* the street's weather over all of it, and the column the page reads in
	   kept clear: the wall shows itself at the sides, where nothing is said */
	.weather {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(
				90deg,
				color-mix(in srgb, var(--bg) 30%, transparent),
				color-mix(in srgb, var(--bg) 78%, transparent) calc(50% - 300px),
				color-mix(in srgb, var(--bg) 78%, transparent) calc(50% + 300px),
				color-mix(in srgb, var(--bg) 30%, transparent)
			);
	}
	@media (max-width: 700px) {
		.weather {
			background: color-mix(in srgb, var(--bg) 70%, transparent);
		}
	}

	/* right to left across the window, rising and dipping as a flock does */
	.flight {
		position: absolute;
		left: 0;
		width: 100px;
		height: 30px;
		animation: cross linear both;
	}
	@keyframes cross {
		from {
			transform: translate(calc(100vw + 20px), 10px);
		}
		50% {
			transform: translate(50vw, -14px);
		}
		to {
			transform: translate(-140px, 4px);
		}
	}
	.bird {
		position: absolute;
		overflow: visible;
		fill: #12110f;
		filter: drop-shadow(0 0 1px rgba(230, 224, 207, 0.35));
	}
	.wing {
		transform-box: view-box;
		transform-origin: 0 0;
		animation: flap 0.26s ease-in-out var(--d) infinite alternate;
	}
	@keyframes flap {
		to {
			scale: 1 -0.5;
		}
	}
</style>
