<script lang="ts">
	let {
		count = 24,
		duration = 1500,
		onDone
	}: { count?: number; duration?: number; onDone?: () => void } = $props();

	const still =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	// small palette around the accent; paper both ways up
	const colours = ['var(--accent)', '#e8b04b', '#5ab0f0', '#e06a8a', '#7bd08a', '#c9a2f0'];

	// each particle gets its trajectory as inline custom properties, so one
	// keyframe animation serves them all
	const bits = $derived(
		still
			? []
			: Array.from({ length: count }, (_, i) => {
					const dur = 0.9 + Math.random() * (duration / 1000 - 0.9);
					return `
						--x: ${15 + Math.random() * 70}vw;
						--dx: ${(Math.random() - 0.5) * 36}vw;
						--fall: ${70 + Math.random() * 40}vh;
						--rot: ${(Math.random() - 0.5) * 1440}deg;
						--w: ${5 + Math.random() * 4}px;
						--h: ${7 + Math.random() * 5}px;
						--clr: ${colours[i % colours.length]};
						--delay: ${Math.random() * 0.25}s;
						--dur: ${dur}s;
					`;
				})
	);

	$effect(() => {
		const timer = setTimeout(() => onDone?.(), still ? 0 : duration + 300);
		return () => clearTimeout(timer);
	});
</script>

{#if bits.length}
	<div class="confetti" aria-hidden="true">
		{#each bits as style, i (i)}
			<i {style}></i>
		{/each}
	</div>
{/if}

<style>
	.confetti {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: 9999;
		overflow: hidden;
	}
	.confetti i {
		position: absolute;
		top: 0;
		left: var(--x);
		width: var(--w);
		height: var(--h);
		background: var(--clr);
		border-radius: 1px;
		opacity: 0;
		animation: confall var(--dur) cubic-bezier(0.25, 0.4, 0.6, 1) var(--delay) forwards;
	}
	@keyframes confall {
		0% {
			transform: translate(0, -6vh) rotate(0deg);
			opacity: 1;
		}
		80% {
			opacity: 1;
		}
		100% {
			transform: translate(var(--dx), var(--fall)) rotate(var(--rot));
			opacity: 0;
		}
	}
</style>
