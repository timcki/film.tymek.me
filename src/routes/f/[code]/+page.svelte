<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// assume a dim room and someone holding a beer: pick your name once, then tap a film
	let who = $state('');
	let filter = $state('');
	const needsName = $derived(!data.identified && !who);
	const shown = $derived(
		data.people.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()))
	);

	// keep the tally live for everyone looking at the page
	$effect(() => {
		if (data.decided) return;
		const timer = setInterval(() => invalidateAll(), 4000);
		return () => clearInterval(timer);
	});
</script>

<h1>Tonight's shortlist</h1>
<p class="notice">room code {data.code}</p>

{#if form?.message}<p class="toast">{form.message}</p>{/if}

{#if data.decided}
	<p class="card">Tonight is decided.</p>
	{#each data.tally as row (row.film.id)}
		<div class="card">
			<strong>{row.film.title}</strong>: {row.votes} vote{row.votes === 1 ? '' : 's'}
			{#if row.film.id === data.winnerFilmId}<span class="badge ok">winner</span>{/if}
		</div>
	{/each}
{:else if needsName}
	<h2>Who are you?</h2>
	<input placeholder="type to filter" bind:value={filter} autocomplete="off" />
	<div class="grid-names" style="margin-top:10px">
		{#each shown as person (person.id)}
			<button onclick={() => (who = person.id)}>{person.name}</button>
		{/each}
	</div>
	<p class="notice">Not on the list? Vote as a guest; it still counts in the room.</p>
	<button onclick={() => (who = 'guest')}>I'm a guest</button>
{:else}
	<p class="notice">
		voting as {data.identified ?? data.people.find((p) => p.id === who)?.name ?? 'a guest'}
	</p>
	{#each data.tally as row (row.film.id)}
		<form method="POST" action="?/flashVote" use:enhance>
			<input type="hidden" name="filmId" value={row.film.id} />
			<input type="hidden" name="personId" value={who === 'guest' ? '' : who} />
			<button class="big-choice" class:primary={data.myVote === row.film.id}>
				<strong>{row.film.title}</strong>
				{#if row.film.year}<span class="meta"> ({row.film.year})</span>{/if}
				<div class="meta">{row.votes} vote{row.votes === 1 ? '' : 's'}</div>
			</button>
		</form>
	{/each}
	<p class="notice">Tap again to change your mind. Only the last tap counts.</p>
{/if}
