<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<h1>History</h1>

{#each data.watched as film (film.id)}
	<div class="card film">
		{#if film.poster_url}<img src={film.poster_url} alt="" />{/if}
		<div class="body">
			<div class="title">
				{film.title}{#if film.year}<span class="meta"> ({film.year})</span>{/if}
			</div>
			<div class="meta">
				week {film.watched_week} · nominated by {film.added_by_name}
				{#if film.director} · {film.director}{/if}
			</div>
		</div>
		<div class="score">{film.final_score}</div>
	</div>
{:else}
	<p class="notice">Nothing watched yet.</p>
{/each}

{#if data.weeksWithoutWinner}
	<p class="notice">
		{data.weeksWithoutWinner} week{data.weeksWithoutWinner === 1 ? '' : 's'} closed with nobody voting,
		so nothing was watched.
	</p>
{/if}

<h2>Whose nominations get watched</h2>
<table>
	<thead>
		<tr><th>Person</th><th>Nominated</th><th>Watched</th></tr>
	</thead>
	<tbody>
		{#each data.perPerson as person (person.id)}
			<tr>
				<td>{person.name}</td>
				<td>{person.nominated}</td>
				<td>{person.watched}</td>
			</tr>
		{/each}
	</tbody>
</table>
<p class="notice">
	This table is the group's check on whether the active rule set is being fair. Worth a look after
	about eight weeks.
</p>
