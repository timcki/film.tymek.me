<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate, invalidateAll } from '$app/navigation';
	import { pollRoom } from '$lib/room-poll';
	import type { SubmitFunction } from '@sveltejs/kit';
	import RankingBallot from '$lib/components/RankingBallot.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Confetti from '$lib/components/Confetti.svelte';
	import Poster from '$lib/components/Poster.svelte';
	import SeenCount from '$lib/components/SeenCount.svelte';
	import { dictFor } from '$lib/i18n';
	import { say } from '$lib/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const T = $derived(dictFor(data.lang));

	// pick a name once, then keep the draft local while turnout updates
	let who = $state('');
	let filter = $state('');
	const needsName = $derived(!data.identified && !who);
	const shown = $derived(
		data.people.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()))
	);

	// the decision is the only thing on this screen that cannot be taken back, so
	// it is the only thing that gets confetti, and only on a phone that watched it
	// land: arriving at a room already decided is news, not a celebration
	let wasOpen = false;
	let burst = $state(false);
	$effect(() => {
		if (!data.decided || data.pending) wasOpen = true;
		else if (wasOpen) {
			wasOpen = false;
			burst = true;
		}
	});

	const submit =
		(): SubmitFunction =>
		() =>
		async ({ result, update }) => {
			if (result.type === 'failure') {
				const body = result.data as
					| { code?: string; params?: Record<string, string | number>; message?: string }
					| undefined;
				say(T.error(body?.code ?? '', body?.params ?? {}, body?.message ?? ''), true);
			}
			await update({ reset: false });
		};

	// the count sits in its own coin at the end of the row, so it stays out here
	function meta(row: (typeof data.tally)[number]): string {
		return [row.film.year, row.film.runtime ? T.minutes(row.film.runtime) : null]
			.filter(Boolean)
			.join(' · ');
	}

	// only turnout is live; results arrive after close, and after the count on
	// the projector has run
	$effect(() => {
		if (data.decided && !data.pending) return;
		let caught = data.decided;
		return pollRoom(async () => {
			await invalidate('app:room');
			// the next week's navigation must catch up before the phone leaves the room
			if (data.decided && !caught) {
				caught = true;
				await invalidateAll();
			}
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

{#if data.decided && data.pending}
	<!-- §7.2: the vote is over and the screen has the result; the phone says so
	     and nothing more until the count there has run -->
	<div class="lookup" aria-live="polite">
		<div class="eyes" aria-hidden="true">👀</div>
		<b>{T.roomLookUp}</b>
		<p>{T.roomLookUpSub}</p>
		<div class="lookfilms">
			{#each data.tally as row (row.film.id)}
				<div class="th"><Poster title={row.film.title} url={row.film.poster_url} /></div>
			{/each}
		</div>
	</div>
{:else if data.decided}
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
			</div>
		{/each}
	</div>
	<details class="castbox">
		<summary>{T.roomResults}</summary>
		<p class="hintline">{T.roomRankRules(data.tally.length)}</p>
		{#each data.tally as row (row.film.id)}
			<div class="resultrow" class:won={row.film.id === data.winnerFilmId}>
				<div class="resulthead">
					<b>{row.film.title}</b>
					<span class="rstat">{T.roomFirstChoices(row.votes ?? 0)}</span>
					<span class="rstat">{T.roomRankPoints(row.points ?? 0)}</span>
				</div>
				<div class="pairs">
					{#each row.comparisons ?? [] as comparison (comparison.filmId)}
						<span class="pair" class:beat={comparison.preferred > comparison.opposed}>
							{T.roomPair(data.tally.find((r) => r.film.id === comparison.filmId)!.film.title, comparison.preferred, comparison.opposed)}
						</span>
					{/each}
				</div>
			</div>
		{/each}
	</details>
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
	<div class="roomstate">
		<span class="turnchip"><b>{data.turnout}</b> {T.turnoutWord(data.turnout)}</span>
	</div>
	<!-- §7.2: said before anyone ranks anything, quietly: it is a promise, not a step -->
	<p class="privacy">
		<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="2" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>
		<span>{T.roomOpen}</span>
	</p>
	{#key `${data.code}:${data.me?.id ?? who}`}
		<RankingBallot films={data.tally.map((r) => r.film)} seen={data.seen} lang={data.lang}
			savedRanking={data.identified || who === 'guest' ? data.myRanking : undefined}
			personId={who === 'guest' ? '' : who} />
	{/key}
	<details class="castbox">
		<summary>{T.roomResults}</summary>
		<p class="hintline">{T.roomRankRules(data.tally.length)}</p>
	</details>
{/if}

{#if burst}
	<Confetti onDone={() => (burst = false)} />
{/if}

<style>
	.hrow { flex-wrap: wrap; }
	.wk { min-width: max-content; }
	.roomvote .pickbtn .winchip { width: fit-content; color: var(--accent); }
	.lookup {
		margin-top: 18px;
		padding: 34px 20px 26px;
		border-radius: var(--r);
		background: var(--card);
		box-shadow: var(--lift);
		text-align: center;
	}
	.eyes { font-size: 44px; line-height: 1; animation: glance 2.4s ease-in-out infinite; }
	.lookup b { display: block; margin-top: 14px; font-size: 21px; }
	.lookup p { margin: 8px 0 0; color: var(--dim); font-size: 13.5px; line-height: 1.5; }
	.lookfilms { display: flex; justify-content: center; gap: 10px; margin-top: 22px; }
	.lookfilms .th { width: 58px; aspect-ratio: 2/3; border-radius: 8px; overflow: hidden; background: var(--raise); }
	.lookfilms .th :global(img) { display: block; width: 100%; height: 100%; object-fit: cover; }
	@keyframes glance { 0%, 100% { transform: translateX(0); } 30% { transform: translateX(-6px); } 60% { transform: translateX(6px); } }
	@media (prefers-reduced-motion: reduce) { .eyes { animation: none; } }
	.roomstate { display: flex; justify-content: center; margin-top: 6px; }
	.turnchip {
		padding: 6px 14px;
		border-radius: 99px;
		background: color-mix(in srgb, var(--accent) 16%, transparent);
		color: var(--accent);
		font-size: 13px;
		font-weight: 650;
	}
	.turnchip b { font-weight: 800; font-variant-numeric: tabular-nums; }
	.privacy {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		margin: 14px 0 0;
		padding: 11px 14px;
		border-radius: 14px;
		background: color-mix(in srgb, var(--sunk) 70%, transparent);
		color: var(--dim);
		font-size: 12.5px;
		line-height: 1.5;
	}
	.privacy svg {
		flex: none;
		width: 16px;
		height: 16px;
		margin-top: 1px;
		fill: none;
		stroke: var(--accent);
		stroke-width: 1.5;
		stroke-linecap: round;
	}
	.resultrow { padding: 12px 0; border-bottom: 1px solid var(--line); }
	.resultrow:last-child { border-bottom: 0; padding-bottom: 2px; }
	.resulthead { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; }
	.resulthead b { flex: 1 1 100%; font-size: 15px; }
	.won .resulthead b { color: var(--accent); }
	.rstat { font-size: 12px; color: var(--dim); }
	.pairs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
	.pair { padding: 4px 10px; border-radius: 99px; background: var(--raise); color: var(--dim); font-size: 11.5px; }
	.pair.beat { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }
</style>
