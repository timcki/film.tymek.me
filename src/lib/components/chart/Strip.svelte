<script module lang="ts">
	/**
	 * One line per person, every observation a dot along it. Where a mean would
	 * flatten four ballots into one number, the dots keep the spread visible:
	 * somebody who always votes on the last evening and somebody who is split
	 * between both ends of the round have the same median and nothing else.
	 */
	export type Lane = {
		key: string;
		name: string;
		/** what the row is called; the name itself where two are not the same */
		label: string;
		colour: string;
		avatar: string | null;
		xp: number;
		/** positions along the axis, each already normalised to 0..1 */
		marks: number[];
		/** the typical one, drawn as a pip rather than a dot */
		at: number | null;
	};
</script>

<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';

	let {
		lanes,
		ticks = [],
		colour = 'var(--accent)',
		lit = null,
		onpick = null,
		onface = null
	}: {
		lanes: Lane[];
		ticks?: { at: number; label: string }[];
		colour?: string;
		lit?: string | null;
		onpick?: ((key: string, el: EventTarget | null) => void) | null;
		/** a mouse pointing at the face itself, which is worth a bigger picture */
		onface?: ((key: string, el: EventTarget | null, on: boolean) => void) | null;
	} = $props();
</script>

{#snippet row(lane: Lane)}
	<span class="who">
		<!-- a picture of a person, and on a mouse a bigger one; the row's own
		     button is what a keyboard or a finger uses -->
		<span
			class="face"
			role="img"
			aria-label={lane.name}
			onpointerenter={(event) =>
				event.pointerType === 'mouse' && onface?.(lane.key, event.currentTarget, true)}
			onpointerleave={(event) =>
				event.pointerType === 'mouse' && onface?.(lane.key, event.currentTarget, false)}
		>
			<Avatar
				name={lane.name}
				colour={lane.colour}
				avatar={lane.avatar}
				xp={lane.xp}
				titled={false}
				slim
			/>
		</span>
		<em>{lane.label}</em>
	</span>
	<span class="rail">
		<span class="line"></span>
		{#each ticks as tick (tick.at)}
			<span class="gridline" style="left:{tick.at * 100}%"></span>
		{/each}
		{#each lane.marks as mark, i (i)}
			<span class="dot" style="left:{mark * 100}%;background:{colour}"></span>
		{/each}
		{#if lane.at !== null}
			<span class="pip" style="left:{lane.at * 100}%;background:{colour}"></span>
		{/if}
	</span>
{/snippet}

<div class="strip" class:picking={lit !== null}>
	{#if ticks.length}
		<div class="axis">
			<span class="who"></span>
			<span class="rail">
				{#each ticks as tick (tick.at)}
					<span class="tick" style="left:{tick.at * 100}%">{tick.label}</span>
				{/each}
			</span>
		</div>
	{/if}

	{#each lanes as lane (lane.key)}
		{#if onpick}
			<button class="lane" class:lit={lit === lane.key} onclick={(event) => onpick(lane.key, event.currentTarget)}>
				{@render row(lane)}
			</button>
		{:else}
			<div class="lane" class:lit={lit === lane.key}>{@render row(lane)}</div>
		{/if}
	{/each}
</div>

<style>
	.strip {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.axis,
	.lane {
		display: grid;
		grid-template-columns: minmax(78px, 32%) 1fr;
		align-items: center;
		gap: 10px;
		padding: 4px 8px;
		border: 0;
		border-radius: 9px;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		width: 100%;
	}
	/* the lane you pressed lights up rather than merely surviving the dimming */
	.lane.lit {
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		box-shadow: inset 3px 0 0 var(--accent);
	}
	button.lane:hover {
		background: color-mix(in srgb, var(--sunk) 75%, transparent);
	}
	button.lane.lit:hover {
		background: color-mix(in srgb, var(--accent) 15%, transparent);
	}
	.strip.picking .lane:not(.lit) {
		opacity: 0.42;
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
	.rail {
		position: relative;
		height: 18px;
	}
	.axis .rail {
		height: 14px;
	}
	.tick {
		position: absolute;
		top: 0;
		transform: translateX(-50%);
		font-size: 10px;
		color: var(--dimmer);
		white-space: nowrap;
	}
	/* the ends are the round opening and the deadline, so the label wants to sit
	   inside the rail rather than hang off it */
	.tick:first-child {
		transform: none;
	}
	.tick:last-child {
		transform: translateX(-100%);
	}
	.line {
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		height: 1px;
		background: var(--line2);
	}
	.gridline {
		position: absolute;
		top: 2px;
		bottom: 2px;
		width: 1px;
		background: var(--line);
	}
	.dot {
		position: absolute;
		top: 50%;
		width: 7px;
		height: 7px;
		margin: -3.5px 0 0 -3.5px;
		border-radius: 99px;
		opacity: 0.62;
	}
	/* the typical one reads through a cluster of dots because it is taller, not
	   because it is brighter: brightness is what the highlight uses */
	.pip {
		position: absolute;
		top: 50%;
		width: 3px;
		height: 15px;
		margin: -7.5px 0 0 -1.5px;
		border-radius: 2px;
		box-shadow: 0 0 0 1.5px var(--bg);
	}
</style>
