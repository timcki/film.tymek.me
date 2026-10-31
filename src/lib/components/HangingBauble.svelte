<script lang="ts">
	import Bauble from './Bauble.svelte';

	/**
	 * §3.6: a bauble hung off the string of lights on a short ribbon, turning a
	 * little in the draught. Tap it and it spins on its ribbon and swings, the
	 * way one does on a tree when somebody walks past too close. The parent
	 * positions it: the ribbon starts at its own top edge.
	 */
	let spinning = $state(false);
	let timer: ReturnType<typeof setTimeout>;
	let el = $state<HTMLElement>();

	// decoration, so no button: the tap is wired up here rather than in markup
	$effect(() => {
		const node = el;
		if (!node) return;
		const onDown = () => {
			clearTimeout(timer);
			spinning = false;
			requestAnimationFrame(() => {
				spinning = true;
				timer = setTimeout(() => (spinning = false), 1500);
			});
		};
		node.addEventListener('pointerdown', onDown);
		return () => {
			clearTimeout(timer);
			node.removeEventListener('pointerdown', onDown);
		};
	});
</script>

<span class="hang" class:spinning bind:this={el} aria-hidden="true">
	<span class="ribbon"></span>
	<span class="glass"><Bauble size={18} /></span>
</span>

<style>
	.hang {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 20px;
		pointer-events: auto;
		cursor: pointer;
		transform-origin: 50% 0;
		animation: draught 4.6s ease-in-out infinite;
		-webkit-tap-highlight-color: transparent;
	}
	.ribbon {
		width: 1px;
		height: 5px;
		background: #c9a24a;
	}
	.glass {
		display: block;
		line-height: 0;
		margin-top: -2px;
	}
	@keyframes draught {
		0%,
		100% {
			rotate: -3deg;
		}
		50% {
			rotate: 3deg;
		}
	}
	.hang.spinning {
		animation: swing 1.5s ease-out;
	}
	/* round and round on the ribbon, which reads as the glass narrowing and
	   widening as it turns its edge to you */
	.spinning .glass {
		animation: spin 1.5s ease-out;
	}
	@keyframes swing {
		15% {
			rotate: 16deg;
		}
		38% {
			rotate: -11deg;
		}
		62% {
			rotate: 6deg;
		}
		84% {
			rotate: -2deg;
		}
	}
	@keyframes spin {
		0%,
		100% {
			scale: 1 1;
		}
		12%,
		37%,
		62% {
			scale: -1 1;
		}
		25%,
		50%,
		75% {
			scale: 1 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.hang,
		.hang.spinning,
		.spinning .glass {
			animation: none;
		}
	}
</style>
