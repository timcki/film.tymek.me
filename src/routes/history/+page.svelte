<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import { dictFor, isVotes } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const T = $derived(dictFor(data.lang));
	const votes = $derived(isVotes(data.rules));
	const total = $derived(Math.max(1, data.watched.length));
</script>

<div class="wgrid">
	{#each data.watched as film (film.id)}
		<div class="wcard">
			{#if film.poster_url}
				<img src={film.poster_url} alt="" loading="lazy" />
			{:else}
				<div class="noimg"></div>
			{/if}
			<div class="lb">
				<b>{film.title}</b>
				{T.week(film.watched_week)}{#if film.final_score !== null}
					· {film.final_score}
					{T.unit(film.final_score, votes)}
				{/if}
			</div>
		</div>
	{:else}
		<div class="empty" style="grid-column:1/-1">{T.seenEmpty}</div>
	{/each}
</div>

{#if data.weeksWithoutWinner}
	<p class="banner">{T.noWinners(data.weeksWithoutWinner)}</p>
{/if}

<div class="sec">{T.fairH}</div>
{#each data.perPerson as person (person.id)}
	<div class="stat">
		<span>
			<Avatar name={person.name} colour={person.colour} avatar={person.avatar} />
			{person.name}
		</span>
		<b>
			{person.watched}
			<span class="pct">({Math.round((person.watched / total) * 100)}%)</span>
		</b>
	</div>
{/each}
