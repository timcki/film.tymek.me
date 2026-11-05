<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Columns from '$lib/components/chart/Columns.svelte';
	import Lines from '$lib/components/chart/Lines.svelte';
	import Scatter, { type Dot } from '$lib/components/chart/Scatter.svelte';
	import StatCards, { type StatCard } from '$lib/components/chart/StatCards.svelte';
	import { TIMEZONE, formatDay, formatNight } from '$lib/datetime';
	import { adminDict } from '$lib/i18n.admin';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const A = $derived(adminDict(data.lang));
	const when = (at: string) => formatNight(at, data.lang);
	const share = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
	const percent = (part: number, whole: number) => (whole ? (part / whole) * 100 : null);
	const short = $derived(
		new Intl.DateTimeFormat(data.lang, { day: 'numeric', month: 'numeric', timeZone: TIMEZONE })
	);
	const decimal = $derived(new Intl.NumberFormat(data.lang, { maximumFractionDigits: 1 }));

	const left = $derived(data.people.reduce((sum, p) => sum + Math.max(0, p.budget - p.spent), 0));
	const total = $derived(data.people.reduce((sum, p) => sum + p.budget, 0));

	/* ------------------------------------------------------------ the rounds -- */

	const rounds = $derived([...data.history].reverse());
	const labels = $derived(rounds.map((round) => short.format(new Date(round.closesAt))));
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
	const columns = $derived(
		rounds.map((round, i) => ({
			key: String(round.week),
			label: labels[i],
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

	/* ---------------------------------------------------------- the habits -- */

	const habits = $derived(data.habits);
	const sum = (pick: (round: PageData['habits']['rounds'][number]) => number) =>
		habits.rounds.reduce((all, round) => all + pick(round), 0);
	const cards = $derived.by((): StatCard[] => {
		const voters = sum((r) => r.voters);
		const points = sum((r) => r.points);
		if (!voters) return [];
		const longest = habits.people
			.filter((p) => p.streak)
			.sort((a, b) => b.streak!.rounds - a.streak!.rounds)[0];
		return [
			{ key: 'one', value: `${share(sum((r) => r.oneFilm), voters)}%`, label: A.habCardOne },
			{ key: 'again', value: `${share(sum((r) => r.again), points)}%`, label: A.habCardAgain },
			{ key: 'own', value: `${share(sum((r) => r.own), points)}%`, label: A.habCardOwn },
			...(habits.decided
				? [{ key: 'leader', value: `${habits.leaderWon}/${habits.decided}`, label: A.habCardLeader }]
				: []),
			{ key: 'half', value: `${habits.halfFrom}/${habits.voters}`, label: A.habCardHalf },
			...(longest
				? [
						{
							key: 'run',
							value: String(longest.streak!.rounds),
							label: A.habCardRun,
							film: {
								title: `${longest.streak!.title} · ${longest.person.name}`,
								posterUrl: longest.streak!.posterUrl
							}
						}
					]
				: [])
		];
	});
	const habitLines = $derived([
		{
			key: 'one',
			label: A.habOneLine,
			colour: 'var(--accent)',
			values: habits.rounds.map((r) => percent(r.oneFilm, r.voters))
		},
		{
			key: 'again',
			label: A.habAgainLine,
			colour: 'var(--tier5)',
			values: habits.rounds.map((r) => percent(r.again, r.points))
		},
		{
			key: 'own',
			label: A.habOwnLine,
			colour: 'var(--burn0)',
			values: habits.rounds.map((r) => percent(r.own, r.points))
		}
	]);

	/**
	 * Splitting along, coming back up: where each person sits, a face apiece.
	 * Coming back takes rounds to come back from, so a newcomer would only sit at zero
	 */
	const dots = $derived(
		habits.people.filter((row) => row.rounds >= 3).map((row) => ({
			key: row.person.id,
			name: row.person.name,
			colour: row.person.colour,
			avatar: row.person.avatar,
			xp: row.person.xp,
			x: Math.round(row.films * 10) / 10,
			y: share(row.again, row.points)
		}))
	);
	const xMax = $derived(Math.max(1, Math.ceil(Math.max(0, ...dots.map((dot) => dot.x)))));
	let lit = $state<string | null>(null);
	const habitOf = (key: string) => habits.people.find((row) => row.person.id === key)!;
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

{#if rounds.length > 1}
	<h2 class="ah">{A.histH}</h2>
	<p class="ahint">{A.histIntro} {A.habHint}</p>

	<div class="sec">{A.histTurnoutH}</div>
	<Columns
		{columns}
		roster={data.history[0].roster}
		votedLabel={A.histVotedKey}
		attendedLabel={A.histRoomKey}
		rosterLabel={A.histRosterKey}
	/>

	<div class="sec">{A.histSharesH}</div>
	<Lines {lines} {labels}>
		{#snippet detail(i: number)}
			<b>{formatDay(rounds[i].closesAt, data.lang)} · {rounds[i].open ? A.histOpen : (rounds[i].winnerTitle ?? A.histNoFilm)}</b><br />
			{facts(rounds[i])}
		{/snippet}
	</Lines>

	<h2 class="ah">{A.habH}</h2>
	<p class="ahint">{A.habIntro}</p>
	<StatCards {cards} />

	<div class="sec">{A.habChartH}</div>
	<Lines lines={habitLines} labels={habits.rounds.map((r) => short.format(new Date(r.closesAt)))}>
		{#snippet detail(i: number)}
			<b>{formatDay(habits.rounds[i].closesAt, data.lang)}</b><br />
			{habitLines
				.map((line) => `${line.label} ${Math.round(line.values[i] ?? 0)}%`)
				.join(' · ')}
		{/snippet}
	</Lines>

	{#if dots.length}
		<div class="sec">{A.habPeopleH}</div>
		<Scatter
			{dots}
			{xMax}
			yMax={100}
			xTitle={A.habX}
			yTitle={A.habY}
			{lit}
			onpick={(key) => (lit = lit === key ? null : key)}
		>
			{#snippet detail(dot: Dot)}
				{@const row = habitOf(dot.key)}
				<b>{row.person.name}</b> ·
				{A.habPerson(row.rounds, habits.rounds.length, decimal.format(row.films), share(row.again, row.points), share(row.own, row.points))}{#if row.streak}{' · '}{A.habRun(row.streak.title, row.streak.rounds)}{/if}
			{/snippet}
		</Scatter>
	{/if}
{/if}
