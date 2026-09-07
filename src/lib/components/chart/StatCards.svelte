<script module lang="ts">
	/**
	 * A row of single numbers, each big enough to read at a glance. Where the
	 * number belongs to one film rather than to all of them the card carries its
	 * poster, because a title is a string and a poster is the film.
	 */
	export type StatCard = {
		key: string;
		value: string;
		label: string;
		/** set where the figure is about one film in particular */
		film?: { title: string; posterUrl: string | null } | null;
	};
</script>

<script lang="ts">
	let { cards }: { cards: StatCard[] } = $props();
</script>

<div class="cards">
	{#each cards as card (card.key)}
		<div class="card">
			{#if card.film}
				{#if card.film.posterUrl}
					<img src={card.film.posterUrl} alt="" loading="lazy" />
				{:else}
					<span class="noposter"></span>
				{/if}
			{/if}
			<span class="text">
				<b>{card.value}</b>
				<em>{card.label}</em>
				{#if card.film}
					<i>{card.film.title}</i>
				{/if}
			</span>
		</div>
	{/each}
</div>

<style>
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 7px;
		margin-top: 6px;
	}
	.card {
		display: flex;
		align-items: center;
		gap: 9px;
		background: var(--card);
		border-radius: 12px;
		padding: 9px 11px;
		box-shadow: var(--lift);
		min-width: 0;
	}
	/* 2:3 at this width is 42px, which is exactly the three lines beside it */
	img,
	.noposter {
		width: 28px;
		flex: 0 0 28px;
		aspect-ratio: 2/3;
		object-fit: cover;
		border-radius: 4px;
		display: block;
		background: var(--raise);
	}
	.text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	b {
		font-size: 17px;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
		line-height: 1.2;
	}
	em,
	i {
		font-style: normal;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	em {
		font-size: 10.5px;
		color: var(--dim);
	}
	i {
		font-size: 10.5px;
		color: var(--ink2);
	}
</style>
