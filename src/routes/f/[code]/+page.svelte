<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Avatar from '$lib/components/Avatar.svelte';
	import Confetti from '$lib/components/Confetti.svelte';
	import Poster from '$lib/components/Poster.svelte';
	import SeenCount from '$lib/components/SeenCount.svelte';
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

	// §7.2: one vote for the night, so a tap arms and only a second tap commits
	let armed = $state<number | null>(null);
	let armTimer: ReturnType<typeof setTimeout>;
	function arm(filmId: number) {
		clearTimeout(armTimer);
		armed = filmId;
		armTimer = setTimeout(() => (armed = null), 5000);
	}

	// the server keys myVote to the device cookie, but a vote from a shared phone
	// is keyed to the claimed person, so the lock has to survive locally too
	let lockedFilm = $state<number | null>(null);
	let burst = $state(false);
	const locked = $derived(lockedFilm !== null || data.myVote !== null);

	const submit =
		(title?: string): SubmitFunction =>
		() =>
		async ({ result, update }) => {
			if (result.type === 'failure') {
				const body = result.data as
					| { code?: string; params?: Record<string, string | number>; message?: string }
					| undefined;
				say(T.error(body?.code ?? '', body?.params ?? {}, body?.message ?? ''), true);
			}
			if (result.type === 'success' && title) {
				const voted = (result.data as { filmId?: number } | undefined)?.filmId;
				armed = null;
				lockedFilm = voted ?? null;
				burst = true;
			}
			await update({ reset: false });
		};

	// the count sits in its own coin at the end of the row, so it stays out here
	function meta(row: (typeof data.tally)[number]): string {
		return [row.film.year, row.film.runtime ? T.minutes(row.film.runtime) : null]
			.filter(Boolean)
			.join(' · ');
	}

	// keep the tally live for everyone looking at the page
	$effect(() => {
		if (data.decided) return;
		const timer = setInterval(() => invalidateAll(), 4000);
		return () => clearInterval(timer);
	});
</script>

<!-- the same bar the rest of the app wears: your face, then the code for anyone
     typing it in by hand, and the register on the right once you are on it. The
     page is reachable without an account, so the face may simply not be there -->
<header class="lean">
	<div class="hrow">
		{#if data.me}
			<Avatar
				name={data.me.name}
				colour={data.me.colour}
				avatar={data.me.avatar}
				size={30}
				font={12}
				xp={data.me.xp}
			/>
		{/if}
		<div class="wk">
			<div class="roomcode"><span>{T.roomCode}</span><b>{data.code}</b></div>
		</div>
		{#if data.checkedIn || (who && who !== 'guest')}
			<span class="okchip">{T.roomCheckedIn}</span>
		{/if}
	</div>
</header>

{#if data.decided}
	<p class="banner accent">{T.roomDecided}</p>
	<div class="roomvote">
		{#each data.tally as row (row.film.id)}
			<div class="pickbtn" class:on={row.film.id === data.winnerFilmId}>
				<div class="th"><Poster title={row.film.title} url={row.film.poster_url} /></div>
				<div class="rbody">
					<b>{row.film.title}</b>
					<span>{meta(row)} · <SeenCount n={data.seen[row.film.id] ?? 0} size={11} /></span>
					{#if row.film.id === data.winnerFilmId}
						<span class="winchip">{T.roomWinner}</span>
					{/if}
				</div>
				<span class="votecoin"><b>{row.votes}</b><i>{T.unit(row.votes, true)}</i></span>
			</div>
		{/each}
	</div>
{:else if needsName}
	<div class="sec">{T.roomWho}</div>
	<input class="sinput" placeholder={T.roomFilter} bind:value={filter} autocomplete="off" />
	<div class="namegrid">
		{#each shown as person (person.id)}
			<!-- picking a name is the check-in; display:contents keeps the grid intact -->
			<form method="POST" action="?/checkIn" style="display:contents" use:enhance={submit()}>
				<input type="hidden" name="personId" value={person.id} />
				<button class="namebtn" onclick={() => (who = person.id)}>{person.name}</button>
			</form>
		{/each}
	</div>
	<p class="hintline">{T.roomGuestNote}</p>
	<button class="ghostbtn" onclick={() => (who = 'guest')}>{T.roomGuest}</button>
{:else}
	<!-- with a face in the bar there is nobody to name; a guest still wants to know -->
	{#if !data.me}
		<p class="hintline">
			{T.roomVotingAs(data.people.find((p) => p.id === who)?.name ?? T.roomAsGuest)}
		</p>
	{/if}
	<!-- the rule sits above the taps it governs: under the list it was read after
	     the decision, if a phone in a dim room got that far down at all -->
	{#if !locked}<p class="roomnote">{T.roomFinal}</p>{/if}
	<div class="roomvote">
		{#each data.tally as row (row.film.id)}
			<form method="POST" action="?/flashVote" use:enhance={submit(row.film.title)}>
				<input type="hidden" name="filmId" value={row.film.id} />
				<input type="hidden" name="personId" value={who === 'guest' ? '' : who} />
				<button
					class="pickbtn"
					type={armed === row.film.id ? 'submit' : 'button'}
					disabled={locked}
					class:on={data.myVote === row.film.id || lockedFilm === row.film.id}
					class:armed={armed === row.film.id}
					onclick={(event) => {
						// the arming tap has to cancel the default, and not merely leave the
						// button typed as one that does nothing: arming flips that very type
						// to submit, and the browser reads it back after this handler returns.
						// Without this the first tap fires the vote and nothing is confirmed
						if (armed !== row.film.id) {
							event.preventDefault();
							arm(row.film.id);
						}
					}}
				>
					<div class="th"><Poster title={row.film.title} url={row.film.poster_url} /></div>
					<div class="rbody">
						<b>{row.film.title}</b>
						<span>{meta(row)} · <SeenCount n={data.seen[row.film.id] ?? 0} size={11} /></span>
					</div>
					<!-- the tally, in the coin the list uses for a score -->
					<span class="votecoin"><b>{row.votes}</b><i>{T.unit(row.votes, true)}</i></span>
					<!-- a line of its own under the row, not squeezed into the column
					     beside the poster: it is an instruction and has to be read at
					     arm's length, in one go -->
					{#if armed === row.film.id}
						<span class="armhint">{T.roomArm}</span>
					{/if}
				</button>
			</form>
		{/each}
	</div>
{/if}

{#if burst}
	<Confetti onDone={() => (burst = false)} />
{/if}
