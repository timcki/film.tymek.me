<script lang="ts">
	import { dictFor, fmtScore, isVotes } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const T = $derived(dictFor(data.lang));
	const votes = $derived(isVotes(data.rules));
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
				{T.evening(film.evening)}
				{#if film.outing}· {T.outing(film.outing)}{/if}
				{#if film.final_score !== null}
					· {fmtScore(film.final_score)}
					{T.unit(film.final_score, votes)}
				{/if}
			</div>
		</div>
	{:else}
		<div class="empty" style="grid-column:1/-1">{T.seenEmpty}</div>
	{/each}
</div>

<!-- the wall is the archive; everything that counts anything lives one tap away -->
<p class="banner accent"><a href="/stats">{T.statsLink}</a></p>
