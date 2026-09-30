<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate, invalidateAll } from '$app/navigation';
	import { pollRoom } from '$lib/room-poll';
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

	// §7.2: the vote moves until the host closes the room, so one tap is the whole
	// ceremony. the choice is held here as well as on the server, because even a
	// fast poll is behind the thumb and the ring has to move now
	let pick = $state<number | null>(null);
	const chosen = $derived(pick ?? data.myVote);

	// the server's tally is a poll old, so carry our own unlanded move into it and
	// let the coins change under the thumb that caused them; it cancels itself out
	// the moment the load function comes back agreeing
	const rows = $derived(
		data.tally.map((row) => {
			if (chosen === data.myVote) return row;
			if (row.film.id === chosen) return { ...row, votes: row.votes + 1 };
			if (row.film.id === data.myVote) return { ...row, votes: row.votes - 1 };
			return row;
		})
	);

	// the room otherwise only moves on a poll, so a coin whose number changed is
	// the one thing on the page that says the others are still arguing
	let ticking = $state<Record<number, boolean>>({});
	const counted = new Map<number, number>();
	$effect(() => {
		for (const row of rows) {
			const id = row.film.id;
			const before = counted.get(id);
			counted.set(id, row.votes);
			if (before === undefined || before === row.votes) continue;
			ticking[id] = true;
			setTimeout(() => (ticking[id] = false), 620);
		}
	});

	// the decision is the only thing on this screen that cannot be taken back, so
	// it is the only thing that gets confetti, and only on a phone that watched it
	// land: arriving at a room already decided is news, not a celebration
	let wasOpen = false;
	let burst = $state(false);
	$effect(() => {
		if (!data.decided) wasOpen = true;
		else if (wasOpen) {
			wasOpen = false;
			burst = true;
		}
	});

	const submit =
		(voted?: number): SubmitFunction =>
		() =>
		async ({ result, update }) => {
			if (result.type === 'failure') {
				const body = result.data as
					| { code?: string; params?: Record<string, string | number>; message?: string }
					| undefined;
				say(T.error(body?.code ?? '', body?.params ?? {}, body?.message ?? ''), true);
				// the server kept whatever it had; the ring goes back to saying so
				if (voted !== undefined) pick = data.myVote;
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
		return pollRoom(async () => {
			await invalidate('app:room');
			// the next week's navigation must catch up before the phone leaves the room
			if (data.decided) await invalidateAll();
		});
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
	<p class="roomnote">{T.roomOpen}</p>
	<div class="roomvote">
		{#each rows as row (row.film.id)}
			<form method="POST" action="?/flashVote" use:enhance={submit(row.film.id)}>
				<input type="hidden" name="filmId" value={row.film.id} />
				<input type="hidden" name="personId" value={who === 'guest' ? '' : who} />
				<!-- nothing is disabled and nothing arms: the ring simply travels to
				     whichever card was tapped last, which is the whole rule said in
				     the only language a dark room reads -->
				<button
					class="pickbtn"
					class:on={chosen === row.film.id}
					onclick={() => (pick = row.film.id)}
				>
					<div class="th"><Poster title={row.film.title} url={row.film.poster_url} /></div>
					<div class="rbody">
						<b>{row.film.title}</b>
						<span>{meta(row)} · <SeenCount n={data.seen[row.film.id] ?? 0} size={11} /></span>
						{#if chosen === row.film.id}
							<span class="mychip">✓ {T.roomYourVote}</span>
						{/if}
					</div>
					<!-- the tally, in the coin the list uses for a score -->
					<span class="votecoin" class:tick={ticking[row.film.id]}><b>{row.votes}</b><i>{T.unit(row.votes, true)}</i></span>
				</button>
			</form>
		{/each}
	</div>
{/if}

{#if burst}
	<Confetti onDone={() => (burst = false)} />
{/if}
