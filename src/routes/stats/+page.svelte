<script lang="ts">
	import { posterSrc } from '$lib/poster-src';
	import Avatar from '$lib/components/Avatar.svelte';
	import FacePeek, { peekFor, type Peek } from '$lib/components/FacePeek.svelte';
	import Bars, { type Bar } from '$lib/components/chart/Bars.svelte';
	import Columns from '$lib/components/chart/Columns.svelte';
	import Ring, { type Seat } from '$lib/components/chart/Ring.svelte';
	import Scatter, { type Dot } from '$lib/components/chart/Scatter.svelte';
	import Split, { type Slice } from '$lib/components/chart/Split.svelte';
	import StatCards, { type StatCard } from '$lib/components/chart/StatCards.svelte';
	import Strip from '$lib/components/chart/Strip.svelte';
	import Trend from '$lib/components/chart/Trend.svelte';
	import WorldMap from '$lib/components/chart/WorldMap.svelte';
	import Lines from '$lib/components/chart/Lines.svelte';
	import { TIMEZONE, formatDay } from '$lib/datetime';
	import { dictFor, fmtScore, isVotes } from '$lib/i18n';
	import { shortNames } from '$lib/names';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const T = $derived(dictFor(data.lang));
	const votes = $derived(isVotes(data.rules));
	const counts = $derived(data.counts);
	/** nothing that counts ballots has anything to say until somebody has voted */
	const voted = $derived(counts.ballots > 0);

	const href = (next: { lens?: string; era?: string }) =>
		`?lens=${next.lens ?? data.lens}&era=${next.era ?? data.era}`;

	// a chart row has space for a first name; where two people share one it gets
	// as much of the rest as it takes to be somebody's
	const short = $derived(shortNames(data.engagement.map((row) => row.person)));
	const labelOf = (person: { id: string; name: string }) =>
		short.get(person.id) ?? person.name.split(' ')[0];

	/**
	 * The two pieces of state that are not in the URL, and the two things a face
	 * can be asked. Pressing a row picks that person: their row fills in, every
	 * other one steps back, and the card at the top of the lens says who it is
	 * and what they have done. Pointing at the picture only asks who that is, so
	 * it opens the portrait the rest of the app opens and nothing else moves.
	 */
	let lit = $state<string | null>(null);
	const pick = (key: string) => (lit = lit === key ? null : key);

	let peek = $state<Peek | null>(null);
	let peeking = $state<string | null>(null);
	function hover(key: string, el: EventTarget | null, on: boolean) {
		if (!on) {
			// a pointer leaving one face on its way to the next must not shut the
			// one it is arriving at, so only the face that opened it may close it
			if (peeking === key) {
				peeking = null;
				peek = null;
			}
			return;
		}
		const person =
			data.engagement.find((row) => row.person.id === key)?.person ??
			data.backing.people.find((p) => p.id === key);
		if (!person) return;
		peeking = key;
		peek = peekFor(el, person, '', false);
	}

	/** a bucket opened to see which films are actually in it */
	let openBucket = $state<string | null>(null);
	const filmsIn = $derived.by(() => {
		if (!openBucket) return [];
		const all = [
			...data.decades,
			...data.countries,
			...data.genres,
			...data.directors,
			...runtimeBuckets
		];
		const ids = all.find((bucket) => bucket.key === openBucket)?.films ?? [];
		return ids.map((id) => data.films.find((film) => film.id === id)).filter((f) => f != null);
	});

	const columns = $derived(
		data.rounds.map((round) => ({
			key: String(round.week),
			label: String(data.evenings[round.week]),
			voted: round.voters,
			attended: round.attended,
			// the round still running has not finished collecting either number
			open: round.week === data.window.to && !round.winnerTitle
		}))
	);

	const opennessSlices = $derived<Slice[]>(
		data.openness.map((row) => ({
			key: row.person.id,
			name: row.person.name,
			label: labelOf(row.person),
			colour: row.person.colour,
			avatar: row.person.avatar,
			xp: row.person.xp,
			left: row.others,
			right: row.own
		}))
	);
	/** the room's own figure, drawn through every bar so a row is read against it */
	const opennessAverage = $derived.by(() => {
		const theirs = data.openness.reduce((sum, row) => sum + row.others, 0);
		const all = data.openness.reduce((sum, row) => sum + row.own + row.others, 0);
		return all ? theirs / all : null;
	});

	/**
	 * Every bar is drawn out of the same total, the nights in the window, so the
	 * percentages are shares of one thing and add up to a hundred between them.
	 */
	const nightSlices = $derived<Slice[]>(
		data.nights.map((row) => ({
			key: row.person.id,
			name: row.person.name,
			label: labelOf(row.person),
			colour: row.person.colour,
			avatar: row.person.avatar,
			xp: row.person.xp,
			left: row.nights,
			right: Math.max(0, counts.nights - row.nights),
			text: `${row.nights}`
		}))
	);

	const lanes = $derived(
		data.timing.map((row) => ({
			key: row.person.id,
			name: row.person.name,
			label: labelOf(row.person),
			colour: row.person.colour,
			avatar: row.person.avatar,
			xp: row.person.xp,
			marks: row.marks,
			at: row.median
		}))
	);

	const rewatchSlices = $derived<Slice[]>(
		data.rewatches.rows.map((row) => ({
			key: row.person.id,
			name: row.person.name,
			label: labelOf(row.person),
			colour: row.person.colour,
			avatar: row.person.avatar,
			xp: row.person.xp,
			left: row.seen,
			right: Math.max(0, data.rewatches.evenings - row.seen),
			text: `${row.seen}`
		}))
	);

	const seats = $derived<Seat[]>(
		data.backing.people.map((person) => ({
			key: person.id,
			name: person.name,
			colour: person.colour,
			avatar: person.avatar,
			xp: person.xp
		}))
	);
	const tieTip = (from: string, to: string, points: number) =>
		`${from} → ${to}: ${points} ${T.unit(points, votes)}`;

	/** the lit face's ribbons spelled out, a list each way, biggest first */
	const backs = $derived.by(() => {
		if (!lit) return null;
		const named = (id: string, points: number) => {
			const person = data.backing.people.find((p) => p.id === id)!;
			return { id, label: labelOf(person), points };
		};
		return {
			out: data.backing.links.filter((l) => l.from === lit).map((l) => named(l.to, l.points)),
			in: data.backing.links.filter((l) => l.to === lit).map((l) => named(l.from, l.points))
		};
	});

	const sides = $derived([
		{ mode: 'out' as const, title: T.ringOut, rows: backs?.out },
		{ mode: 'in' as const, title: T.ringIn, rows: backs?.in }
	]);

	/** everything the page knows about the person whose row is filled in */
	const focus = $derived.by(() => {
		if (!lit) return null;
		const engaged = data.engagement.find((row) => row.person.id === lit);
		if (!engaged) return null;
		return {
			engaged,
			open: data.openness.find((row) => row.person.id === lit),
			nights: data.nights.find((row) => row.person.id === lit),
			when: data.timing.find((row) => row.person.id === lit),
			seen: data.rewatches.rows.find((row) => row.person.id === lit)?.seen ?? 0
		};
	});

	/** both axes are counts out of what the window holds, drawn to scale */
	const dots = $derived<Dot[]>(
		data.engagement.map((row) => ({
			key: row.person.id,
			name: row.person.name,
			colour: row.person.colour,
			avatar: row.person.avatar,
			xp: row.person.xp,
			x: row.roundsVoted,
			y: row.nightsAttended
		}))
	);

	/* ------------------------------------------------------------ the films -- */

	/**
	 * The canon's extremes, and what it takes to get watched. The charts below
	 * draw distributions; these are the facts a distribution cannot say, which
	 * is the ones with a film's name on them.
	 */
	const facts = $derived.by<StatCard[]>(() => {
		const f = data.facts;
		const screen = data.screen;
		const out: StatCard[] = [];
		const film = (row: { title: string; posterUrl: string | null }) => ({
			title: row.title,
			posterUrl: row.posterUrl
		});

		if (f.longest) {
			out.push({
				key: 'longest',
				value: T.minutes(f.longest.value),
				label: T.factLongest,
				film: film(f.longest)
			});
		}
		if (f.shortest) {
			out.push({
				key: 'shortest',
				value: T.minutes(f.shortest.value),
				label: T.factShortest,
				film: film(f.shortest)
			});
		}
		if (f.oldest) {
			out.push({
				key: 'oldest',
				value: String(f.oldest.value),
				label: T.factOldest,
				film: film(f.oldest)
			});
		}
		if (!screen) return out;

		out.push({
			key: 'wait',
			value: T.weeksShort(Math.round(screen.meanWait)),
			label: T.factWait
		});
		if (screen.waits.length) {
			out.push({
				key: 'longestwait',
				value: T.weeksShort(screen.waits[0].value),
				label: T.factLongestWait,
				film: film(screen.waits[0])
			});
		}
		out.push({
			key: 'score',
			value: `${fmtScore(screen.meanScore)} ${T.unit(screen.meanScore, votes)}`,
			label: T.factScore
		});
		if (screen.scores.length) {
			out.push({
				key: 'best',
				value: `${fmtScore(screen.scores[0].value)} ${T.unit(screen.scores[0].value, votes)}`,
				label: T.factBest,
				film: film(screen.scores[0])
			});
		}
		if (screen.waiting.length) {
			out.push({
				key: 'waiting',
				value: T.weeksShort(screen.waiting[0].value),
				label: T.factWaiting,
				film: film(screen.waiting[0])
			});
		}
		return out;
	});

	/** which chart the open bucket came from, so its films are listed under it */
	const from = (buckets: { key: string }[]) =>
		openBucket !== null && buckets.some((bucket) => bucket.key === openBucket);
	const openBar = (key: string) => (openBucket = openBucket === key ? null : key);

	const decadeBars = $derived<Bar[]>(
		data.decades.map((bucket) => ({
			key: bucket.key,
			label: bucket.label,
			value: bucket.films.length
		}))
	);
	const regions = $derived(new Intl.DisplayNames([data.lang], { type: 'region' }));
	const countryName = (code: string) => {
		try {
			return regions.of(code) ?? code;
		} catch {
			return code;
		}
	};
	const countryCounts = $derived(
		Object.fromEntries(data.countries.map((bucket) => [bucket.label, bucket.films.length]))
	);
	const countryBars = $derived<Bar[]>(
		data.countries.slice(0, 10).map((bucket) => ({
			key: bucket.key,
			label: countryName(bucket.label),
			value: bucket.films.length
		}))
	);
	const genreBars = $derived<Bar[]>(
		data.genres.slice(0, 12).map((bucket) => ({
			key: bucket.key,
			label: bucket.label,
			value: bucket.films.length
		}))
	);
	const directorBars = $derived<Bar[]>(
		data.directors.map((bucket) => ({
			key: bucket.key,
			label: bucket.label,
			value: bucket.films.length
		}))
	);

	/**
	 * Twenty-minute bands: fine enough to show the shape, coarse enough to have
	 * one. A band nothing we watched falls in is left out rather than drawn empty.
	 */
	const runtimeBuckets = $derived.by(() => {
		const spread = data.runtimes;
		if (!spread) return [];
		const step = 20;
		const first = Math.floor(spread.min / step) * step;
		const last = Math.floor(spread.max / step) * step;
		const out: { key: string; label: string; films: number[] }[] = [];
		for (let low = first; low <= last; low += step) {
			const films = spread.films.filter((f) => f.runtime >= low && f.runtime < low + step);
			if (films.length) {
				out.push({ key: `min${low}`, label: `${low}-${low + step - 1}`, films: films.map((f) => f.id) });
			}
		}
		return out;
	});
	const runtimeBars = $derived<Bar[]>(
		runtimeBuckets.map((bucket) => ({ key: bucket.key, label: bucket.label, value: bucket.films.length }))
	);

	/* ---------------------------------------------------------- the voting -- */

	type Voting = NonNullable<PageData['voting']>;
	const NO_VOTING: Voting = {
		rounds: [],
		habits: { rounds: [], people: [], leaderWon: 0, decided: 0, halfFrom: 0, voters: 0 }
	};
	const voting = $derived(data.voting ?? NO_VOTING);
	const share = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
	const percent = (part: number, whole: number) => (whole ? (part / whole) * 100 : null);
	const dayOf = $derived(
		new Intl.DateTimeFormat(data.lang, { day: 'numeric', month: 'numeric', timeZone: TIMEZONE })
	);
	const decimal = $derived(new Intl.NumberFormat(data.lang, { maximumFractionDigits: 1 }));

	const listRounds = $derived([...voting.rounds].reverse());
	const roundLabels = $derived(listRounds.map((round) => dayOf.format(new Date(round.closesAt))));
	const roundFacts = (round: Voting['rounds'][number]) =>
		[
			T.histVoted(round.voters, round.roster),
			round.full !== null && T.histFull(round.full),
			T.histPoints(round.points, round.films),
			round.winnerTitle && T.histOnWinner(round.onWinner, share(round.onWinner, round.points)),
			!round.open && T.histRoom(round.room)
		]
			.filter(Boolean)
			.join(' · ');
	const shareLines = $derived([
		{
			key: 'voted',
			label: T.histVotedShare,
			colour: 'var(--accent)',
			values: listRounds.map((round) => percent(round.voters, round.roster))
		},
		{
			key: 'full',
			label: T.histFullShare,
			colour: 'var(--tier5)',
			values: listRounds.map((round) => (round.full === null ? null : percent(round.full, round.voters)))
		},
		{
			key: 'winner',
			label: T.histWinnerShare,
			colour: 'var(--warn)',
			values: listRounds.map((round) => (round.winnerTitle ? percent(round.onWinner, round.points) : null))
		}
	]);

	const habits = $derived(voting.habits);
	const habitSum = (of: (round: Voting['habits']['rounds'][number]) => number) =>
		habits.rounds.reduce((all, round) => all + of(round), 0);
	const habitCards = $derived.by((): StatCard[] => {
		const voters = habitSum((r) => r.voters);
		const points = habitSum((r) => r.points);
		if (!voters) return [];
		const longest = habits.people
			.filter((p) => p.streak)
			.sort((a, b) => b.streak!.rounds - a.streak!.rounds)[0];
		return [
			{ key: 'one', value: `${share(habitSum((r) => r.oneFilm), voters)}%`, label: T.habCardOne },
			{ key: 'again', value: `${share(habitSum((r) => r.again), points)}%`, label: T.habCardAgain },
			{ key: 'own', value: `${share(habitSum((r) => r.own), points)}%`, label: T.habCardOwn },
			...(habits.decided
				? [{ key: 'leader', value: `${habits.leaderWon}/${habits.decided}`, label: T.habCardLeader }]
				: []),
			{ key: 'half', value: `${habits.halfFrom}/${habits.voters}`, label: T.habCardHalf },
			...(longest
				? [
						{
							key: 'run',
							value: String(longest.streak!.rounds),
							label: T.habCardRun,
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
			label: T.habOneLine,
			colour: 'var(--accent)',
			values: habits.rounds.map((r) => percent(r.oneFilm, r.voters))
		},
		{
			key: 'again',
			label: T.habAgainLine,
			colour: 'var(--tier5)',
			values: habits.rounds.map((r) => percent(r.again, r.points))
		},
		{
			key: 'own',
			label: T.habOwnLine,
			colour: 'var(--burn0)',
			values: habits.rounds.map((r) => percent(r.own, r.points))
		}
	]);

	/**
	 * Splitting along, coming back up: where each person sits, a face apiece.
	 * Coming back takes rounds to come back from, so a newcomer would only sit at zero
	 */
	const habitDots = $derived(
		habits.people
			.filter((row) => row.rounds >= 3)
			.map((row) => ({
				key: row.person.id,
				name: row.person.name,
				colour: row.person.colour,
				avatar: row.person.avatar,
				xp: row.person.xp,
				x: Math.round(row.films * 10) / 10,
				y: share(row.again, row.points)
			}))
	);
	const habitXMax = $derived(Math.max(1, Math.ceil(Math.max(0, ...habitDots.map((dot) => dot.x)))));
	const habitOf = (key: string) => habits.people.find((row) => row.person.id === key)!;
</script>

<nav class="seg lenses">
	<a href={href({ lens: 'people' })} class:on={data.lens === 'people'}>{T.lensPeople}</a>
	<a href={href({ lens: 'films' })} class:on={data.lens === 'films'}>{T.lensFilms}</a>
	<a href={href({ lens: 'voting' })} class:on={data.lens === 'voting'}>{T.lensVoting}</a>
</nav>

{#if data.lens === 'people'}
	<div class="erabar">
		<nav class="seg small">
			<a href={href({ era: 'app' })} class:on={data.era === 'app'}>{T.eraApp}</a>
			<a href={href({ era: 'all' })} class:on={data.era === 'all'}>{T.eraAll}</a>
		</nav>
		<p class="explain">
			{data.era === 'app'
				? T.eraNoteApp(data.window.from, data.window.to)
				: T.eraNoteAll(data.window.from, data.window.to)}
		</p>
	</div>

	{#if focus}
		<div class="pcard">
			<span class="who">
				<Avatar
					name={focus.engaged.person.name}
					colour={focus.engaged.person.colour}
					avatar={focus.engaged.person.avatar}
					xp={focus.engaged.person.xp}
					size={34}
					font={13}
					titled={false}
				/>
				<b>{focus.engaged.person.name}</b>
				<button class="clear" onclick={() => (lit = null)} aria-label={T.close}>×</button>
			</span>
			<div class="pstats">
				<span>{focus.engaged.roundsVoted}<i>{T.engageX}</i></span>
				<span>{focus.engaged.nightsAttended}<i>{T.engageY}</i></span>
				<span>{focus.engaged.points}<i>{T.unit(focus.engaged.points, votes)}</i></span>
				{#if focus.nights}
					<span>{focus.nights.nights}<i>{T.thWatched}</i></span>
				{/if}
				{#if focus.open && focus.open.own + focus.open.others > 0}
					<span
						>{Math.round(
							(focus.open.others / (focus.open.own + focus.open.others)) * 100
						)}%<i>{T.openTag}</i></span
					>
				{/if}
				{#if focus.when && focus.when.median !== null}
					<span>{Math.round(focus.when.median * 100)}%<i>{T.timingH}</i></span>
				{/if}
				{#if focus.seen}
					<span>{focus.seen}<i>{T.rewatchTag}</i></span>
				{/if}
			</div>

			<!-- the arithmetic behind the openness figure, so the percentage is
			     something to be read rather than taken on trust -->
			{#if focus.open && focus.open.own + focus.open.others > 0}
				<div class="pbreak">
					{#each [{ mine: false, total: focus.open.others }, { mine: true, total: focus.open.own }] as group (group.mine)}
						{@const spent = focus.open.films.filter((film) => film.mine === group.mine)}
						{#if spent.length}
							<div class="ghead" class:mine={group.mine}>
								<span>{group.mine ? T.openMine : T.openTheirs}</span>
								<b>{group.total}</b>
							</div>
							{#each spent as film (film.id)}
								<div class="grow">
									<span>{film.title}</span>
									<b>{film.points}</b>
								</div>
							{/each}
						{/if}
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- each chart is a panel: on a phone a panel is nothing at all and the page
	     is the column it always was; on a desktop they become cards, paired up
	     two to a row (app.css, "the stats board") -->
	<div class="sboard">
		<section class="spanel wide">
			<div class="sec">{T.roundsH}</div>
			<p class="explain">{T.roundsSub}</p>
			<Columns
				{columns}
				roster={counts.roster}
				votedLabel={T.keyVoted}
				attendedLabel={T.keyAttended}
				rosterLabel={T.keyRoster}
			/>
		</section>

		{#if !voted}
			<p class="explain big">{T.statsEmpty}</p>
		{:else}
			<section class="spanel open">
				<div class="sec">{T.openH}</div>
				<p class="explain">{T.openSub(votes)}</p>
				<!-- the invitation, spent the moment it is taken: once a row has been
				     pressed the card above says what pressing one does -->
				{#if !lit}
					{@render invite(T.pickHint)}
				{/if}
				{#if opennessAverage !== null}
					<p class="explain key">
						<span class="k theirs">{T.openTheirs}</span>
						<span class="k mine">{T.openMine}</span>
						<span class="k rule">{T.avgOf(`${Math.round(opennessAverage * 100)}%`)}</span>
					</p>
				{/if}
				<Split
					slices={opennessSlices}
					average={opennessAverage}
					{lit}
					onpick={pick}
					onface={hover}
				/>
			</section>
			<section class="spanel fair">
				<div class="sec">{T.fairH}</div>
				<Split
					slices={nightSlices}
					leftColour="var(--burn0)"
					average={null}
					{lit}
					onpick={pick}
					onface={hover}
				/>
			</section>

			<section class="spanel timing">
				<div class="sec">{T.timingH}</div>
				<p class="explain">{T.timingSub}</p>
				<Strip
					{lanes}
					ticks={[
						{ at: 0, label: T.tickOpens },
						{ at: 0.5, label: T.tickHalf },
						{ at: 1, label: T.tickCloses }
					]}
					{lit}
					onpick={pick}
					onface={hover}
				/>
			</section>

			<section class="spanel wide engage">
				<div class="sec">{T.engageH}</div>
				<Scatter
					{dots}
					xMax={counts.rounds}
					yMax={counts.rooms}
					xTitle={T.engageX}
					yTitle={T.engageY}
					{lit}
					onpick={pick}
					onface={hover}
				/>
			</section>
		{/if}

		{#if rewatchSlices.length}
			<section class="spanel seen">
				<div class="sec">{T.rewatchH}</div>
				<p class="explain">{T.rewatchSub(data.rewatches.evenings)}</p>
				<Split
					slices={rewatchSlices}
					leftColour="var(--tier5)"
					average={null}
					{lit}
					onpick={pick}
					onface={hover}
				/>
			</section>
		{/if}

		{#if data.backing.links.length}
			<section class="spanel wide backs">
				<div class="sec">{T.ringH}</div>
				<p class="explain">{T.ringSub(votes)}</p>
				{#if !lit}{@render invite(T.ringHint)}{/if}
				<div class="ringpair">
					{#each sides as side (side.mode)}
						<div class="ringside">
							<div class="ghead">{side.title}</div>
							<Ring
								{seats}
								ties={data.backing.links}
								mode={side.mode}
								{lit}
								onpick={pick}
								onface={hover}
								label={tieTip}
							/>
							{#if side.rows}
								<div class="ringlist">
									{#each side.rows as row (row.id)}
										<span class="grow"><span>{row.label}</span><b>{row.points}</b></span>
									{:else}
										<span class="grow"><span>{T.ringNone}</span></span>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{/if}
	</div>
{:else if data.lens === 'voting'}
	<p class="explain">{T.histIntro} {T.habHint}</p>
	{#if listRounds.length > 1}
		<div class="sboard">
			<section class="spanel wide">
				<div class="sec">{T.habH}</div>
				<p class="explain">{T.habIntro}</p>
				<StatCards cards={habitCards} />
			</section>

			<section class="spanel wide">
				<div class="sec">{T.histSharesH}</div>
				<Lines lines={shareLines} labels={roundLabels}>
					{#snippet detail(i: number)}
						<b>{formatDay(listRounds[i].closesAt, data.lang)} · {listRounds[i].open ? T.histOpen : (listRounds[i].winnerTitle ?? T.histNoFilm)}</b><br />
						{roundFacts(listRounds[i])}
					{/snippet}
				</Lines>
			</section>

			<section class="spanel wide">
				<div class="sec">{T.habChartH}</div>
				<Lines lines={habitLines} labels={habits.rounds.map((r) => dayOf.format(new Date(r.closesAt)))}>
					{#snippet detail(i: number)}
						<b>{formatDay(habits.rounds[i].closesAt, data.lang)}</b><br />
						{habitLines.map((line) => `${line.label} ${Math.round(line.values[i] ?? 0)}%`).join(' · ')}
					{/snippet}
				</Lines>
			</section>

			{#if habitDots.length}
				<section class="spanel wide">
					<div class="sec">{T.habPeopleH}</div>
					<Scatter
						dots={habitDots}
						xMax={habitXMax}
						yMax={100}
						xTitle={T.habX}
						yTitle={T.habY}
						{lit}
						onpick={pick}
						onface={hover}
					>
						{#snippet detail(dot: Dot)}
							{@const row = habitOf(dot.key)}
							<b>{row.person.name}</b> ·
							{T.habPerson(row.rounds, habits.rounds.length, decimal.format(row.films), share(row.again, row.points), share(row.own, row.points))}{#if row.streak}{' · '}{T.habRun(row.streak.title, row.streak.rounds)}{/if}
						{/snippet}
					</Scatter>
				</section>
			{/if}
		</div>
	{:else}
		<p class="explain big">{T.statsEmpty}</p>
	{/if}
{:else}
	<div class="sboard">
		<section class="spanel wide">
			<div class="sec">{T.factsH}</div>
			<StatCards cards={facts} />
		</section>

		<section class="spanel">
			<div class="sec">{T.decadeH}</div>
			<Bars bars={decadeBars} lit={openBucket} onpick={openBar} />
			{#if from(data.decades)}{@render picked()}{/if}
		</section>

		<section class="spanel">
			<div class="sec">{T.genreH}</div>
			<p class="explain">{T.genreSub}</p>
			<Bars bars={genreBars} colour="var(--tier5)" lit={openBucket} onpick={openBar} />
			{#if from(data.genres)}{@render picked()}{/if}
		</section>

		<section class="spanel">
			<div class="sec">{T.directorH}</div>
			{#if directorBars.length}
				<Bars bars={directorBars} colour="var(--tier1)" lit={openBucket} onpick={openBar} />
				{#if from(data.directors)}{@render picked()}{/if}
			{:else}
				<p class="explain">{T.directorNone}</p>
			{/if}
		</section>

		<section class="spanel">
			<div class="sec">{T.runtimeH}</div>
			{#if data.runtimes}
				<p class="explain">
					{T.runtimeSub(data.runtimes.min, data.runtimes.max, Math.round(data.runtimes.mean))}
				</p>
				<Bars bars={runtimeBars} colour="var(--warn)" lit={openBucket} onpick={openBar} />
				{#if from(runtimeBuckets)}{@render picked()}{/if}
			{/if}
		</section>

		{#if data.bridesmaids.length}
			<section class="spanel">
				<div class="sec">{T.bridesH}</div>
				<p class="explain">{T.bridesSub}</p>
				<div class="sfilms">
					{#each data.bridesmaids.slice(0, 8) as film (film.id)}
						<div class="sfilm">
							{#if film.posterUrl}<img src={posterSrc(film.posterUrl)} alt="" loading="lazy" />{:else}<span class="noposter"></span>{/if}
							<span class="st"><b>{film.title}</b><i>{T.filmState(film.status)}</i></span>
							<em>{film.value}×</em>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		{#if data.comebacks.length}
			<section class="spanel">
				<div class="sec">{T.backH}</div>
				<p class="explain">{T.backSub}</p>
				<div class="sfilms">
					{#each data.comebacks.slice(0, 8) as film (film.id)}
						<div class="sfilm">
							{#if film.posterUrl}<img src={posterSrc(film.posterUrl)} alt="" loading="lazy" />{:else}<span class="noposter"></span>{/if}
							<span class="st"><b>{film.title}</b><i>{T.backLine(film.drops, film.weeks)}</i></span>
							<em>{film.evening ? T.evening(film.evening) : T.filmState('active')}</em>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		{#if data.timelines.year.length || data.timelines.runtime.length}
			<section class="spanel wide">
				<div class="sec">{T.newerH}</div>
				<p class="explain">{T.newerSub}</p>
				{#if data.timelines.year.length}
					<div class="tlab">{T.newerYear}</div>
					<Trend
						points={data.timelines.year}
						colour="var(--tier5)"
						step={10}
						fmt={(value) => String(Math.round(value))}
						caption={T.newerLine}
						lang={data.lang}
					/>
				{/if}
				{#if data.timelines.runtime.length}
					<div class="tlab">{T.newerLen}</div>
					<Trend
						points={data.timelines.runtime}
						colour="var(--warn)"
						step={10}
						fmt={(value) => T.minutes(Math.round(value))}
						caption={T.newerLine}
						lang={data.lang}
					/>
				{/if}
			</section>
		{/if}

		<section class="spanel wide">
			<div class="sec">{T.countryH}</div>
			{#if data.countries.length}
				<p class="explain">{T.countrySub}</p>
				<WorldMap
					counts={countryCounts}
					names={countryName}
					lit={openBucket?.startsWith('c:') ? openBucket.slice(2) : null}
					onpick={(code) => openBar(`c:${code}`)}
				/>
				<Bars bars={countryBars} lit={openBucket} onpick={openBar} />
				{#if from(data.countries) && openBucket}
					<!-- a country off the top ten has no row above to say whose films these are -->
					{@render picked(countryName(openBucket.slice(2)))}
				{/if}
			{:else}
				<p class="explain">{T.countryNone}</p>
			{/if}
		</section>
	</div>
{/if}

<!-- what is actually in the bar somebody just tapped, listed under that chart -->
{#snippet invite(text: string)}
	<p class="hint">
		<svg
			width="15"
			height="15"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.9"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			><path d="M9 11V5.5a1.8 1.8 0 0 1 3.6 0V11" /><path
				d="M12.6 11V9.4a1.7 1.7 0 0 1 3.4 0V11"
			/><path d="M16 11v-.8a1.7 1.7 0 0 1 3.4 0V15a5.4 5.4 0 0 1-5.4 5.4h-1.7" /><path
				d="M12.6 20.4a5.4 5.4 0 0 1-4-1.9l-3-3.4a1.8 1.8 0 0 1 2.6-2.4L9 13.6"
			/></svg
		>
		{text}
	</p>
{/snippet}

{#snippet picked(title?: string)}
	{#if title}
		<div class="ptitle"><span>{title}</span><b>{filmsIn.length}</b></div>
	{/if}
	<div class="picked" class:titled={Boolean(title)}>
		{#each filmsIn as film (film.id)}
			<div class="stat">
				<span>{film.title}{film.year ? ` (${film.year})` : ''}</span>
				<b>{T.evening(film.evening)}</b>
			</div>
		{/each}
	</div>
{/snippet}

<!-- hover only: it never opens on a tap, so it has no backdrop to dismiss and
     never stands between a finger and the row it is trying to press -->
{#if peek}
	<FacePeek {peek} lang={data.lang} onclose={() => (peek = null)} />
{/if}

<svelte:window onkeydown={(event) => event.key === 'Escape' && (lit = null)} />
