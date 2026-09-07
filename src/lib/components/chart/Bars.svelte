<script module lang="ts">
	/**
	 * A ranked list where the bar is the reading and the number confirms it.
	 * Horizontal rather than vertical because the labels are words, and a phone
	 * has height to spare and none to waste on rotated text.
	 */
	export type Bar = {
		key: string;
		label: string;
		value: number;
		/** what the number says once it is written out; defaults to the value */
		text?: string;
		/** dimmed where the row is present for completeness rather than for reading */
		muted?: boolean;
	};
</script>

<script lang="ts">
	let {
		bars,
		max = 0,
		colour = 'var(--accent)',
		lit = null,
		onpick = null
	}: {
		bars: Bar[];
		/** pass one to keep several charts on the same scale; 0 takes the tallest bar */
		max?: number;
		colour?: string;
		/** the key currently under the reader's attention, dimming every other row */
		lit?: string | null;
		onpick?: ((key: string, el: EventTarget | null) => void) | null;
	} = $props();

	const top = $derived(Math.max(max, ...bars.map((bar) => bar.value), 1));
</script>

{#snippet row(bar: Bar)}
	<span class="lb">{bar.label}</span>
	<span class="track"><i style="width:{(bar.value / top) * 100}%;background:{colour}"></i></span>
	<b>{bar.text ?? bar.value}</b>
{/snippet}

<div class="bars" class:picking={lit !== null}>
	{#each bars as bar (bar.key)}
		{#if onpick}
			<button
				class="bar"
				class:muted={bar.muted}
				class:lit={lit === bar.key}
				onclick={(event) => onpick(bar.key, event.currentTarget)}
			>
				{@render row(bar)}
			</button>
		{:else}
			<div class="bar" class:muted={bar.muted} class:lit={lit === bar.key}>
				{@render row(bar)}
			</div>
		{/if}
	{/each}
</div>

<style>
	.bars {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.bar {
		display: grid;
		grid-template-columns: minmax(56px, 30%) 1fr auto;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		border: 0;
		border-radius: 9px;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		width: 100%;
	}
	.bar.muted {
		opacity: 0.45;
	}
	/* while one row is lit the rest step back rather than disappear: the shape of
	   the distribution is what makes one row worth looking at */
	.bar.lit {
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		box-shadow: inset 3px 0 0 var(--accent);
	}
	button.bar:hover {
		background: color-mix(in srgb, var(--sunk) 75%, transparent);
	}
	button.bar.lit:hover {
		background: color-mix(in srgb, var(--accent) 15%, transparent);
	}
	.bars.picking .bar:not(.lit) {
		opacity: 0.45;
	}
	.lb {
		font-size: 12.5px;
		color: var(--ink2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.track {
		height: 8px;
		border-radius: 99px;
		background: var(--sunk);
		overflow: hidden;
		min-width: 20px;
	}
	.track i {
		display: block;
		height: 100%;
		border-radius: 99px;
		min-width: 2px;
	}
	b {
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: var(--dim);
		font-weight: 650;
		min-width: 22px;
		text-align: right;
	}
</style>
