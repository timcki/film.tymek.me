<script lang="ts">
	import { DOTS, MAP_HEIGHT, MAP_WIDTH, SHAPES } from '$lib/world-map';

	/**
	 * Where the films were made, as a map shaded by how many came from each
	 * country. The square root keeps one country with twenty films from washing
	 * every country with two out to the same pale. A country too small to draw
	 * at this scale is a dot, and only once something we watched came from it.
	 */
	let {
		counts,
		names,
		lit = null,
		onpick = null
	}: {
		/** films per ISO alpha-2 code */
		counts: Record<string, number>;
		names: (code: string) => string;
		lit?: string | null;
		onpick?: ((code: string) => void) | null;
	} = $props();

	const top = $derived(Math.max(1, ...Object.values(counts)));
	const shade = (code: string) => {
		const n = counts[code] ?? 0;
		if (!n) return 'var(--line2)';
		const share = Math.round(25 + 75 * Math.sqrt(n / top));
		return `color-mix(in srgb, var(--accent) ${share}%, var(--sunk))`;
	};
	const dots = $derived(Object.entries(DOTS).filter(([code]) => counts[code]));
	const label = (code: string) => `${names(code)}: ${counts[code] ?? 0}`;
</script>

<svg
	class="world"
	class:picking={lit !== null}
	viewBox="0 0 {MAP_WIDTH} {MAP_HEIGHT}"
	role="group"
	aria-label={Object.keys(counts).map(label).join(', ')}
>
	{#each Object.entries(SHAPES) as [code, d] (code)}
		{#if counts[code] && onpick}
			<path
				{d}
				fill={shade(code)}
				class="on"
				class:lit={lit === code}
				role="button"
				tabindex="-1"
				aria-label={label(code)}
				onclick={() => onpick(code)}
				onkeydown={(event) => event.key === 'Enter' && onpick(code)}
				><title>{label(code)}</title></path
			>
		{:else}
			<path {d} fill={shade(code)} />
		{/if}
	{/each}
	{#each dots as [code, [x, y]] (code)}
		<circle
			cx={x}
			cy={y}
			r="5"
			fill={shade(code)}
			class="on dot"
			class:lit={lit === code}
			role="button"
			tabindex="-1"
			aria-label={label(code)}
			onclick={() => onpick?.(code)}
			onkeydown={(event) => event.key === 'Enter' && onpick?.(code)}
			><title>{label(code)}</title></circle
		>
	{/each}
</svg>

<style>
	.world {
		display: block;
		width: 100%;
		height: auto;
		margin: 6px 0 10px;
	}
	path {
		stroke: var(--card);
		stroke-width: 0.6;
		stroke-linejoin: round;
	}
	.on {
		cursor: pointer;
		outline: none;
	}
	.on:hover {
		filter: brightness(1.15);
	}
	.dot {
		stroke: var(--card);
		stroke-width: 1.5;
	}
	.picking .on:not(.lit) {
		opacity: 0.45;
	}
	.lit {
		stroke: var(--ink);
		stroke-width: 1.4;
	}
</style>
