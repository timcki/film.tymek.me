<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let castingFor = $state('');

	$effect(() => {
		if (!data.runoff) return;
		const timer = setInterval(() => invalidateAll(), 4000);
		return () => clearInterval(timer);
	});
</script>

<h1>Host</h1>

{#if form?.message}<p class="toast">{form.message}</p>{/if}

{#if data.runoff}
	<h2>Room QR (safe to project)</h2>
	<div class="qr">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html data.runoff.qr}
	</div>
	<p class="code">{data.runoff.code}</p>
	<p class="notice">{data.runoff.link}</p>

	<h2>Live tally</h2>
	{#each data.runoff.tally as row (row.film.id)}
		<div class="card">
			<strong>{row.film.title}</strong>
			{#if row.film.year}<span class="meta"> ({row.film.year})</span>{/if}
			<span class="score" style="float:right">{row.votes}</span>
		</div>
	{/each}

	<h2>Cast for someone whose phone is dead</h2>
	<div class="grid-names">
		{#each data.people as person (person.id)}
			<button
				class:primary={castingFor === person.id}
				onclick={() => (castingFor = castingFor === person.id ? '' : person.id)}
			>
				{person.name}
			</button>
		{/each}
	</div>
	{#if castingFor}
		<p class="notice">now pick their film</p>
		{#each data.runoff.tally as row (row.film.id)}
			<form method="POST" action="?/voteFor" use:enhance>
				<input type="hidden" name="personId" value={castingFor} />
				<input type="hidden" name="filmId" value={row.film.id} />
				<button class="big-choice">{row.film.title}</button>
			</form>
		{/each}
	{/if}

	<form method="POST" action="?/closeRunoff" use:enhance style="margin-top:20px">
		<button class="primary">close the runoff and start the film</button>
	</form>
{:else}
	<p class="notice">
		No runoff is open. The week is {data.weekStatus ?? 'not started'}.
	</p>
	<form method="POST" action="?/close" use:enhance>
		<button class="primary">close the week now</button>
	</form>
	<p class="notice">
		Closing early is fine, anyone can do it. If the top two are tied, this opens a runoff and gives
		you a room QR.
	</p>
{/if}
