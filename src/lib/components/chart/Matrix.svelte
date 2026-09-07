<script module lang="ts">
	/**
	 * Two questions crossed, faces in the cells. A scatter would be the textbook
	 * answer and the wrong one here: both axes are small counts, so two dozen
	 * people land on a handful of coordinates and sit on top of each other. A
	 * grid lets a cell simply hold everybody who belongs in it, and the point of
	 * the figure, which corner the group lives in, survives.
	 */
	export type Pin = {
		key: string;
		name: string;
		colour: string;
		avatar: string | null;
		xp: number;
	};
</script>

<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';

	let {
		grid,
		xLabels,
		yLabels,
		xTitle,
		yTitle,
		lit = null,
		onpick = null,
		onface = null
	}: {
		/** [row][column], row 0 at the top */
		grid: Pin[][][];
		xLabels: string[];
		yLabels: string[];
		xTitle: string;
		yTitle: string;
		lit?: string | null;
		onpick?: ((key: string, el: EventTarget | null) => void) | null;
		/** a mouse pointing at a face, which is worth a bigger picture */
		onface?: ((key: string, el: EventTarget | null, on: boolean) => void) | null;
	} = $props();

	const busiest = $derived(
		Math.max(1, ...grid.flatMap((row) => row.map((cell) => cell.length)))
	);
</script>

{#snippet face(pin: Pin)}
	<Avatar
		name={pin.name}
		colour={pin.colour}
		avatar={pin.avatar}
		xp={pin.xp}
		size={22}
		font={9}
		slim
	/>
{/snippet}

<div class="matrix" class:picking={lit !== null}>
	<div class="ytitle">{yTitle}</div>

	<div class="body" style="grid-template-columns: auto repeat({xLabels.length}, 1fr)">
		{#each grid as row, y (y)}
			<div class="yl">{yLabels[y]}</div>
			{#each row as cell, x (x)}
				<div
					class="cell"
					class:empty={!cell.length}
					style="--fill:{cell.length / busiest}"
				>
					{#each cell as pin (pin.key)}
						{#if onpick}
							<button
								class="pin"
								class:lit={lit === pin.key}
								aria-label={pin.name}
								onclick={(event) => onpick(pin.key, event.currentTarget)}
								onpointerenter={(event) =>
									event.pointerType === 'mouse' &&
									onface?.(pin.key, event.currentTarget, true)}
								onpointerleave={(event) =>
									event.pointerType === 'mouse' &&
									onface?.(pin.key, event.currentTarget, false)}
							>
								{@render face(pin)}
							</button>
						{:else}
							<span class="pin" class:lit={lit === pin.key}>{@render face(pin)}</span>
						{/if}
					{/each}
				</div>
			{/each}
		{/each}

		<div class="corner"></div>
		{#each xLabels as label, x (x)}
			<div class="xl">{label}</div>
		{/each}
	</div>

	<div class="xtitle">{xTitle}</div>
</div>

<style>
	.matrix {
		margin-top: 6px;
	}
	/* the label gutter, then one column per band, written out inline because a
	   repeat() counted by a custom property is not something to rely on */
	.body {
		display: grid;
		gap: 3px;
	}
	.cell {
		background: color-mix(in srgb, var(--accent) calc(var(--fill) * 13%), var(--sunk));
		border-radius: 8px;
		min-height: 34px;
		padding: 4px;
		display: flex;
		flex-wrap: wrap;
		align-content: flex-start;
		gap: 3px;
	}
	.cell.empty {
		background: color-mix(in srgb, var(--sunk) 45%, transparent);
	}
	.pin {
		border: 0;
		padding: 0;
		background: none;
		line-height: 0;
		border-radius: 99px;
	}
	.matrix.picking .pin:not(.lit) {
		opacity: 0.3;
	}
	/* the face you pressed keeps its own halo, so it can be found in a full cell */
	.pin.lit {
		box-shadow: 0 0 0 2px var(--accent);
	}
	button.pin:hover {
		box-shadow: 0 0 0 2px var(--line3);
	}
	button.pin.lit:hover {
		box-shadow: 0 0 0 2px var(--accent);
	}
	.yl,
	.xl {
		font-size: 10px;
		color: var(--dimmer);
		display: flex;
		align-items: center;
	}
	.yl {
		justify-content: flex-end;
		padding-right: 4px;
		text-align: right;
		max-width: 62px;
	}
	.xl {
		justify-content: center;
		text-align: center;
		padding-top: 3px;
		line-height: 1.2;
	}
	.ytitle,
	.xtitle {
		font-size: 10.5px;
		color: var(--dim);
	}
	.ytitle {
		margin-bottom: 5px;
	}
	.xtitle {
		margin-top: 4px;
		text-align: right;
	}
</style>
