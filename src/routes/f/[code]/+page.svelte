<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Poster from '$lib/components/Poster.svelte';
	import { dictFor } from '$lib/i18n';
	import { say } from '$lib/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const T = $derived(dictFor(data.lang));

	// assume a dim room and someone holding a beer: pick your name once, then tap a film
	let who = $state('');
	let filter = $state('');
	const needsName = $derived(!data.identified && !who);
	const shown = $derived(
		data.people.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()))
	);

	const submit: SubmitFunction = () => async ({ result, update }) => {
		if (result.type === 'failure') {
			const body = result.data as
				| { code?: string; params?: Record<string, string | number>; message?: string }
				| undefined;
			say(T.error(body?.code ?? '', body?.params ?? {}, body?.message ?? ''), true);
		}
		await update({ reset: false });
	};

	// keep the tally live for everyone looking at the page
	$effect(() => {
		if (data.decided) return;
		const timer = setInterval(() => invalidateAll(), 4000);
		return () => clearInterval(timer);
	});
</script>

<header>
	<div>
		<h1>{T.roomH}</h1>
		<div class="sub">{T.roomCode} <b>{data.code}</b></div>
	</div>
</header>

{#if data.decided}
	<p class="banner accent">{T.roomDecided}</p>
	{#if data.checkedIn}<p class="hintline">{T.roomCheckedIn}</p>{/if}
	{#each data.tally as row (row.film.id)}
		<div class="pickbtn" class:on={row.film.id === data.winnerFilmId}>
			<div class="th"><Poster title={row.film.title} url={row.film.poster_url} /></div>
			<div>
				<b>{row.film.title}</b>
				<span>
					{T.votes(row.votes)}{row.film.id === data.winnerFilmId ? ` · ${T.roomWinner}` : ''}
				</span>
			</div>
		</div>
	{/each}
{:else if needsName}
	<div class="sec">{T.roomWho}</div>
	<input class="sinput" placeholder={T.roomFilter} bind:value={filter} autocomplete="off" />
	<div class="namegrid">
		{#each shown as person (person.id)}
			<!-- picking a name is the check-in; display:contents keeps the grid intact -->
			<form method="POST" action="?/checkIn" style="display:contents" use:enhance={submit}>
				<input type="hidden" name="personId" value={person.id} />
				<button class="namebtn" onclick={() => (who = person.id)}>{person.name}</button>
			</form>
		{/each}
	</div>
	<p class="hintline">{T.roomGuestNote}</p>
	<button class="ghostbtn" onclick={() => (who = 'guest')}>{T.roomGuest}</button>
{:else}
	<p class="hintline">
		{T.roomVotingAs(data.identified ?? data.people.find((p) => p.id === who)?.name ?? T.roomGuest)}
		{#if data.checkedIn || (who && who !== 'guest')}· {T.roomCheckedIn}{/if}
	</p>
	{#each data.tally as row (row.film.id)}
		<form method="POST" action="?/flashVote" use:enhance={submit}>
			<input type="hidden" name="filmId" value={row.film.id} />
			<input type="hidden" name="personId" value={who === 'guest' ? '' : who} />
			<button class="pickbtn" class:on={data.myVote === row.film.id}>
				<div class="th"><Poster title={row.film.title} url={row.film.poster_url} /></div>
				<div>
					<b>{row.film.title}</b>
					<span>{row.film.year ?? ''} · {T.votes(row.votes)}</span>
				</div>
			</button>
		</form>
	{/each}
	<p class="hintline">{T.roomChange}</p>
{/if}
