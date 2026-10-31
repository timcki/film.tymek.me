<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import Poster from './Poster.svelte';
	import type { Look } from '$lib/themes';

	/**
	 * §7.3: one film's line in the count. Its bar is its points against the most
	 * any film could get, so it only ever grows; when a ballot gives it points the
	 * bar stretches, a "+2" rides out on its tip and drifts off, the tip flares,
	 * and the total counts up to its new figure rather than jumping there.
	 */
	let {
		title,
		poster,
		points,
		gain,
		stamp,
		most,
		leading,
		won,
		behind,
		look
	}: {
		title: string;
		poster: string | null;
		points: number;
		/** what the ballot that just landed gave this film */
		gain: number;
		/** which ballot that was, so the same gain twice still plays twice */
		stamp: number;
		most: number;
		leading: boolean;
		won: boolean;
		behind: boolean;
		look: Look | null;
	} = $props();

	const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const shown = new Tween(0, { duration: still ? 0 : 520, easing: cubicOut });
	$effect(() => {
		shown.target = points;
	});
</script>

<div class="lane" class:leading class:won class:behind data-look={look}>
	<span class="lposter"><Poster {title} url={poster} /></span>
	<b class="ltitle">{title}</b>
	<div class="track">
		<div class="fill" style:width="{(points / most) * 100}%">
			{#if gain > 0}
				{#key stamp}
					<span class="flare" aria-hidden="true"></span>
					<span class="gain" aria-hidden="true">+{gain}</span>
				{/key}
			{/if}
		</div>
	</div>
	<span class="score">{Math.round(shown.current)}</span>
</div>

<style>
	.lane {
		display: grid;
		grid-template-columns: 56px minmax(120px, 220px) minmax(0, 1fr) 92px;
		align-items: center;
		gap: 18px;
		padding: 12px 18px 12px 12px;
		border-radius: 20px;
		background: color-mix(in srgb, var(--sunk) 55%, transparent);
		transition: opacity 0.5s, box-shadow 0.5s;
	}
	.lane.won { box-shadow: inset 0 0 0 2px var(--accent), 0 0 40px -16px var(--accent); }
	.lane.behind { opacity: 0.55; }
	.lposter { width: 56px; aspect-ratio: 2/3; border-radius: 8px; overflow: hidden; background: var(--raise); }
	.lposter :global(img) { display: block; width: 100%; height: 100%; object-fit: cover; }
	.ltitle { font-size: 19px; line-height: 1.25; overflow-wrap: anywhere; }
	.track {
		position: relative;
		height: 30px;
		border-radius: 99px;
		background: color-mix(in srgb, var(--ink) 7%, transparent);
	}
	.fill {
		position: relative;
		height: 100%;
		min-width: 30px;
		border-radius: 99px;
		background: color-mix(in srgb, var(--accent) 50%, var(--card));
		transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1), background 0.5s, box-shadow 0.5s;
	}
	.lane.leading .fill,
	.lane.won .fill { background: var(--accent); }
	/* on Halloween the bars are lantern light: deep ember running into a bright
	   tip, and the one in front glowing */
	.lane[data-look='halloween'] .fill {
		background: linear-gradient(90deg, #7a2a08, color-mix(in srgb, var(--accent) 70%, #7a2a08));
	}
	.lane[data-look='halloween'].leading .fill,
	.lane[data-look='halloween'].won .fill {
		background: linear-gradient(90deg, #a8400c, var(--accent) 70%, #ffd27a);
		box-shadow: 0 0 22px -4px color-mix(in srgb, var(--accent) 80%, transparent);
	}
	/* at Christmas they are gold going warm toward the tip, and the one in front
	   lit like the string of lights */
	.lane[data-look='swieta'] .fill {
		background: linear-gradient(90deg, #6e5216, color-mix(in srgb, var(--accent) 70%, #6e5216));
	}
	.lane[data-look='swieta'].leading .fill,
	.lane[data-look='swieta'].won .fill {
		background: linear-gradient(90deg, #a07418, var(--accent) 70%, #fff0c4);
		box-shadow: 0 0 22px -4px color-mix(in srgb, var(--accent) 80%, transparent);
	}
	/* the tip lights up for a moment where the points went in */
	.flare {
		position: absolute;
		right: -6px;
		top: 50%;
		width: 42px;
		height: 42px;
		border-radius: 50%;
		translate: 0 -50%;
		background: radial-gradient(closest-side, rgba(255, 236, 190, 0.95), color-mix(in srgb, var(--accent) 60%, transparent) 55%, transparent);
		opacity: 0;
		pointer-events: none;
		animation: flare 0.9s ease-out;
	}
	@keyframes flare {
		0% { opacity: 0; scale: 0.4; }
		25% { opacity: 1; scale: 1.1; }
		100% { opacity: 0; scale: 1.5; }
	}
	/* what it just got, riding out on the tip and drifting off */
	.gain {
		position: absolute;
		left: 100%;
		top: 50%;
		margin-left: 12px;
		padding: 3px 10px;
		border-radius: 99px;
		background: var(--accent);
		color: var(--accent-ink);
		font-size: 17px;
		font-weight: 800;
		line-height: 1.2;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		translate: 0 -50%;
		opacity: 0;
		pointer-events: none;
		animation: gain 1.35s cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	@keyframes gain {
		0% { opacity: 0; transform: scale(0.5); }
		14% { opacity: 1; transform: scale(1.12); }
		24% { transform: scale(1); }
		70% { opacity: 1; transform: translateY(0); }
		100% { opacity: 0; transform: translateY(-16px); }
	}
	.score {
		text-align: right;
		font-size: 44px;
		font-weight: 800;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		transition: color 0.4s;
	}
	/* the winner's total takes one small bow as the bars settle */
	.lane.won .score { color: var(--accent); animation: bow 0.7s 0.9s cubic-bezier(0.34, 1.56, 0.64, 1); }
	@keyframes bow {
		40% { transform: scale(1.18); }
	}
	@media (max-width: 700px) {
		.lane { grid-template-columns: 44px minmax(0, 1fr) 64px; gap: 12px; }
		.lposter { width: 44px; }
		.track { grid-column: 1 / -1; grid-row: 2; }
		.score { font-size: 32px; }
	}
	@media (prefers-reduced-motion: reduce) {
		.fill, .lane { transition: none; }
		.flare, .gain { display: none; }
		.lane.won .score { animation: none; }
	}
</style>
