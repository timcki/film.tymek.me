<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Columns from '$lib/components/chart/Columns.svelte';
	import Lines from '$lib/components/chart/Lines.svelte';
	import { TIMEZONE, formatDay, formatNight } from '$lib/datetime';
	import { adminDict } from '$lib/i18n.admin';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const A = $derived(adminDict(data.lang));
	const when = (at: string) => formatNight(at, data.lang);
	const share = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

	const facts = (round: PageData['history'][number]) =>
		[
			A.histVoted(round.voters, round.roster),
			round.full !== null && A.histFull(round.full),
			A.histPoints(round.points, round.films),
			round.winnerTitle && A.histOnWinner(round.onWinner, share(round.onWinner, round.points)),
			!round.open && A.histRoom(round.room)
		]
			.filter(Boolean)
			.join(' · ');

	const rounds = $derived([...data.history].reverse());
	const short = $derived(
		new Intl.DateTimeFormat(data.lang, { day: 'numeric', month: 'numeric', timeZone: TIMEZONE })
	);
	const percent = (part: number, whole: number) => (whole ? (part / whole) * 100 : null);
	const columns = $derived(
		rounds.map((round) => ({
			key: String(round.week),
			label: short.format(new Date(round.closesAt)),
			voted: round.voters,
			attended: round.room,
			open: round.open
		}))
	);
	const lines = $derived([
		{
			key: 'voted',
			label: A.histVotedShare,
			colour: 'var(--accent)',
			values: rounds.map((round) => percent(round.voters, round.roster))
		},
		{
			key: 'full',
			label: A.histFullShare,
			colour: 'var(--tier5)',
			values: rounds.map((round) => (round.full === null ? null : percent(round.full, round.voters)))
		},
		{
			key: 'winner',
			label: A.histWinnerShare,
			colour: 'var(--warn)',
			values: rounds.map((round) => (round.winnerTitle ? percent(round.onWinner, round.points) : null))
		}
	]);

	const left = $derived(data.people.reduce((sum, p) => sum + Math.max(0, p.budget - p.spent), 0));
	const total = $derived(data.people.reduce((sum, p) => sum + p.budget, 0));
</script>

<h2 class="ah">{A.ptsH}</h2>
<p class="ahint">{A.ptsIntro}</p>

{#if data.week}
	<p class="ahint">{A.ptsClosing(when(data.week.closesAt))} {A.ptsLeft(left, total)}</p>
	{#if data.week.special}<p class="ahint">{A.ptsSleeps}</p>{/if}
{/if}

{#each data.people as person (person.id)}
	<div class="prow" class:off={person.spent === 0}>
		<div class="pwho">
			<Avatar name={person.name} colour={person.colour} avatar={person.avatar} size={34} font={13} />
			<div class="pnames">
				<b>{person.name}</b>
				<span class="pmeta">
					{person.nominated ? A.ptsNominated(person.nominated) : A.ptsNoNomination} ·
					{person.last ? A.ptsLast(when(person.last)) : A.ptsNeverVoted}
				</span>
			</div>
			<span class="pspend">{person.spent}/{person.budget} {A.ptsUnit}</span>
		</div>
		<div class="spmeter"><i style:width="{share(Math.min(person.spent, person.budget), person.budget)}%"></i></div>
		{#if person.films.length}
			<p class="spfilms">
				{#each person.films as film, i}{i ? ' · ' : ''}{film.title} <b>{film.points}</b>{/each}
			</p>
		{/if}
	</div>
{/each}

<h2 class="ah">{A.histH}</h2>
<p class="ahint">{A.histIntro}</p>

{#if rounds.length > 1}
	<div class="sec">{A.histTurnoutH}</div>
	<Columns
		{columns}
		roster={data.history[0].roster}
		votedLabel={A.histVotedKey}
		attendedLabel={A.histRoomKey}
		rosterLabel={A.histRosterKey}
	/>
	<div class="sec">{A.histSharesH}</div>
	<Lines {lines} labels={columns.map((column) => column.label)} />
{/if}

{#each data.history as round (round.week)}
	<div class="prow">
		<div class="pwho">
			<div class="pnames">
				<b>{formatDay(round.closesAt, data.lang)} · {round.open ? A.histOpen : (round.winnerTitle ?? A.histNoFilm)}</b>
				<span class="pmeta">{facts(round)}</span>
			</div>
			<span class="pspend">{share(round.voters, round.roster)}%</span>
		</div>
		<div class="spmeter"><i style:width="{share(round.voters, round.roster)}%"></i></div>
	</div>
{/each}
