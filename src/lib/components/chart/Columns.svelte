<script module lang="ts">
	/**
	 * The participation funnel, round by round. Every column is drawn against the
	 * full roster rather than against the tallest bar, because the interesting
	 * number is the gap between how many people there are and how many of them
	 * did anything, and a chart rescaled to its own best week hides exactly that.
	 */
	export type Column = {
		key: string;
		label: string;
		voted: number;
		attended: number;
		/** the round has not been played out yet, so its bars are not a result */
		open?: boolean;
	};
</script>

<script lang="ts">
	let {
		columns,
		roster,
		votedLabel,
		attendedLabel,
		rosterLabel
	}: {
		columns: Column[];
		roster: number;
		votedLabel: string;
		attendedLabel: string;
		rosterLabel: string;
	} = $props();

	/** the drawing height of a column, in px; the CSS reads it back as --stackh */
	const STACK = 96;

	const top = $derived(Math.max(1, roster, ...columns.map((c) => Math.max(c.voted, c.attended))));
	// past a dozen rounds the labels collide, and the series is the point by then
	const sparse = $derived(columns.length > 12);
</script>

<div class="cols">
	<div class="key">
		<span class="k voted">{votedLabel}</span>
		<span class="k attended">{attendedLabel}</span>
		<span class="k roster">{rosterLabel}</span>
	</div>

	<!-- the rule is placed in pixels off the stack's own height: as a percentage
	     it would be a fraction of the plot, which is the stack plus its labels -->
	<div class="plot" style="--roster:{(roster / top) * STACK}px">
		{#each columns as column (column.key)}
			<div class="col" class:open={column.open} title={column.label}>
				<div class="stack">
					<i
						class="voted"
						style="height:{(column.voted / top) * 100}%"
						aria-label="{votedLabel}: {column.voted}"
					></i>
					<i
						class="attended"
						style="height:{(column.attended / top) * 100}%"
						aria-label="{attendedLabel}: {column.attended}"
					></i>
				</div>
				<span class="xl" class:hide={sparse && column !== columns[0] && column !== columns[columns.length - 1]}>
					{column.label}
				</span>
			</div>
		{/each}
	</div>
</div>

<style>
	.cols {
		margin-top: 6px;
		/* kept in step with STACK in the script, and with the label row below it */
		--stackh: 96px;
		--labelh: 18px;
	}
	.key {
		display: flex;
		gap: 12px;
		font-size: 10.5px;
		color: var(--dim);
		margin-bottom: 8px;
	}
	.k {
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.k::before {
		content: '';
		width: 9px;
		height: 9px;
		border-radius: 3px;
	}
	.k.voted::before {
		background: var(--accent);
	}
	.k.attended::before {
		background: var(--burn0);
	}
	.k.roster::before {
		height: 0;
		border-top: 2px dashed var(--edge);
		border-radius: 0;
	}
	.plot {
		position: relative;
		display: flex;
		align-items: flex-end;
		gap: 4px;
		padding: 0 2px;
	}
	/* everyone who could have taken part, drawn once across the whole series */
	.plot::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: calc(var(--labelh) + var(--roster));
		border-top: 1px dashed var(--edge);
		opacity: 0.6;
	}
	.col {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.col.open {
		opacity: 0.5;
	}
	.stack {
		height: var(--stackh);
		display: flex;
		align-items: flex-end;
		gap: 2px;
	}
	.stack i {
		flex: 1;
		min-height: 1px;
		border-radius: 3px 3px 0 0;
		display: block;
	}
	.stack i.voted {
		background: var(--accent);
	}
	.stack i.attended {
		background: var(--burn0);
	}
	.xl {
		font-size: 9.5px;
		color: var(--dimmer);
		text-align: center;
		font-variant-numeric: tabular-nums;
		height: 14px;
	}
	.xl.hide {
		visibility: hidden;
	}
</style>
