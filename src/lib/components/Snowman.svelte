<script lang="ts">
	/**
	 * §3.6: a snowman, Christmas's cat: it stands about at the foot of the page,
	 * blinks now and then, and the end of its scarf lifts in the wind. `up`
	 * turns its eyes to the screen, for the room waiting on a result.
	 */
	let { size = 40, up = false }: { size?: number; up?: boolean } = $props();

	const id = $props.id();
</script>

<svg class="snowman" class:up width={size} height={size * 1.4} viewBox="0 0 40 56" aria-hidden="true">
	<defs>
		<radialGradient id="{id}-snow" cx="0.38" cy="0.32" r="0.8">
			<stop offset="0" stop-color="#ffffff" />
			<stop offset="0.7" stop-color="#e4edf4" />
			<stop offset="1" stop-color="#b9c9d6" />
		</radialGradient>
	</defs>
	<path class="arm" d="M12 24.6 3.4 18.6M6 20.4 3.6 22.4M5.8 20.2 5.4 16.8" />
	<path class="arm" d="M28 24.6 36.6 18.6M34 20.4 36.4 22.4M34.2 20.2 34.6 16.8" />
	<circle cx="20" cy="42.5" r="12.5" fill="url(#{id}-snow)" />
	<circle cx="20" cy="25.5" r="9" fill="url(#{id}-snow)" />
	<circle cx="20" cy="12" r="7" fill="url(#{id}-snow)" />
	<g class="coal">
		<circle cx="20" cy="22.6" r="1" />
		<circle cx="20" cy="26.2" r="1" />
		<circle cx="20" cy="29.8" r="1" />
		<circle cx="16.8" cy="15.4" r=".55" />
		<circle cx="18.4" cy="16.3" r=".55" />
		<circle cx="20.2" cy="16.6" r=".55" />
		<circle cx="22" cy="16.3" r=".55" />
		<circle cx="23.5" cy="15.4" r=".55" />
	</g>
	<g class="eyes">
		<circle cx="17.4" cy="10.4" r="1.05" />
		<circle cx="22.6" cy="10.4" r="1.05" />
	</g>
	<path class="nose" d="M20 12.2 26.8 13.8 20 14.6z" />
	<path class="scarf" d="M12.8 18.2c4.4 2.4 10 2.4 14.4 0l.7 2.6c-5 2.6-10.8 2.6-15.8 0z" />
	<path class="scarf tail" d="M22.6 20.4 24 29.4l3.4-.6-1.9-8.8z" />
	<g class="hat">
		<rect x="11.6" y="5" width="16.8" height="2.2" rx="1.1" />
		<rect x="14.4" y="-4.6" width="11.2" height="10.4" rx="1.2" />
		<rect class="band" x="14.4" y="2.4" width="11.2" height="2.2" />
	</g>
</svg>

<style>
	.snowman {
		display: inline-block;
		overflow: visible;
		filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35));
	}
	.arm {
		fill: none;
		stroke: #6b4a2e;
		stroke-width: 1.3;
		stroke-linecap: round;
	}
	.coal,
	.eyes,
	.hat {
		fill: #1b1d22;
	}
	.band {
		fill: #c8283a;
	}
	.nose {
		fill: #f08a2c;
	}
	.scarf {
		fill: #d6283a;
	}
	/* a slow blink, every few seconds */
	.eyes {
		transform-box: fill-box;
		transform-origin: 50% 50%;
		animation: blink 5.5s infinite;
	}
	@keyframes blink {
		0%,
		94%,
		100% {
			scale: 1 1;
		}
		97% {
			scale: 1 0.1;
		}
	}
	.up .eyes {
		translate: 0 -1.6px;
	}
	/* the wind catching the loose end of the scarf */
	.tail {
		transform-box: fill-box;
		transform-origin: 30% 0;
		animation: flutter 3.4s ease-in-out infinite;
	}
	@keyframes flutter {
		0%,
		100% {
			rotate: 0deg;
		}
		40% {
			rotate: -16deg;
		}
		55% {
			rotate: -8deg;
		}
		70% {
			rotate: -18deg;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.eyes,
		.tail {
			animation: none;
		}
	}
</style>
