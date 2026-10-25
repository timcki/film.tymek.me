<script lang="ts">
	import { onMount } from 'svelte';
	import { batSky } from '$lib/bat-sky';

	/**
	 * §3.6: a bat hanging upside down from whatever its parent hangs it off,
	 * wings wrapped round it, swaying. Now and then it stretches a wing or shifts
	 * its grip; tap it, or scroll fast while it is in view, and it lets go and
	 * flies off into the sky, and a while later one flutters back and settles.
	 * The parent positions it: its feet are at its own top edge.
	 */
	let roost = $state<'hanging' | 'dropping' | 'away' | 'landing'>('hanging');
	let stretching = $state(false);
	let shifting = $state(false);
	let el = $state<HTMLElement>();
	let drop = () => {};

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const timers = new Set<ReturnType<typeof setTimeout>>();
		const later = (ms: number, fn: () => void) => {
			const t = setTimeout(() => {
				timers.delete(t);
				fn();
			}, ms);
			timers.add(t);
		};
		const fidget = () => {
			if (roost === 'hanging') {
				if (Math.random() < 0.6) {
					stretching = true;
					later(1700, () => (stretching = false));
				} else {
					shifting = true;
					later(600, () => (shifting = false));
				}
			}
			later(5000 + Math.random() * 8000, fidget);
		};
		later(2000 + Math.random() * 6000, fidget);

		drop = () => {
			if (roost !== 'hanging' || !el) return;
			const box = el.getBoundingClientRect();
			roost = 'dropping';
			later(320, () => {
				roost = 'away';
				batSky.release(box.left + box.width / 2, box.top + box.height / 2 + 10);
				later(25000 + Math.random() * 20000, () => {
					roost = 'landing';
					later(1300, () => (roost = 'hanging'));
				});
			});
		};

		// a quick scroll startles it, if it is anywhere you could see it
		let lastY = scrollY;
		let lastT = performance.now();
		const onScroll = () => {
			const now = performance.now();
			const speed = Math.abs(scrollY - lastY) / Math.max(1, now - lastT);
			lastY = scrollY;
			lastT = now;
			if (speed <= 3 || !el) return;
			const box = el.getBoundingClientRect();
			if (box.bottom > 0 && box.top < innerHeight) drop();
		};
		addEventListener('scroll', onScroll, { passive: true });
		return () => {
			removeEventListener('scroll', onScroll);
			for (const t of timers) clearTimeout(t);
		};
	});

	// decoration, so no button: the tap is wired up here rather than in markup
	$effect(() => {
		const node = el;
		if (!node) return;
		const onDown = () => drop();
		node.addEventListener('pointerdown', onDown);
		return () => node.removeEventListener('pointerdown', onDown);
	});
</script>

{#if roost !== 'away'}
	<span class="roost {roost}" class:stretching class:shifting bind:this={el} aria-hidden="true">
		<svg viewBox="0 0 16 24" width="16" height="24">
			<path class="feet" d="M6.6 0.2c0 1.6.5 3 1 3.8M9.4 0.2c0 1.6-.5 3-1 3.8" />
			<path class="stretch" d="M5.2 8.6C1.6 7.6-1.8 10.4-1.2 15.6c1.4-1.1 2.6-.6 3.2.9.9-1.4 2.1-1.4 2.9 0z" />
			<path class="cloak" d="M8 4.4c-3.4 0-5 3-5 6.8 0 4.2 2 7.8 5 9.6 3-1.8 5-5.4 5-9.6 0-3.8-1.6-6.8-5-6.8z" />
			<path class="fold" d="M8 6.2v12.4M5.4 8.4c.6 3 1.2 6 2.6 9M10.6 8.4c-.6 3-1.2 6-2.6 9" />
			<circle class="head" cx="8" cy="20.2" r="2.3" />
			<path class="head" d="M6.5 21.5 5.6 23.6l1.9-1.2zM9.5 21.5l.9 2.1-1.9-1.2z" />
		</svg>
	</span>
{/if}

<style>
	.roost {
		display: block;
		width: 20px;
		height: 26px;
		padding: 0 2px;
		pointer-events: auto;
		cursor: pointer;
		transform-origin: 50% 0;
		animation: sway 4.2s ease-in-out infinite;
		-webkit-tap-highlight-color: transparent;
	}
	.roost svg {
		display: block;
		overflow: visible;
		filter: var(--bat-rim, none);
	}
	.feet {
		fill: none;
		stroke: var(--bat-body);
		stroke-width: 1.1;
		stroke-linecap: round;
	}
	.cloak,
	.stretch {
		fill: var(--bat-wing);
	}
	.fold {
		fill: none;
		stroke: var(--bat-body);
		stroke-width: 0.6;
		opacity: 0.7;
	}
	.head {
		fill: var(--bat-body);
	}
	.stretch {
		transform-box: fill-box;
		transform-origin: 100% 0;
		transform: scale(0);
	}
	.stretching .stretch {
		animation: stretch 1.7s ease-in-out;
	}
	.roost.shifting {
		animation: shift 0.6s ease-in-out;
	}
	.roost.dropping {
		animation: letgo 0.32s ease-in forwards;
	}
	.roost.landing {
		animation: settle 1.3s ease-out;
	}
	@keyframes sway {
		0%,
		100% {
			transform: rotate(-3deg);
		}
		50% {
			transform: rotate(3deg);
		}
	}
	@keyframes stretch {
		0%,
		100% {
			transform: scale(0);
		}
		30%,
		70% {
			transform: scale(1);
		}
		45% {
			transform: scale(1, 0.85);
		}
	}
	@keyframes shift {
		0%,
		100% {
			transform: rotate(0deg);
		}
		30% {
			transform: rotate(-9deg) translateY(1px);
		}
		65% {
			transform: rotate(6deg);
		}
	}
	@keyframes letgo {
		to {
			transform: translateY(14px) rotate(180deg);
			opacity: 0;
		}
	}
	@keyframes settle {
		0% {
			transform: translateY(-10px) scale(0.6);
			opacity: 0;
		}
		40% {
			opacity: 1;
		}
		70% {
			transform: translateY(1px) scale(1.05);
		}
		100% {
			transform: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.roost,
		.stretch {
			animation: none;
		}
	}
</style>
