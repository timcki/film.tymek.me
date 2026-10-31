<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { lights } from '$lib/lights';

	/**
	 * §3.6: a string of lights along the top of the screen, sagging in swags,
	 * with something hanging off a few of its peaks. `hues` go round the bulbs in
	 * turn; `dying` leaves a few of them faltering, which is what makes the rest
	 * look haunted. When the room hears a ballot land (lights.flicker) a wave
	 * runs along the string, left to right: on a `shiver` the bulbs falter and
	 * come back, on a `chase` they flare one after another.
	 */
	let {
		hues,
		dying = false,
		wave = 'shiver',
		perch
	}: { hues: string[]; dying?: boolean; wave?: 'shiver' | 'chase'; perch: Snippet } = $props();

	/** one bulb every SPACE px, sagging in swags of SWAG bulbs */
	const SPACE = 34;
	const SWAG = 4;
	const BULBS = 60;
	const sag = (t: number) => 3 + 36 * t * (1 - t);
	const width = BULBS * SPACE;
	const wire = Array.from({ length: BULBS / SWAG }, (_, k) => {
		const x0 = k * SWAG * SPACE;
		const x1 = x0 + SWAG * SPACE;
		return `M${x0} 3Q${(x0 + x1) / 2} 21 ${x1} 3`;
	}).join('');
	const bulbs = $derived(
		Array.from({ length: BULBS }, (_, i) => {
			const t = ((i % SWAG) + 0.5) / SWAG;
			return {
				x: Math.floor(i / SWAG) * SWAG * SPACE + t * SWAG * SPACE,
				y: sag(t),
				hue: hues[i % hues.length],
				dying: dying && i % 13 === 7,
				delay: -((i * 0.73) % 4)
			};
		})
	);

	// whatever hangs here hangs from the wire's peaks, a few of them spread
	// across the window; the peaks fall every swag, so a narrow phone may have
	// room for fewer
	let roosts = $state<number[]>([]);
	onMount(() => {
		const swag = SWAG * SPACE;
		const peaks = [0.2, 0.52, 0.8]
			.map((at) => Math.round((innerWidth * at) / swag) * swag)
			.filter((x) => x > 16 && x < innerWidth - 16);
		roosts = [...new Set(peaks)];
	});

	// the wave along the string: off again once it has reached the far end
	let waving = $state(false);
	onMount(() => {
		let timer: ReturnType<typeof setTimeout>;
		lights.flicker = () => {
			clearTimeout(timer);
			waving = false;
			requestAnimationFrame(() => {
				waving = true;
				timer = setTimeout(() => (waving = false), 1600);
			});
		};
		return () => {
			clearTimeout(timer);
			lights.flicker = () => {};
		};
	});
</script>

<div class="lights {wave}" class:waving aria-hidden="true">
	<svg {width} height="34" viewBox="0 0 {width} 34">
		<defs>
			<filter id="hglow" x="-150%" y="-100%" width="400%" height="300%">
				<feGaussianBlur stdDeviation="2.4" result="blur" />
				<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
			</filter>
		</defs>
		<path class="wire" d={wire} />
		{#each bulbs as bulb, i (i)}
			<g transform="translate({bulb.x} {bulb.y})">
				<rect class="socket" x="-1.8" y="0" width="3.6" height="3.6" rx="0.8" />
				<ellipse
					class="bulb"
					class:dying={bulb.dying}
					cx="0"
					cy="8"
					rx="3"
					ry="4.6"
					fill={bulb.hue}
					filter="url(#hglow)"
					style="animation-delay:{bulb.delay}s;--i:{i}"
				/>
			</g>
		{/each}
	</svg>
	{#each roosts as x (x)}
		<span class="perch" style:left="{x - 10}px">{@render perch()}</span>
	{/each}
</div>

<style>
	/* fixed over the top of the screen, so it stays strung while the page
	   scrolls. Its first 18px are solid page colour, which is where the
	   wire runs and what the sticky header parks under (themes.css), so nothing
	   scrolls into view behind the wire; the bulbs hang over the header below it */
	.lights {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 34px;
		background: linear-gradient(var(--bg) 0 18px, transparent 18px);
		overflow: hidden;
		pointer-events: none;
		z-index: 60;
	}
	.wire {
		fill: none;
		stroke: color-mix(in srgb, var(--ink) 30%, var(--bg));
		stroke-width: 1.2;
	}
	.socket {
		fill: color-mix(in srgb, var(--ink) 35%, var(--bg));
	}
	.bulb {
		animation: glow 4s ease-in-out infinite;
	}
	.bulb.dying {
		animation: dying 2.7s steps(1) infinite;
	}
	@keyframes glow {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.62;
		}
	}
	/* something walked past: the bulbs falter one after another along the
	   string, left to right, and come back */
	.shiver.waving .bulb,
	.shiver.waving .bulb.dying {
		animation: shiver 0.55s steps(1) calc(var(--i) * 14ms) both;
	}
	@keyframes shiver {
		0%,
		100% {
			opacity: 1;
		}
		18% {
			opacity: 0.12;
		}
		34% {
			opacity: 0.85;
		}
		52% {
			opacity: 0.05;
		}
		78% {
			opacity: 0.7;
		}
	}
	/* good news going down the line: each bulb flares white-hot and settles */
	.chase.waving .bulb {
		animation: chase 0.7s ease-out calc(var(--i) * 14ms) both;
	}
	@keyframes chase {
		30% {
			opacity: 1;
			fill: #fff6dc;
		}
	}
	@keyframes dying {
		0%,
		100% {
			opacity: 0.9;
		}
		12% {
			opacity: 0.12;
		}
		16% {
			opacity: 0.8;
		}
		19% {
			opacity: 0.1;
		}
		55% {
			opacity: 0.15;
		}
		61% {
			opacity: 0.85;
		}
	}
	/* where the hanging thing holds on to the wire */
	.perch {
		position: absolute;
		top: 3px;
	}

	@media (prefers-reduced-motion: reduce) {
		.bulb,
		.bulb.dying,
		.waving .bulb,
		.waving .bulb.dying {
			animation: none;
		}
	}
</style>
