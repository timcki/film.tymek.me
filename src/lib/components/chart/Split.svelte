<script module lang="ts">
	/**
	 * One bar per person, cut in two: the left half is the thing being measured,
	 * the right half is everything else. The group's own figure is drawn through
	 * every row as a rule, so a row is read against the room rather than against
	 * zero, and nobody's number is a verdict on its own.
	 */
	export type Slice = {
		key: string;
		name: string;
		/** what the row is called; the name itself where two are not the same */
		label: string;
		colour: string;
		avatar: string | null;
		xp: number;
		left: number;
		right: number;
		/** what goes in the value column; the left share as a percentage by default */
		text?: string;
		/** off where the measure cannot apply to this person at all */
		ranked?: boolean;
	};
</script>

<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';

	let {
		slices,
		average = null,
		leftColour = 'var(--accent)',
		rightColour = 'var(--line3)',
		lit = null,
		onpick = null,
		onface = null
	}: {
		slices: Slice[];
		/** the group's fraction, drawn through every bar; null draws no rule */
		average?: number | null;
		leftColour?: string;
		rightColour?: string;
		lit?: string | null;
		onpick?: ((key: string, el: EventTarget | null) => void) | null;
		/** a mouse pointing at the face itself, which is worth a bigger picture */
		onface?: ((key: string, el: EventTarget | null, on: boolean) => void) | null;
	} = $props();

	const pct = (slice: Slice) => {
		const total = slice.left + slice.right;
		return total ? slice.left / total : 0;
	};
</script>

{#snippet row(slice: Slice, ranked: boolean)}
	<span class="who">
		<!-- a picture of a person, and on a mouse a bigger one; the row's own
		     button is what a keyboard or a finger uses -->
		<span
			class="face"
			role="img"
			aria-label={slice.name}
			onpointerenter={(event) =>
				event.pointerType === 'mouse' && onface?.(slice.key, event.currentTarget, true)}
			onpointerleave={(event) =>
				event.pointerType === 'mouse' && onface?.(slice.key, event.currentTarget, false)}
		>
			<Avatar
				name={slice.name}
				colour={slice.colour}
				avatar={slice.avatar}
				xp={slice.xp}
				titled={false}
				slim
			/>
		</span>
		<em>{slice.label}</em>
	</span>

	<span class="track">
		{#if ranked}
			<i style="width:{pct(slice) * 100}%;background:{leftColour}"></i>
			<i class="rest" style="width:{(1 - pct(slice)) * 100}%;background:{rightColour}"></i>
			{#if average !== null}
				<span class="avg" style="left:{average * 100}%"></span>
			{/if}
		{/if}
	</span>

	<b>{ranked ? (slice.text ?? `${Math.round(pct(slice) * 100)}%`) : '\u2014'}</b>
{/snippet}

<div class="split" class:picking={lit !== null}>
	{#each slices as slice (slice.key)}
		{@const ranked = slice.ranked !== false}
		{#if onpick}
			<button
				class="row"
				class:unranked={!ranked}
				class:lit={lit === slice.key}
				onclick={(event) => onpick(slice.key, event.currentTarget)}
			>
				{@render row(slice, ranked)}
			</button>
		{:else}
			<div class="row" class:unranked={!ranked} class:lit={lit === slice.key}>
				{@render row(slice, ranked)}
			</div>
		{/if}
	{/each}
</div>

<style>
	.split {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.row {
		display: grid;
		grid-template-columns: minmax(78px, 32%) 1fr auto;
		align-items: center;
		gap: 10px;
		padding: 5px 8px;
		border: 0;
		border-radius: 9px;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		width: 100%;
	}
	.row.unranked {
		opacity: 0.4;
	}
	/* the row you pressed lights up rather than merely surviving the dimming: a
	   selection that is only the absence of fading reads as the page breaking */
	.row.lit {
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		box-shadow: inset 3px 0 0 var(--accent);
	}
	button.row:hover {
		background: color-mix(in srgb, var(--sunk) 75%, transparent);
	}
	button.row.lit:hover {
		background: color-mix(in srgb, var(--accent) 15%, transparent);
	}
	.split.picking .row:not(.lit) {
		opacity: 0.45;
	}
	.face {
		display: inline-flex;
		line-height: 0;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
	}
	em {
		font-style: normal;
		font-size: 12.5px;
		color: var(--ink2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.track {
		position: relative;
		display: flex;
		height: 9px;
		border-radius: 99px;
		background: var(--sunk);
		overflow: hidden;
		min-width: 24px;
	}
	.track i {
		display: block;
		height: 100%;
	}
	.track i.rest {
		opacity: 0.55;
	}
	/* the room's own figure, drawn through every bar so each row is read against
	   it. Inside the track rather than over the chart, which keeps it correct
	   whatever the rows do when they wrap */
	.track .avg {
		position: absolute;
		top: -1px;
		bottom: -1px;
		width: 2px;
		margin-left: -1px;
		background: var(--bg);
		box-shadow: 0 0 0 1px var(--edge);
		border-radius: 2px;
	}
	b {
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: var(--dim);
		font-weight: 650;
		min-width: 32px;
		text-align: right;
	}
</style>
