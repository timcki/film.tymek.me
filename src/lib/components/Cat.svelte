<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * §3.6: a black cat among the pumpkins. It sits facing you, tail swishing,
	 * glowing eyes blinking slowly. Every so often it gets up and pads off along
	 * the ground to the right edge, stays away a while, and walks back to sit
	 * where it was. The parent places its seat; nothing here takes a pointer.
	 */
	type Pose = 'sit' | 'out' | 'away' | 'back';
	let pose = $state<Pose>('sit');
	let x = $state(0);
	let walkSeconds = $state(0);
	let el = $state<HTMLElement>();

	/** px per second, a cat that is going somewhere but not in a hurry */
	const PACE = 42;

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		let timer: ReturnType<typeof setTimeout>;
		const wait = (ms: number, fn: () => void) => (timer = setTimeout(fn, ms));
		const distance = () => {
			const box = el?.getBoundingClientRect();
			return box ? innerWidth - box.left + 40 : 400;
		};
		const wander = () => {
			const far = distance();
			walkSeconds = far / PACE;
			pose = 'out';
			x = far;
			wait(walkSeconds * 1000, () => {
				pose = 'away';
				wait(5000 + Math.random() * 9000, () => {
					pose = 'back';
					walkSeconds = far / PACE;
					x = 0;
					wait(walkSeconds * 1000, () => {
						pose = 'sit';
						wait(30000 + Math.random() * 35000, wander);
					});
				});
			});
		};
		wait(20000 + Math.random() * 25000, wander);
		return () => clearTimeout(timer);
	});
</script>

<span
	class="cat {pose}"
	bind:this={el}
	style:transform="translateX({x}px)"
	style:transition-duration="{pose === 'out' || pose === 'back' ? walkSeconds : 0}s"
	aria-hidden="true"
>
	{#if pose === 'sit'}
		<svg class="sitting" viewBox="0 0 30 34" width="30" height="34">
			<g class="tail"><path d="M21 31c4 .4 6.6-1.2 7-4.6.3-2.4-.8-4.2-2.4-5" /></g>
			<path
				class="fur"
				d="M15 12c-4.6 0-7.6 6.4-7.8 13.6-.1 3.4.6 6 1.8 7.4h12c1.2-1.4 1.9-4 1.8-7.4C22.6 18.4 19.6 12 15 12z"
			/>
			<circle class="fur" cx="15" cy="10" r="5.6" />
			<path class="fur" d="M10.2 7.4 9.6 1.6l4 3.6zM19.8 7.4l.6-5.8-4 3.6z" />
			<g class="eyes">
				<ellipse cx="12.9" cy="10" rx="1.1" ry="1.3" />
				<ellipse cx="17.1" cy="10" rx="1.1" ry="1.3" />
			</g>
		</svg>
	{:else if pose !== 'away'}
		<svg class="walking" class:left={pose === 'back'} viewBox="0 0 40 24" width="40" height="24">
			<!-- a leg apiece, each swinging from its own hip, in diagonal pairs -->
			<g class="legs a"><path d="M25.6 14v8" /></g>
			<g class="legs a"><path d="M9.6 14.6v7.4" /></g>
			<g class="legs b"><path d="M27.6 14v8" /></g>
			<g class="legs b"><path d="M11.6 14.6v7.4" /></g>
			<path
				class="fur"
				d="M8 9c3-2.4 14-2.6 19-1.2 2 .6 3.2 2.2 3 4-.2 2.2-2.2 3.4-4.6 3.6L10 16c-2.6-.2-4-1.6-4-3.6 0-1.4.8-2.6 2-3.4z"
			/>
			<circle class="fur" cx="31" cy="7" r="4.2" />
			<path class="fur" d="M28.6 4.4l-.2-3.6 2.6 2.2zM32.6 3.6l1.6-3 .8 3.4z" />
			<g class="tail"><path d="M8 10c-3-.4-5.4-2.6-5.8-6" /></g>
			<g class="eyes"><ellipse cx="33" cy="6.6" rx="0.9" ry="1" /></g>
		</svg>
	{/if}
</span>

<style>
	.cat {
		display: inline-flex;
		align-items: flex-end;
		height: 34px;
		transition-property: transform;
		transition-timing-function: linear;
	}
	svg {
		display: block;
		overflow: visible;
	}
	.fur {
		fill: var(--cat, #0d0a0c);
	}
	.tail path,
	.legs path {
		fill: none;
		stroke: var(--cat, #0d0a0c);
		stroke-linecap: round;
	}
	.tail path {
		stroke-width: 2.2;
	}
	.legs path {
		stroke-width: 2;
	}
	/* eyes that catch the pumpkin light, and blink slowly now and then */
	.eyes {
		fill: #d4f064;
		filter: drop-shadow(0 0 1.5px rgba(212, 240, 100, 0.9));
		transform-box: fill-box;
		transform-origin: 50% 50%;
		animation: blink 6s infinite;
	}
	@keyframes blink {
		0%,
		91%,
		100% {
			transform: scaleY(1);
		}
		94% {
			transform: scaleY(0.1);
		}
	}
	/* sitting, the tail sweeps lazily from side to side */
	.sitting .tail {
		transform-box: fill-box;
		transform-origin: 0% 100%;
		animation: swish 3.4s ease-in-out infinite;
	}
	@keyframes swish {
		0%,
		100% {
			transform: rotate(-10deg);
		}
		50% {
			transform: rotate(14deg);
		}
	}
	/* walking, the legs go in diagonal pairs and the tail rides high */
	.walking.left {
		transform: scaleX(-1);
	}
	.legs {
		transform-box: fill-box;
		transform-origin: 50% 0;
	}
	.legs.a {
		animation: step 0.5s ease-in-out infinite alternate;
	}
	.legs.b {
		animation: step 0.5s ease-in-out infinite alternate-reverse;
	}
	@keyframes step {
		from {
			transform: rotate(-16deg);
		}
		to {
			transform: rotate(16deg);
		}
	}
	.walking .tail {
		transform-box: fill-box;
		transform-origin: 100% 100%;
		animation: swish 1s ease-in-out infinite;
	}
	@media (prefers-reduced-motion: reduce) {
		.eyes,
		.sitting .tail {
			animation: none;
		}
	}
</style>
