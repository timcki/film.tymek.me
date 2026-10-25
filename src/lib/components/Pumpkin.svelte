<script lang="ts">
	/**
	 * §3.6: a jack-o'-lantern, drawn rather than typed, so it is the same pumpkin
	 * on every phone. The face is lit from inside and flickers like a candle
	 * unless asked not to; `lit` off leaves it carved and dark.
	 *
	 * `live` is for a lantern somebody switches: while lit, a flame burns out of
	 * its top; lighting it flares the face and sends a few embers up from the
	 * stem, putting it out lets a curl of smoke rise. The one-shot effects never
	 * play for the state it was first drawn in, only for a change.
	 *
	 * `carve` cuts a number into it in place of the face, the way the room's
	 * ranking wears its places: dark while it is only the place a tap would give,
	 * glowing once the film has it.
	 */
	let {
		size = 32,
		lit = true,
		live = false,
		carve
	}: { size?: number; lit?: boolean; live?: boolean; carve?: string } = $props();

	// how many times it has been lit and put out since it was drawn; keys the
	// one-shot embers and smoke so each change plays them afresh
	let lightings = $state(0);
	let snuffs = $state(0);
	let was: boolean | null = null;
	$effect(() => {
		const now = lit;
		if (was !== null && now !== was) {
			if (now) lightings += 1;
			else snuffs += 1;
		}
		was = now;
	});
</script>

<svg
	class="pumpkin"
	class:lit
	class:flare={live && lightings > 0}
	width={size}
	height={size * 0.9}
	viewBox="0 0 40 36"
	aria-hidden="true"
>
	{#if live && lit}
		<g class="flame" class:catching={lightings > 0}>
			<path class="outer" d="M20 10.5C14 8.8 13.6 2.6 20-7c6.4 9.6 6 15.8 0 17.5z" />
			<path class="inner" d="M20 10C16.8 8.8 16.6 5.4 20 .4c3.4 5 3.2 8.4 0 9.6z" />
		</g>
	{/if}
	<path class="stem" d="M18.6 7.5c.2-3 1.4-5.4 4.6-6.8l1.2 2c-2.4 1-3.1 2.6-3.2 4.9z" />
	<g class="body">
		<ellipse class="rind dark" cx="12.5" cy="21.5" rx="10.5" ry="12.5" />
		<ellipse class="rind dark" cx="27.5" cy="21.5" rx="10.5" ry="12.5" />
		<ellipse class="rind" cx="20" cy="21.5" rx="10" ry="13.5" />
	</g>
	<g class="face">
		{#if carve}
			<text class="carved" x="20" y="27.6">{carve}</text>
		{:else}
		<path d="M10.5 18.2 14.6 13l3.2 5.6z" />
		<path d="M29.5 18.2 25.4 13l-3.2 5.6z" />
		<path d="M18.6 22.4 20 20l1.4 2.4z" />
		<path
			d="M9.6 24.4c4.6 6.8 16.2 6.8 20.8 0l-3 .9-1.3 2.3-2.4-1.6-2.1 2.4-1.6-2.1-1.6 2.1-2.1-2.4-2.4 1.6-1.3-2.3z"
		/>
		{/if}
	</g>
	{#if live}
		{#key lightings}
			{#if lightings && lit}
				<g class="embers">
					<circle cx="17" cy="6" r="0.9" style="--dx:-4px;--d:0s" />
					<circle cx="21" cy="5" r="0.7" style="--dx:2px;--d:.08s" />
					<circle cx="24" cy="6.5" r="0.8" style="--dx:5px;--d:.16s" />
					<circle cx="19" cy="7" r="0.6" style="--dx:-1px;--d:.24s" />
					<circle cx="22.5" cy="7.5" r="0.6" style="--dx:3px;--d:.32s" />
				</g>
			{/if}
		{/key}
		{#key snuffs}
			{#if snuffs && !lit}
				<path class="smoke" d="M20 8c-2.6-2.4 2.6-4.2 0-7.2s2.4-4.6 0-7.4" />
			{/if}
		{/key}
	{/if}
</svg>

<style>
	.pumpkin {
		display: inline-block;
		vertical-align: middle;
		overflow: visible;
	}
	.stem {
		fill: #5d6b2c;
	}
	.rind {
		fill: #f08a2c;
	}
	.rind.dark {
		fill: #c9581a;
	}
	/* a pumpkin with no candle in it is a duller thing */
	.body {
		transition: filter 0.4s ease;
		filter: saturate(0.7) brightness(0.78);
	}
	.lit .body {
		filter: none;
	}
	.carved {
		font: 800 15px/1 ui-sans-serif, system-ui, sans-serif;
		text-anchor: middle;
		font-variant-numeric: tabular-nums;
	}
	.face {
		fill: #2a1206;
		transition: fill 0.3s ease;
	}
	.lit .face {
		fill: #ffd56b;
		filter: drop-shadow(0 0 2.5px rgba(255, 190, 70, 0.9));
		animation: candle 3.2s infinite;
	}
	/* catching: a bright flare that settles back into the candle */
	.flare.lit .face {
		animation:
			catch 0.55s ease-out,
			candle 3.2s 0.55s infinite;
	}
	@keyframes catch {
		0% {
			opacity: 0.2;
			filter: drop-shadow(0 0 0 rgba(255, 190, 70, 0));
		}
		45% {
			opacity: 1;
			fill: #fff3c4;
			filter: drop-shadow(0 0 6px rgba(255, 210, 110, 1));
		}
		100% {
			filter: drop-shadow(0 0 2.5px rgba(255, 190, 70, 0.9));
		}
	}
	@keyframes candle {
		0%,
		100% {
			opacity: 1;
		}
		8% {
			opacity: 0.78;
		}
		11% {
			opacity: 0.95;
		}
		43% {
			opacity: 0.86;
		}
		47% {
			opacity: 1;
		}
		71% {
			opacity: 0.7;
		}
		74% {
			opacity: 0.92;
		}
	}
	/* a flame licking out of the lid: tall and thin, leaning and shrinking on an
	   uneven beat, rooted at its base so it flickers rather than bounces */
	.flame {
		transform-box: fill-box;
		transform-origin: 50% 100%;
		filter: drop-shadow(0 0 2px rgba(255, 160, 50, 0.9));
		animation: burn 1.3s ease-in-out infinite;
	}
	.flame.catching {
		animation:
			kindle 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
			burn 1.3s ease-in-out 0.4s infinite;
	}
	.flame .outer {
		fill: #ff7a1a;
	}
	.flame .inner {
		fill: #ffe08a;
	}
	@keyframes kindle {
		from {
			transform: scale(0.1, 0);
			opacity: 0;
		}
		to {
			transform: scale(1, 1);
			opacity: 1;
		}
	}
	@keyframes burn {
		0%,
		100% {
			transform: scale(1, 1) skewX(0deg);
		}
		22% {
			transform: scale(0.92, 1.12) skewX(-6deg);
		}
		47% {
			transform: scale(1.05, 0.9) skewX(4deg);
		}
		71% {
			transform: scale(0.95, 1.08) skewX(-3deg);
		}
	}
	.embers circle {
		fill: #ffb347;
		opacity: 0;
		animation: ember 0.9s ease-out var(--d) forwards;
	}
	@keyframes ember {
		0% {
			opacity: 1;
			transform: translate(0, 0);
		}
		100% {
			opacity: 0;
			transform: translate(var(--dx), -13px);
		}
	}
	.smoke {
		fill: none;
		stroke: rgba(200, 190, 210, 0.55);
		stroke-width: 1.3;
		stroke-linecap: round;
		opacity: 0;
		animation: smoke 1.2s ease-out forwards;
	}
	@keyframes smoke {
		0% {
			opacity: 0.7;
			transform: translateY(2px) scaleY(0.6);
		}
		100% {
			opacity: 0;
			transform: translateY(-6px) scaleY(1.1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.lit .face,
		.flare.lit .face {
			animation: none;
		}
		.body,
		.face {
			transition: none;
		}
		.embers,
		.smoke {
			display: none;
		}
		.flame,
		.flame.catching {
			animation: none;
		}
	}
</style>
