<script lang="ts">
	import Pumpkin from './Pumpkin.svelte';

	/**
	 * §3.6: "I want to watch this" on a special round's pick, as a lantern the
	 * viewer lights. The words sit beside a dark pumpkin; lighting it sets a flame
	 * going in its lid and spreads the light out from it until it fills the pill.
	 * The words never change with the state, the light does, so nothing reflows
	 * mid-animation. It is the form's submit button. Without the Halloween look
	 * the pumpkin is a plain tick, and the light spreads all the same.
	 */
	let {
		on,
		label,
		disabled = false,
		spooky = false
	}: { on: boolean; label: string; disabled?: boolean; spooky?: boolean } = $props();
</script>

<button class="lamp" class:on {disabled} aria-pressed={on}>
	<span class="fill" aria-hidden="true"></span>
	<span class="icon">
		{#if spooky}
			<Pumpkin size={21} lit={on} live />
		{:else}
			<svg class="tick" viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
				<circle cx="12" cy="12" r="9" />
				<path d="M8 12.5l2.7 2.7L16 9.8" />
			</svg>
		{/if}
	</span>
	<span class="words">{label}</span>
</button>

<style>
	.lamp {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 38px;
		padding: 0 16px 0 11px;
		border: 0;
		border-radius: 99px;
		overflow: hidden;
		isolation: isolate;
		font: inherit;
		cursor: pointer;
		color: var(--ink2);
		background: var(--raise);
		-webkit-tap-highlight-color: transparent;
		transition: transform 0.12s ease;
	}
	.lamp:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.lamp:active:not(:disabled) {
		transform: scale(0.96);
	}
	.icon {
		position: relative;
		z-index: 1;
		display: inline-flex;
	}
	.tick {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition: color 0.3s ease;
	}
	.on .tick {
		color: var(--accent-ink);
	}
	.words {
		position: relative;
		z-index: 1;
		font-size: 12.5px;
		font-weight: 650;
		white-space: nowrap;
		transition: color 0.3s ease;
	}
	.on .words {
		color: var(--accent-ink);
	}
	/* the light spreads out from the pumpkin until it fills the pill, a shade
	   deeper right round the lantern, enough for its own fire to stand out */
	.fill {
		position: absolute;
		inset: 0;
		z-index: 0;
		border-radius: inherit;
		background: radial-gradient(
			circle at 22px 50%,
			color-mix(in srgb, var(--accent) 74%, #5a1c00) 0 8px,
			var(--accent) 26px
		);
		clip-path: circle(0 at 22px 50%);
		transition: clip-path 0.5s cubic-bezier(0.4, 0, 0.2, 1);
	}
	.on .fill {
		clip-path: circle(170% at 22px 50%);
	}
	@media (prefers-reduced-motion: reduce) {
		.fill,
		.tick,
		.words {
			transition: none;
		}
	}
</style>
