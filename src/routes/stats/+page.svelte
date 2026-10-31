<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import FacePeek, { peekFor, type Peek } from '$lib/components/FacePeek.svelte';
	import Bars, { type Bar } from '$lib/components/chart/Bars.svelte';
	import Columns from '$lib/components/chart/Columns.svelte';
	import Scatter, { type Dot } from '$lib/components/chart/Scatter.svelte';
	import Split, { type Slice } from '$lib/components/chart/Split.svelte';
	import StatCards, { type StatCard } from '$lib/components/chart/StatCards.svelte';
	import Strip from '$lib/components/chart/Strip.svelte';
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
		const person = data.engagement.find((row) => row.person.id === key)?.person;
		if (!person) return;
		peeking = key;
		peek = peekFor(el, person, '', false);
	}

	/** a bucket opened to see which films are actually in it */
	let openBucket = $state<string | null>(null);
	const filmsIn = $derived.by(() => {
		if (!openBucket) return [];
		const all = [...data.decades, ...data.genres, ...data.directors, ...runtimeBuckets];
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

	/** everything the page knows about the person whose row is filled in */
	const focus = $derived.by(() => {
		if (!lit) return null;
		const engaged = data.engagement.find((row) => row.person.id === lit);
		if (!engaged) return null;
		return {
			engaged,
			open: data.openness.find((row) => row.person.id === lit),
			nights: data.nights.find((row) => row.person.id === lit),
			when: data.timing.find((row) => row.person.id === lit)
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
</script>

<nav class="seg lenses">
	<a href={href({ lens: 'people' })} class:on={data.lens === 'people'}>{T.lensPeople}</a>
	<a href={href({ lens: 'films' })} class:on={data.lens === 'films'}>{T.lensFilms}</a>
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
						{T.pickHint}
					</p>
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

			<section class="spanel engage">
				<div class="sec">{T.engageH}</div>
				<Scatter
					{dots}
					xMax={counts.rounds}
					yMax={counts.nights}
					xTitle={T.engageX}
					yTitle={T.engageY}
					{lit}
					onpick={pick}
					onface={hover}
				/>
			</section>
		{/if}
	</div>
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
	</div>
{/if}

<!-- what is actually in the bar somebody just tapped, listed under that chart -->
{#snippet picked()}
	<div class="picked">
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
