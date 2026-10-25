<script lang="ts">
	/** §3.6: a skull for the ground strip, with a faint green glint in its sockets */
	let { size = 26 }: { size?: number } = $props();
</script>

<svg class="skull" width={size} height={size * 1.06} viewBox="0 0 32 34" aria-hidden="true">
	<path
		class="bone"
		d="M16 2C8 2 3 7.5 3 14.5c0 4.6 2 7.6 5 9.4V29c0 1.6 1.3 3 3 3h10c1.7 0 3-1.4 3-3v-5.1c3-1.8 5-4.8 5-9.4C29 7.5 24 2 16 2z"
	/>
	<ellipse class="hole" cx="10.6" cy="15.2" rx="3.7" ry="4.2" />
	<ellipse class="hole" cx="21.4" cy="15.2" rx="3.7" ry="4.2" />
	<circle class="glint" cx="11.2" cy="15.8" r="1" />
	<circle class="glint" cx="20.8" cy="15.8" r="1" />
	<path class="hole" d="M16 19.6 14 23.4h4z" />
	<path class="teeth" d="M12.5 27.2v4M16 27.2v4.5M19.5 27.2v4" />
</svg>

<style>
	.skull {
		display: inline-block;
		vertical-align: bottom;
	}
	.bone {
		fill: #e8e0cc;
	}
	.hole {
		fill: #1b1220;
	}
	.teeth {
		stroke: #1b1220;
		stroke-width: 1.3;
		stroke-linecap: round;
	}
	.glint {
		fill: #a6e36c;
		filter: drop-shadow(0 0 2px #a6e36c);
		animation: glint 5s infinite;
	}
	@keyframes glint {
		0%,
		62%,
		100% {
			opacity: 0;
		}
		70%,
		88% {
			opacity: 0.9;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.glint {
			animation: none;
			opacity: 0.6;
		}
	}
</style>
