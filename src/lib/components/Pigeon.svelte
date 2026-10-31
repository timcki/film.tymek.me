<script lang="ts">
	/**
	 * §3.6: a Warsaw pigeon, the PRL look's resident and its lantern, side on
	 * and facing left. It sits and bobs, which is all a pigeon on a wire ever
	 * does.
	 *
	 * As a vote, `lit` is the vote cast: unlit it is a grey one hunched against
	 * the cold, lit it sits up with its neck shining. `live` is for one somebody
	 * switches: lighting it gets a flap of the wings and a hop, putting it out a
	 * ruffle. `carve` is the place in the room's ranking, stamped on the ring
	 * round its leg the way a racing pigeon wears its number.
	 */
	let {
		size = 32,
		lit = true,
		live = false,
		carve
	}: { size?: number; lit?: boolean; live?: boolean; carve?: string } = $props();

	const id = $props.id();

	let lifts = $state(0);
	let drops = $state(0);
	let was: boolean | null = null;
	$effect(() => {
		const now = lit;
		if (was !== null && now !== was) {
			if (now) lifts += 1;
			else drops += 1;
		}
		was = now;
	});
</script>

<svg
	class="pigeon"
	class:dim={!lit}
	width={size}
	height={size * 0.75}
	viewBox="0 0 32 24"
	aria-hidden="true"
>
	<defs>
		<linearGradient id="{id}-neck" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#4c8f80" />
			<stop offset="1" stop-color="#7a5a90" />
		</linearGradient>
	</defs>
	{#key `${lifts}-${drops}`}
		<g class="bird" class:hop={live && lifts > 0 && lit} class:ruffle={live && drops > 0 && !lit}>
			<path class="leg" d="M15.6 18.4 15 22.4h-1.6M15 22.4h1.4M19 18.4v4h-1.4M19 22.4h1.4" />
			<path class="tail" d="M22 11.4 31.4 9.6 30.6 14.4 22.6 15.4z" />
			<ellipse class="body" cx="17" cy="13.4" rx="8.6" ry="5.6" />
			<g class="wing">
				<path d="M12 11.4q8-4.6 15.4-.2-5.8 4.6-14.2 3z" />
				<path class="bar" d="M17 11.2l3.6 2.2M20.6 10.6l3.4 2.4" />
			</g>
			<g class="head">
				<path d="M8.4 5.4Q6 11 9.6 16l5-3.6Q12.2 8.6 11.8 5z" fill="url(#{id}-neck)" />
				<circle class="skull" cx="8.6" cy="5.4" r="3.3" />
				<path class="beak" d="M5.6 5.2 3 6.4l2.6.6z" />
				<circle class="cere" cx="5.9" cy="5" r="0.6" />
				<circle class="eye" cx="7.8" cy="4.8" r="0.85" />
				<circle cx="7.7" cy="4.8" r="0.38" fill="#1d1a16" />
			</g>
			{#if carve}
				<g class="ring">
					<circle cx="24.6" cy="18" r="6.4" />
					<text x="24.6" y="21">{carve}</text>
				</g>
			{/if}
		</g>
	{/key}
</svg>

<style>
	.pigeon {
		display: inline-block;
		vertical-align: bottom;
		overflow: visible;
	}
	.leg {
		fill: none;
		stroke: #d9707a;
		stroke-width: 0.9;
		stroke-linecap: round;
	}
	.tail {
		fill: #5d626c;
	}
	.body {
		fill: #8a909a;
	}
	.wing {
		fill: #a3a9b2;
		transform-box: view-box;
		transform-origin: 13px 12px;
	}
	.bar {
		stroke: #3b3e44;
		stroke-width: 1.1;
		stroke-linecap: round;
	}
	.skull {
		fill: #7a808c;
	}
	.beak {
		fill: #3b3b3b;
	}
	.cere {
		fill: #f1ece2;
	}
	.eye {
		fill: #e8742a;
	}
	.head {
		transform-box: view-box;
		transform-origin: 12px 14px;
		animation: bob 2.6s ease-in-out infinite;
	}
	@keyframes bob {
		0%,
		100% {
			translate: 0 0;
		}
		50% {
			translate: 0.6px 0.5px;
		}
	}
	/* nobody's vote yet: grey all through, hunched, head drawn in */
	.bird {
		transition: filter 0.35s ease, opacity 0.35s ease;
	}
	.dim .bird {
		filter: grayscale(1) brightness(1.05);
		opacity: 0.5;
	}
	.dim .head {
		animation: none;
		translate: 1.4px 1.8px;
	}
	.ring circle {
		fill: var(--accent);
		stroke: #fff;
		stroke-width: 0.8;
	}
	.ring text {
		font: 900 8.4px/1 ui-sans-serif, system-ui, sans-serif;
		text-anchor: middle;
		font-variant-numeric: tabular-nums;
		fill: var(--accent-ink);
	}
	/* a vote cast: up off the wire for a beat of the wings, and back down */
	.hop {
		animation: hop 0.6s ease-out;
	}
	@keyframes hop {
		35% {
			translate: 0 -3px;
		}
	}
	.hop .wing {
		animation: beat 0.3s ease-in-out 2;
	}
	@keyframes beat {
		50% {
			rotate: -40deg;
		}
	}
	/* taken back: a shake of the feathers, and it settles grey */
	.ruffle {
		animation: ruffle 0.5s ease-out;
	}
	@keyframes ruffle {
		20%,
		60% {
			translate: -0.8px 0;
		}
		40%,
		80% {
			translate: 0.8px 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.head,
		.hop,
		.hop .wing,
		.ruffle {
			animation: none;
		}
		.bird {
			transition: none;
		}
	}
</style>
