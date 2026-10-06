<script lang="ts">
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';
	import { fly, scale } from 'svelte/transition';
	import { Tween } from 'svelte/motion';
	import { cubicInOut } from 'svelte/easing';
	import { REVEAL_PAUSE_MS, SETTLE_MS, TIEBREAK_MS, revealStep } from '$lib/reveal';
	import { invalidate, invalidateAll } from '$app/navigation';
	import { pollRoom } from '$lib/room-poll';
	import type { SubmitFunction } from '@sveltejs/kit';
	import RankingBallot from '$lib/components/RankingBallot.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import SeenCount from '$lib/components/SeenCount.svelte';
	import Confetti from '$lib/components/Confetti.svelte';
	import Poster from '$lib/components/Poster.svelte';
	import { dictFor } from '$lib/i18n';
	import { say } from '$lib/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const T = $derived(dictFor(data.lang));
	const roomOpen = $derived(Boolean(data.runoff));
	const rows = $derived([...(data.runoff?.tally ?? [])].sort((a, b) => a.film.id - b.film.id));
	const winningResult = $derived(data.winner?.results.find((r) => r.film.id === data.winner?.film.id));

	// §7.2: the count. The host starts it; ballots land one at a time and
	// everything on the stage is drawn from the ones that have landed so far.
	// ready → counting → (tiebreak) → shown; a room counted before this page
	// loaded opens on shown
	type Phase = 'ready' | 'counting' | 'tiebreak' | 'shown';
	let phase = $state<Phase>('shown');
	let shown = $state(Infinity);
	const total = $derived(data.winner?.rankings.length ?? 0);
	const counted = $derived(Math.min(shown, total));
	const revealed = $derived(phase === 'shown');
	const tiebreak = $derived(total > 0 && !winningResult?.beatsAll);
	const motion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1;
	// 0 while the films stand in an even, unranked triangle; 1 once the winner
	// has risen to the top of it
	const settle = new Tween(1, { duration: SETTLE_MS, easing: cubicInOut });
	let timer: ReturnType<typeof setTimeout> | undefined;
	const halt = () => (clearInterval(timer), clearTimeout(timer));
	function count() {
		halt();
		focus = null;
		settle.set(0, { duration: 0 });
		if (!total || !motion) return finish();
		phase = 'counting';
		shown = 0;
		timer = setInterval(() => {
			shown += 1;
			if (shown < total) return;
			halt();
			timer = setTimeout(() => {
				if (!tiebreak) return finish();
				phase = 'tiebreak';
				timer = setTimeout(finish, TIEBREAK_MS);
			}, REVEAL_PAUSE_MS);
		}, revealStep(total));
	}
	function finish() {
		halt();
		shown = Infinity;
		phase = 'shown';
		settle.target = 1;
		burst = true;
	}
	onDestroy(halt);

	// ranked the way tally() ranks: a film a ballot never placed shares last place
	const at = (ranking: number[], id: number, n: number) => (ranking.indexOf(id) + 1 || n) - 1;
	const filmOf = (id: number) => data.winner!.results.find((r) => r.film.id === id)!.film;
	// first places and points over the ballots counted so far; the same sums as
	// tally(), so once every ballot is in they are the recorded totals
	const live = $derived(new Map((data.winner?.results ?? []).map((row) => {
		const n = data.winner!.results.length;
		const landed = data.winner!.rankings.slice(0, counted);
		return [row.film.id, {
			votes: landed.filter((b) => b.ranking[0] === row.film.id).length,
			points: landed.reduce((sum, b) => sum + n - 1 - at(b.ranking, row.film.id, n), 0)
		}];
	})));
	// before the reveal nothing on the stage may sit in result order
	const columns = $derived(revealed ? (data.winner?.results ?? [])
		: [...(data.winner?.results ?? [])].sort((a, b) => a.film.id - b.film.id));
	const matchups = $derived(columns.flatMap((left, i) =>
		columns.slice(i + 1).map((right) => ({ left: left.film, right: right.film }))
	));

	// the triangle's geometry in its own viewBox. Unranked, the films stand even
	// with none on top; ranked, the winner takes the top and the others the base
	const EVEN = [{ x: 100, y: 125, w: 110 }, { x: 460, y: 125, w: 110 }, { x: 280, y: 410, w: 110 }];
	const RANKED = [{ x: 280, y: 118, w: 136 }, { x: 90, y: 410, w: 100 }, { x: 470, y: 410, w: 100 }];
	const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
	const places = $derived(new Map(data.winner?.results.length !== 3 ? [] : data.winner.results.map((row, i) => {
		const from = EVEN[[...data.winner!.results].sort((a, b) => a.film.id - b.film.id).indexOf(row)];
		const to = RANKED[i];
		const t = settle.current;
		return [row.film.id, { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t), w: lerp(from.w, to.w, t) }];
	})));
	// an edge runs centre to centre, stopping where it meets each poster's box
	// (and the title under it, on the way down)
	function edgeBetween(p: { x: number; y: number; w: number }, q: { x: number; y: number; w: number }) {
		const len = Math.hypot(q.x - p.x, q.y - p.y);
		const ux = (q.x - p.x) / len;
		const uy = (q.y - p.y) / len;
		const reach = (n: typeof p, dx: number, dy: number) => Math.min(
			Math.abs(dx) > 1e-6 ? (n.w / 2 + 12) / Math.abs(dx) : Infinity,
			Math.abs(dy) > 1e-6 ? (n.w * 0.75 + (dy > 0 ? 30 : 8)) / Math.abs(dy) : Infinity
		);
		const a = reach(p, ux, uy);
		const b = reach(q, -ux, -uy);
		const x1 = p.x + ux * a, y1 = p.y + uy * a, x2 = q.x - ux * b, y2 = q.y - uy * b;
		return { x1, y1, x2, y2, x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
	}

	// §7.2: a pair's score is a count of ballots, so each side is drawn as the
	// people on it
	const sides = $derived(matchups.map((pair) => {
		const n = data.winner!.results.length;
		const ballots = data.winner!.rankings.slice(0, counted).map((ballot, i) => ({ ranking: ballot.ranking, i }));
		return [
			ballots.filter((b) => at(b.ranking, pair.left.id, n) < at(b.ranking, pair.right.id, n)).map((b) => b.i),
			ballots.filter((b) => at(b.ranking, pair.left.id, n) > at(b.ranking, pair.right.id, n)).map((b) => b.i)
		];
	}));
	const named = $derived(data.winner?.rankings.filter((b) => b.name !== null).length ?? 0);
	const voterName = (i: number) => data.winner!.rankings[i].name ?? T.hostRankingGuest(i + 1 - named);
	// the pair picked on the triangle, lit up in the ballots underneath
	let focus = $state<number | null>(null);
	const focused = $derived(focus === null ? null : { pair: matchups[focus], sides: sides[focus] });
	function stance(i: number): string {
		if (!focused) return '';
		const [l, r] = focused.sides;
		const lead = l.length === r.length ? null : l.length > r.length ? l : r;
		return lead?.includes(i) ? 'pro' : l.includes(i) || r.includes(i) ? 'con' : 'off';
	}
	const pick = (i: number) => (focus = focus === i ? null : i);

	let castingFor = $state('');

	// a result arriving on this page (the host just closed the room) waits for
	// the button; one already counted, by this screen or another, is simply shown
	let met = false;
	let burst = $state(false);
	$effect(() => {
		if (!data.winner || met) return;
		met = true;
		if (data.winner.revealedAt) return;
		phase = 'ready';
		shown = 0;
		settle.set(0, { duration: 0 });
	});
	// the screen starts counting the moment the button goes down; the server only
	// has to start the phones' clock
	const reveal: SubmitFunction = (input) => {
		count();
		return submit(input);
	};

	const submit: SubmitFunction = () => async ({ result, update }) => {
		if (result.type === 'failure') {
			const body = result.data as
				| { code?: string; params?: Record<string, string | number>; message?: string }
				| undefined;
			say(T.error(body?.code ?? '', body?.params ?? {}, body?.message ?? ''), true);
		}
		await update({ reset: false });
	};

	// the projector should show the room filling up without anyone touching it
	$effect(() => {
		if (!roomOpen) return;
		return pollRoom(async () => {
			await invalidate('app:room');
			// refresh the next week's header once, when someone else closes the room
			if (!data.runoff) await invalidateAll();
		});
	});
</script>

<!-- §3.5: the room deserves to know why the obvious leader is not on the screen -->
{#snippet face(i: number, size: number)}
	{@const ballot = data.winner!.rankings[i]}
	<span class="face {stance(i)}" class:fresh={phase === 'counting' && i === shown - 1} in:scale={{ start: 0.3, duration: 260 * motion }} role="img" aria-label={voterName(i)} title={voterName(i)}><Avatar name={voterName(i)} colour={ballot.colour ?? 'var(--line3)'} avatar={ballot.avatar} xp={ballot.xp} {size} font={Math.round(size * 0.36)} titled={false} slim={size < 30} /></span>
{/snippet}

{#snippet heldNote()}
	{#if data.held.length}
		<div class="heldnote">
			<b>{T.hostHeldH}</b>
			{#each data.held as film (film.title)}
				<span>💤 {film.title} · {film.name}</span>
			{/each}
		</div>
	{/if}
{/snippet}

{#if data.runoff}
	<div class="tk hostroom">
		<!-- the two things the room needs off a projector: how to get in, and how
		     many are in already -->
		<div class="hosttop">
			<div class="joincard">
				<div class="tkqr">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html data.runoff.qr}
				</div>
				<div class="joinside">
					<div class="sec">{T.hostJoinH}</div>
					<div class="code">{data.runoff.code}</div>
					<div class="joinlink">{data.runoff.link}</div>
				</div>
			</div>

			<div class="hostcount">
				<div class="turnout">
					<b>{data.runoff.turnout}</b>
					<span>{T.turnoutWord(data.runoff.turnout)}</span>
				</div>
			</div>
		</div>

		<div class="sec">{T.hostTallyH}</div>
		<p class="hintline">{T.roomOpen}</p>
		<div class="tkfilms">
			{#each rows as row (row.film.id)}
				<div class="tkfilm">
					{#if row.film.poster_url}
						<img src={row.film.poster_url} alt="" />
					{:else}
						<div class="noimg"></div>
					{/if}
					<div class="tkbody">
						<b>{row.film.title}</b>
						<span>
							{[row.film.year, row.film.runtime ? T.minutes(row.film.runtime) : null].filter(Boolean).join(' · ')}
							· <SeenCount n={data.runoff.seen[row.film.id] ?? 0} size={12} />
						</span>
					</div>
				</div>
			{/each}
		</div>

		{@render heldNote()}

		<!-- a rescue for one dead phone, not a thing the room should have to look
		     at all evening: folded away until somebody needs it -->
		<details class="castbox">
			<summary>{T.hostCastH}</summary>
			<div class="namegrid">
				{#each data.people as person (person.id)}
					<button
						class="namebtn"
						class:on={castingFor === person.id}
						onclick={() => (castingFor = castingFor === person.id ? '' : person.id)}
					>
						<Avatar
							name={person.name}
							colour={person.colour}
							avatar={person.avatar}
							xp={person.xp}
						/>
						{person.name}
					</button>
				{/each}
			</div>

			{#if castingFor}
				<p class="hintline">{T.hostCastPick}</p>
				{#key `${data.runoff.code}:${castingFor}`}
					<RankingBallot films={rows.map((r) => r.film)} seen={data.runoff.seen}
						lang={data.lang} personId={castingFor} action="?/voteFor" />
				{/key}
			{/if}
		</details>

		<form class="hostact" method="POST" action="?/closeRunoff" use:enhance={submit}>
			<button class="bigbtn">{T.hostLock}</button>
		</form>
	</div>
{:else if data.winner}
	{@const w = data.winner}
	<!-- §7.2: the decided night on the projector, as one stage: the head-to-heads
	     on the left with the winner on top of them, the film itself on the right,
	     each pair spelt out in people across the width, and every ballot, named,
	     underneath -->
	{@const drawn = w.results.length === 3 && w.turnout > 0}
	<div class="winshow">
		<section class="stage" aria-label={T.roomResults}>
			<div class="stagetop" class:drawn>
				{#if drawn}
					<!-- posters ride inside the drawing, so the arrows and the art scale as one -->
					<svg class="triangle" viewBox="0 0 560 520" role="group" aria-label={T.hostTriangleHint}>
						<defs>
							<marker id="pair-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" /></marker>
						</defs>
						{#each matchups as pair, i (`${pair.left.id}:${pair.right.id}`)}
							{@const edge = edgeBetween(places.get(pair.left.id)!, places.get(pair.right.id)!)}
							{@const a = sides[i][0].length}
							{@const b = sides[i][1].length}
							<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
							<g class="edge" class:tied={a === b} class:muted={focus !== null && focus !== i} class:lit={focus === i}
								role="button" tabindex="0" aria-pressed={focus === i}
								onclick={() => pick(i)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(i))}>
								<title>{T.hostPairPeople(a, pair.left.title, pair.right.title)}. {T.hostPairPeople(b, pair.right.title, pair.left.title)}.</title>
								<line class="hit" x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} />
								<line x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
									marker-start={a > b ? 'url(#pair-arrow)' : undefined}
									marker-end={b > a ? 'url(#pair-arrow)' : undefined} />
								<rect x={edge.x - 38} y={edge.y - 19} width="76" height="38" rx="19" />
								<text x={edge.x} y={edge.y + 7}><tspan class="hi">{Math.max(a, b)}</tspan><tspan dx="6">:</tspan><tspan dx="6">{Math.min(a, b)}</tspan></text>
								{#if a === b && revealed}<text class="tie-label" x={edge.x} y={edge.y + 36}>{a === 0 ? T.hostPairEmpty : T.hostPairTie}</text>{/if}
							</g>
						{/each}
						{#each w.results as row (row.film.id)}
							{@const node = places.get(row.film.id)!}
							<!-- padded all round, or the winner's ring and glow are clipped at the box -->
							<foreignObject x={node.x - 80 - 36} y={node.y - node.w * 0.75 - 36} width={160 + 72} height={node.w * 1.5 + 50 + 72}>
								<div class="node" class:chosen={revealed && row.film.id === w.film.id}>
									<div class="nodeposter" style:width="{node.w}px"><Poster title={row.film.title} url={row.film.poster_url} /></div>
									<b>{row.film.title}</b>
								</div>
							</foreignObject>
						{/each}
					</svg>
				{:else}
					<div class="winposter" class:mystery={!revealed}>
						{#if revealed}<Poster title={w.film.title} url={w.film.posterUrl} />{:else}<span aria-hidden="true">?</span>{/if}
					</div>
				{/if}
				{#if phase === 'ready'}
					<!-- the vote is over and nobody, the host included, knows the result:
					     the room hears it when this button goes down -->
					<div class="countpanel">
						<div class="sec">{T.hostRevealClosed}</div>
						<div class="bignum">{total}</div>
						<div class="numword">{T.turnoutWord(total)}</div>
						<form method="POST" action="?/reveal" use:enhance={reveal}>
							<button class="bigbtn gobtn">{T.hostRevealGo}</button>
						</form>
					</div>
				{:else if phase === 'counting'}
					<div class="countpanel" aria-live="polite">
						<div class="sec">{T.hostRevealCounting}</div>
						<div class="bignum">{counted}<small> / {total}</small></div>
						<!-- the ballot that just landed, so the room can watch one list become
						     a tick on every edge at once -->
						<div class="spotslot">
							{#if shown > 0}
								{#key shown}
									<div class="sballot" in:fly={{ y: 14, duration: 240 }}>
										<div class="who">{@render face(shown - 1, 40)}<b>{voterName(shown - 1)}</b></div>
										<div class="sorder">
											{#each w.rankings[shown - 1].ranking as id, k (id)}
												{#if k}<i aria-hidden="true">›</i>{/if}
												<span class="spick">
													<span class="sposter big"><Poster title={filmOf(id).title} url={filmOf(id).poster_url} /><span class="splace">{k + 1}</span></span>
													<span class="stitle">{filmOf(id).title}</span>
												</span>
											{/each}
										</div>
									</div>
								{/key}
							{/if}
						</div>
					</div>
				{:else if phase === 'tiebreak'}
					<!-- §7.3: a cycle, so ranked points settle it, said before it is shown -->
					<div class="countpanel" aria-live="polite">
						<div class="sec">{T.hostRevealCounting}</div>
						<p class="tiebreak">{T.hostPointsWin}</p>
						<div class="pointlist">
							{#each [...columns].sort((a, b) => (live.get(b.film.id)?.points ?? 0) - (live.get(a.film.id)?.points ?? 0)) as row, k (row.film.id)}
								<div class="pointrow" in:fly={{ x: -16, duration: 260, delay: k * 380 }}>
									<span class="sposter"><Poster title={row.film.title} url={row.film.poster_url} /></span>
									<b>{row.film.title}</b>
									<em>{live.get(row.film.id)?.points}</em>
								</div>
							{/each}
						</div>
					</div>
				{:else}
				<div class="winbody" in:fly={{ y: 16, duration: 420 * motion }}>
					<div class="sec">{T.hostWinnerH}</div>
					<h1 id="win-title">{w.film.title}</h1>
					<div class="wmeta">
						{#if w.film.year}<span>{w.film.year}</span>{/if}
						{#if w.film.runtime}<span>{T.minutes(w.film.runtime)}</span>{/if}
						<span><SeenCount n={w.seen} /></span>
					</div>
					{#if w.film.overview}
						<p class="over">{w.film.overview}</p>
					{/if}
					{#if w.film.note && w.nominator}
						<div class="dnote">
							“{w.film.note}”<span class="sig">{T.noteSig(w.nominator.name)}</span>
						</div>
					{/if}
					{#if w.comments.length}
						<div class="cmts">
							<div class="sec">{T.commentsH(w.comments.length)}</div>
							{#each w.comments as comment (comment.id)}
								<div class="cmt">
									<Avatar name={comment.name} colour={comment.colour} avatar={comment.avatar}
										size={22} font={9} titled={false} xp={comment.xp} slim />
									<div>
										<div class="who">
											<b>{comment.name}</b>
											{#each comment.reacts as react (react.emoji)}
												<span class="rmini">{react.emoji}{react.people.length}</span>
											{/each}
										</div>
										<p>{comment.body}</p>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
				{/if}
			</div>

			{#if matchups.length && w.turnout > 0}
				<div class="sec" id="why-winner">{T.roomResults}</div>
				<!-- §7.2: each score is a count of ballots, so each pair is also drawn as
				     the people on either side of it, next to the film they put higher -->
				<div class="tugs">
					{#each matchups as pair, i (`${pair.left.id}:${pair.right.id}`)}
						{@const [l, r] = sides[i]}
						<button type="button" class="tug" disabled={!revealed} class:lit={focus === i} class:muted={focus !== null && focus !== i}
							aria-pressed={focus === i} onclick={() => pick(i)}
							title={`${T.hostPairPeople(l.length, pair.left.title, pair.right.title)}. ${T.hostPairPeople(r.length, pair.right.title, pair.left.title)}.`}>
							<span class="tugside left" class:loser={l.length < r.length}>{#each l as v (v)}{@render face(v, 32)}{/each}</span>
							<span class="tugfilm left"><span class="tugposter"><Poster title={pair.left.title} url={pair.left.poster_url} /></span><b>{pair.left.title}</b></span>
							<span class="tugscore"><b class:hi={l.length > r.length}>{l.length}</b>:<b class:hi={r.length > l.length}>{r.length}</b></span>
							<span class="tugfilm"><span class="tugposter"><Poster title={pair.right.title} url={pair.right.poster_url} /></span><b>{pair.right.title}</b></span>
							<span class="tugside right" class:loser={r.length < l.length}>{#each r as v (v)}{@render face(v, 32)}{/each}</span>
						</button>
					{/each}
				</div>
				{#if revealed}
					<div class="hintrow">
						<p class="reason">{T.hostPairHint}</p>
						<button type="button" class="linkbtn" onclick={count}>{T.hostReplay}</button>
					</div>
					{#if tiebreak}
						<p class="reason">{T.hostPointsWin}</p>
					{/if}
				{/if}
			{:else}
				{#if revealed}<p class="reason">{w.results.length === 1 ? T.hostOnlyFilm : T.hostNoVotes}</p>{/if}
			{/if}
		</section>

		{#if w.turnout > 0 && w.results.length > 1}
			<section class="ballots" aria-labelledby="ballots-h">
				<div class="ballotshead">
					<div class="sec" id="ballots-h">{T.hostRankings}</div>
					<span class="turnchip"><b>{counted}</b> {T.turnoutWord(counted)}</span>
				</div>
				<!-- one card a film, its rows of faces level with its neighbours', so a
				     glance across reads "who put what first" -->
				{#if focused}
					<div class="focusbar" aria-live="polite">
						{#each [0, 1] as s (s)}
							{@const film = s ? focused.pair.right : focused.pair.left}
							{@const other = s ? focused.pair.left : focused.pair.right}
							<span class:lead={focused.sides[s].length > focused.sides[1 - s].length}>{T.hostPairPeople(focused.sides[s].length, film.title, other.title)}</span>
						{/each}
						<button type="button" onclick={() => (focus = null)}>{T.hostPairClear}</button>
					</div>
				{/if}
				<div class="rankgrid" style:--films={w.results.length}>
					{#each columns as row (row.film.id)}
						<div class="rankcol" class:chosen={revealed && row.film.id === w.film.id}
							class:aside={focused && focused.pair.left.id !== row.film.id && focused.pair.right.id !== row.film.id}>
							<div class="rankhead">
								<div class="rankposter"><Poster title={row.film.title} url={row.film.poster_url} /></div>
								<div class="ranktitle">
									<b>{row.film.title}</b>
									{#if revealed && row.film.id === w.film.id}<span class="winchip">{T.roomWinner}</span>{/if}
								</div>
								<div class="rankstats">
									<div><b>{live.get(row.film.id)?.votes}</b><i>{T.hostFirstChoices}</i></div>
									<div><b>{live.get(row.film.id)?.points}</b><i>{T.hostRankPoints}</i></div>
								</div>
							</div>
							{#each w.results as _, rank (rank)}
								<div class="tier">
									<span class="place">{rank + 1}</span>
									<div class="faces">
										{#each w.rankings as ballot, i (i)}
											{#if i < shown && ballot.ranking[rank] === row.film.id}{@render face(i, 34)}{/if}
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{/each}
				</div>
				{#if w.rankings.some((b) => b.legacy)}<p class="reason">{T.hostLegacyRanking}</p>{/if}
			</section>
		{/if}
	</div>
{:else}
	<!-- nothing is happening yet, so the screen is one card and one button -->
	<div class="hostidle">
		<p class="idlelead">{T.hostIdle}</p>
		<form method="POST" action="?/close" use:enhance={submit}>
			<button class="bigbtn">{T.hostClose}</button>
		</form>
	</div>
	{@render heldNote()}
{/if}

{#if burst}
	<Confetti count={120} duration={2400} onDone={() => (burst = false)} />
{/if}

<style>
	/* the decided night on the projector: one film, said big. This screen is a
	   moment rather than a page, so it takes the room's width, not the phone's */
	/* the shortlist on the projector, before the count: posters a size the back of
	   the room can read, each named under its art the way the list names its cards */
	.tkfilms { max-width: 980px; margin-left: auto; margin-right: auto; }
	.tkbody { display: flex; flex-direction: column; gap: 5px; padding: 14px 14px 16px; }
	.tkbody b { font-size: 18px; line-height: 1.25; color: var(--ink); }
	.tkbody span { display: flex; justify-content: center; align-items: center; gap: 4px; color: var(--dim); font-size: 13px; }
	.winshow { display: grid; gap: 18px; padding-top: 8px; }
	.stage,
	.ballots {
		background: var(--card);
		border-radius: var(--r);
		box-shadow: var(--lift);
		padding: 24px;
	}
	/* the drawing and the film share the top of the stage; without a drawing the
	   poster stands where it would have been */
	.stagetop { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 32px; align-items: start; }
	.stagetop.drawn { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); align-items: center; }
	.winposter {
		aspect-ratio: 2/3;
		border-radius: 14px;
		overflow: hidden;
		background: var(--raise);
		box-shadow: 0 0 0 2px var(--accent), 0 26px 60px -22px var(--shadow);
	}
	.winposter :global(img) { display: block; width: 100%; height: 100%; object-fit: cover; }
	.winbody { flex: 1; min-width: 0; }
	.winbody > .sec:first-child { margin-top: 2px; color: var(--accent); }
	.winbody h1 { margin: 0; font-size: 34px; line-height: 1.1; letter-spacing: -0.02em; overflow-wrap: anywhere; }
	.wmeta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
	.wmeta span {
		display: inline-flex;
		align-items: center;
		padding: 4px 10px;
		border-radius: 99px;
		background: var(--raise);
		color: var(--ink2);
		font-size: 12.5px;
		font-variant-numeric: tabular-nums;
	}
	.winbody .over { font-size: 14px; line-height: 1.6; color: var(--ink2); margin-top: 14px; }
	.winbody .dnote { margin-top: 14px; }
	.winbody .cmts { margin-top: 4px; }
	.winbody .cmts .sec { margin: 18px 0 2px; }

	#why-winner { margin: 28px 0 0; padding-top: 22px; border-top: 1px solid var(--line); }
	.ballotshead .sec { margin: 0; }
	.triangle { display: block; width: 100%; height: auto; overflow: visible; }
	.edge line { stroke: var(--accent); stroke-width: 2.5; stroke-linecap: round; }
	.edge rect { fill: var(--raise); }
	.edge text { fill: var(--dim); text-anchor: middle; font-size: 19px; font-weight: 800; font-variant-numeric: tabular-nums; }
	.edge text .hi { fill: var(--ink); }
	.edge.tied line { stroke: var(--line3); stroke-dasharray: 6 7; }
	.edge.tied text .hi { fill: var(--dim); }
	.edge { cursor: pointer; outline: none; transition: opacity 0.2s; }
	.edge line.hit { stroke: transparent; stroke-width: 26; }
	.edge.muted { opacity: 0.25; }
	.edge:hover rect, .edge:focus-visible rect, .edge.lit rect { fill: color-mix(in srgb, var(--accent) 22%, var(--raise)); }
	.edge.lit text .hi { fill: var(--accent); }
	.hintrow { display: flex; align-items: center; gap: 12px; min-height: 52px; margin-top: 10px; }
	.hintrow .reason { margin: 0; }
	/* the right of the stage before the reveal: the count, said big */
	.countpanel { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 12px 0; }
	.countpanel .sec { margin: 0 0 6px; font-size: 15px; color: var(--accent); }
	.bignum { font-size: 96px; font-weight: 800; line-height: 1; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; }
	/* the big figure's tight tracking would otherwise pull the slash into it */
	.bignum small { margin-left: 14px; font-size: 40px; color: var(--dim); letter-spacing: 0; }
	.numword { color: var(--dim); font-size: 15px; font-weight: 650; }
	.countpanel form { width: 100%; max-width: 360px; }
	.gobtn { margin-top: 26px; padding: 20px 0; font-size: 20px; font-weight: 800; }
	.spotslot { width: 100%; min-height: 360px; display: grid; place-items: center; margin-top: 18px; }
	.sballot { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 26px; }
	/* room for the face's glow and its landing-size bump before the name starts */
	.sballot .who { display: flex; align-items: center; gap: 22px; }
	.sballot .who b { font-size: 22px; }
	.sorder { width: 100%; display: flex; justify-content: center; align-items: flex-start; gap: 10px; }
	.sorder i { flex: none; align-self: center; margin-top: -24px; font-style: normal; color: var(--dim); font-weight: 800; font-size: 26px; }
	/* one film of the ballot that just landed: big enough to read off a projector
	   at the back of the room, with its place pinned to the corner */
	.spick { flex: 0 1 140px; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; }
	.sposter.big { position: relative; width: 100%; border-radius: 10px; box-shadow: var(--lift); }
	.spick:first-child .sposter.big { box-shadow: 0 0 0 3px var(--accent), var(--lift); }
	.splace {
		position: absolute;
		top: 6px;
		left: 6px;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		display: grid;
		place-content: center;
		background: var(--accent);
		color: var(--accent-ink);
		font-size: 15px;
		font-weight: 800;
		box-shadow: 0 2px 8px var(--shadow);
	}
	.stitle { font-size: 13px; font-weight: 650; line-height: 1.25; color: var(--ink2); text-align: center; overflow-wrap: anywhere; }
	.sposter { flex: none; width: 52px; aspect-ratio: 2/3; border-radius: 7px; overflow: hidden; background: var(--raise); }
	.sposter :global(img) { display: block; width: 100%; height: 100%; object-fit: cover; }
	.countpanel .linkbtn { margin: 10px 0 0; }
	.tiebreak { max-width: 420px; margin: 4px 0 0; color: var(--ink2); font-size: 15px; line-height: 1.5; }
	.pointlist { display: grid; gap: 8px; width: 100%; max-width: 420px; margin-top: 18px; }
	.pointrow {
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr) auto;
		align-items: center;
		gap: 14px;
		padding: 8px 14px 8px 8px;
		border-radius: 14px;
		background: color-mix(in srgb, var(--sunk) 70%, transparent);
		text-align: left;
	}
	.pointrow .sposter { width: 40px; }
	.pointrow b { font-size: 16px; }
	.pointrow em { font-style: normal; font-size: 28px; font-weight: 800; font-variant-numeric: tabular-nums; }
	.pointrow:first-child em { color: var(--accent); }
	.winposter.mystery { display: grid; place-items: center; font-size: 72px; font-weight: 800; color: var(--dim); box-shadow: var(--lift); }
	.linkbtn { margin-left: auto; flex: none; background: none; border: 0; color: var(--dim); font: inherit; font-size: 13px; cursor: pointer; text-decoration: underline; }
	.tug:disabled { cursor: default; }
	.tugs { display: grid; gap: 6px; margin-top: 10px; }
	.tug {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 150px 64px 150px minmax(0, 1fr);
		align-items: center;
		gap: 14px;
		padding: 10px 14px;
		border: 0;
		border-radius: 14px;
		background: color-mix(in srgb, var(--sunk) 70%, transparent);
		color: var(--ink);
		font: inherit;
		cursor: pointer;
		transition: opacity 0.2s, box-shadow 0.2s;
	}
	.tug:not(:disabled):hover, .tug.lit { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent); }
	.tug.muted { opacity: 0.35; }
	.tugside { display: flex; flex-wrap: wrap; gap: 4px; min-height: 32px; transition: opacity 0.2s; }
	.tugside.left { justify-content: flex-end; }
	.tugside.loser .face:not(.fresh) { opacity: 0.45; }
	.tugfilm { display: flex; align-items: center; gap: 10px; min-width: 0; }
	.tugfilm.left { flex-direction: row-reverse; text-align: right; }
	.tugfilm b { font-size: 13.5px; font-weight: 650; line-height: 1.25; color: var(--ink2); overflow-wrap: anywhere; }
	.tugposter { flex: none; width: 34px; aspect-ratio: 2/3; border-radius: 5px; overflow: hidden; background: var(--raise); }
	.tugposter :global(img) { display: block; width: 100%; height: 100%; object-fit: cover; }
	.tugscore { display: flex; justify-content: center; gap: 5px; color: var(--dim); font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
	.tugscore b { font-weight: 800; }
	.tugscore b.hi { color: var(--ink); }
	.tug.lit .tugscore b.hi { color: var(--accent); }
	.edge text.tie-label { font-size: 12px; font-weight: 600; fill: var(--dimmer); }
	.triangle foreignObject { pointer-events: none; }
	.node { padding: 36px; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
	.nodeposter {
		aspect-ratio: 2/3;
		border-radius: 9px;
		overflow: hidden;
		background: var(--raise);
		box-shadow: var(--lift);
	}
	.nodeposter :global(img) { display: block; width: 100%; height: 100%; object-fit: cover; }
	.node b { font-size: 15px; line-height: 1.25; color: var(--ink2); font-weight: 650; }
	.nodeposter { transition: box-shadow 0.4s; }
	.node.chosen .nodeposter { box-shadow: 0 0 0 3px var(--accent), 0 0 40px -6px var(--accent), var(--lift); }
	.node.chosen b { color: var(--ink); }

	.reason { margin: 14px 0 0; color: var(--dim); font-size: 13px; line-height: 1.55; }

	.ballots { grid-column: 1 / -1; }
	.ballotshead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.turnchip {
		padding: 5px 12px;
		border-radius: 99px;
		background: color-mix(in srgb, var(--accent) 16%, transparent);
		color: var(--accent);
		font-size: 12px;
		font-weight: 650;
	}
	.turnchip b { font-weight: 800; }
	/* each card is a subgrid over the same rows, so place 1 lines up across films
	   however many faces any one of them has to wrap */
	.rankgrid {
		display: grid;
		grid-template-columns: repeat(var(--films), minmax(0, 1fr));
		grid-template-rows: auto;
		grid-auto-rows: auto;
		column-gap: 14px;
		margin-top: 16px;
	}
	.rankcol {
		display: grid;
		grid-row: span calc(var(--films) + 1);
		grid-template-rows: subgrid;
		row-gap: 6px;
		padding: 14px;
		border-radius: 16px;
		background: color-mix(in srgb, var(--sunk) 70%, transparent);
	}
	.rankcol.chosen { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent); }
	.rankhead { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 4px 12px; align-items: center; margin-bottom: 6px; }
	.rankposter { grid-row: span 2; aspect-ratio: 2/3; border-radius: 7px; overflow: hidden; background: var(--raise); }
	.rankposter :global(img) { display: block; width: 100%; height: 100%; object-fit: cover; }
	.ranktitle { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
	.ranktitle b { font-size: 15px; line-height: 1.25; overflow-wrap: anywhere; }
	.ranktitle .winchip { margin: 0; }
	.rankstats { display: flex; gap: 16px; }
	.rankstats div { display: flex; flex-direction: column; }
	.rankstats b { font-size: 20px; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; }
	.rankstats i { font-style: normal; font-size: 10.5px; color: var(--dim); font-weight: 600; }
	.rankcol.chosen .rankstats b { color: var(--accent); }
	.tier {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 10px;
		border-radius: 12px;
		background: var(--card);
	}
	.place {
		flex: none;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		display: grid;
		place-content: center;
		background: var(--raise);
		color: var(--dim);
		font-size: 12px;
		font-weight: 800;
	}
	.tier:nth-child(2) .place { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); }
	.faces { display: flex; flex-wrap: wrap; gap: 6px; min-height: 34px; align-items: center; }
	.face { display: flex; border-radius: 50%; transition: opacity 0.2s, box-shadow 0.2s, transform 0.3s, filter 0.3s; }
	/* the ballot that just landed, picked out wherever its face went, so the eye
	   can follow one person across every row */
	.face.fresh { transform: scale(1.18); filter: drop-shadow(0 0 8px var(--accent)); z-index: 1; }
	/* the avatar's own ring is its level, so the side is said in brightness */
	.faces .face.con { opacity: 0.4; }
	.faces .face.off { opacity: 0.15; }
	.rankcol { transition: opacity 0.2s; }
	.rankcol.aside { opacity: 0.3; }
	.focusbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 14px;
		font-size: 13px;
	}
	.focusbar span { padding: 5px 12px; border-radius: 99px; background: var(--raise); color: var(--ink2); }
	.focusbar span.lead { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); font-weight: 650; }
	.focusbar button { margin-left: auto; background: none; border: 0; color: var(--dim); font: inherit; cursor: pointer; text-decoration: underline; }
	@media (prefers-reduced-motion: reduce) {
		.edge, .face, .rankcol, .tug, .tugside { transition: none; }
	}

	/* the proxy ballot sits in a card on a desktop: no thumb to keep the save near */
	.castbox :global(.rankbar) { position: static; margin: 0; padding: 14px 0 0; background: none; }

	@media (max-width: 900px) {
		.stagetop, .stagetop.drawn { grid-template-columns: minmax(0, 1fr); gap: 20px; }
		.rankgrid { grid-template-columns: minmax(0, 1fr); row-gap: 12px; }
		.rankcol { grid-row: auto; grid-template-rows: none; }
		.tug { grid-template-columns: minmax(0, 1fr) 34px 56px 34px minmax(0, 1fr); gap: 8px; }
		.tugfilm b { display: none; }
	}
	@media (max-width: 560px) {
		.winposter { width: 160px; justify-self: center; }
		.winbody h1 { font-size: 26px; }
		.stage, .ballots { padding: 16px; }
		.rankcol { padding: 10px; }
	}
</style>
