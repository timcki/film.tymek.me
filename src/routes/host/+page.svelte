<script lang="ts">
	import { enhance } from '$app/forms';
	import { onDestroy, tick } from 'svelte';
	import { fly, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { unfold } from '$lib/unfold';
	import { REVEAL_PAUSE_MS, revealStep } from '$lib/reveal';
	import { invalidate, invalidateAll } from '$app/navigation';
	import { pollRoom } from '$lib/room-poll';
	import type { SubmitFunction } from '@sveltejs/kit';
	import RankingBallot from '$lib/components/RankingBallot.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import SeenCount from '$lib/components/SeenCount.svelte';
	import Confetti from '$lib/components/Confetti.svelte';
	import BatBurst from '$lib/components/BatBurst.svelte';
	import Poster from '$lib/components/Poster.svelte';
	import Pumpkin from '$lib/components/Pumpkin.svelte';
	import PointsRace from '$lib/components/PointsRace.svelte';
	import { lights } from '$lib/lights';
	import { dictFor } from '$lib/i18n';
	import { say } from '$lib/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const T = $derived(dictFor(data.lang));
	const roomOpen = $derived(Boolean(data.runoff));
	const rows = $derived([...(data.runoff?.tally ?? [])].sort((a, b) => a.film.id - b.film.id));

	// §7.2: the count. The host starts it; ballots land one at a time and the
	// race on the stage is drawn from the ones that have landed so far.
	// ready → counting → shown; a room counted before this page loaded opens on
	// shown
	type Phase = 'ready' | 'counting' | 'shown';
	let phase = $state<Phase>('shown');
	let shown = $state(Infinity);
	const total = $derived(data.winner?.rankings.length ?? 0);
	const counted = $derived(Math.min(shown, total));
	const revealed = $derived(phase === 'shown');
	const motion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const halt = () => (clearInterval(timer), clearTimeout(timer));
	function count() {
		halt();
		if (!total || !motion) return finish();
		phase = 'counting';
		shown = 0;
		timer = setInterval(() => {
			shown += 1;
			if (shown < total) return;
			halt();
			timer = setTimeout(finish, REVEAL_PAUSE_MS);
		}, revealStep(total));
	}
	async function finish() {
		halt();
		shown = Infinity;
		phase = 'shown';
		// the celebration bursts from the winner's poster once it has unfolded and
		// grown into place (see the reveal's timings in the markup)
		await tick();
		if (motion) await new Promise((done) => setTimeout(done, 2000));
		const poster = document.querySelector('.winposter')?.getBoundingClientRect();
		burstFrom = poster ? { x: poster.left + poster.width / 2, y: poster.top + poster.height / 3 } : undefined;
		burst = true;
	}
	onDestroy(halt);

	const named = $derived(data.winner?.rankings.filter((b) => b.name !== null).length ?? 0);
	const voterName = (i: number) => data.winner!.rankings[i].name ?? T.hostRankingGuest(i + 1 - named);

	let castingFor = $state('');

	/* ---------------------------------------------------------- halloween -- */

	// §3.6: a Halloween night dresses the room: a web and a spider on the way
	// in, a pumpkin lit for every ballot, fog at the posters' feet, and the
	// lights along the top shivering each time somebody's ranking lands
	const spooky = $derived(data.look === 'halloween');
	const turnout = $derived(data.runoff?.turnout ?? 0);
	// one lit for every ballot in, and a single dark one waiting for the next
	const pumpkins = $derived(Math.min(30, turnout + 1));
	let heard = -1;
	$effect(() => {
		const now = turnout;
		if (spooky && heard >= 0 && now > heard) lights.flicker();
		heard = now;
	});

	// a result arriving on this page (the host just closed the room) waits for
	// the button; one already counted, by this screen or another, is simply shown
	let met = false;
	let burst = $state(false);
	let burstFrom = $state<{ x: number; y: number } | undefined>();
	$effect(() => {
		if (!data.winner || met) return;
		met = true;
		if (data.winner.revealedAt) return;
		phase = 'ready';
		shown = 0;
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
{#snippet heldNote()}
	{#if data.held.length}
		<div class="heldnote">
			<b>{T.hostHeldH}</b>
			<div class="heldfilms">
				{#each data.held as film (film.title)}
					<span>💤 {film.title} · {film.name}</span>
				{/each}
			</div>
		</div>
	{/if}
{/snippet}

{#if data.runoff}
	<div class="tk hostroom">
		<!-- the two things the room needs off a projector: how to get in, and how
		     many are in already -->
		<div class="hosttop">
			<div class="joincard" class:haunted={spooky}>
				{#if spooky}<span class="hdangle" aria-hidden="true"></span>{/if}
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
				{#if spooky}
					<div class="patch" aria-hidden="true">
						{#each { length: pumpkins } as _, i (i)}
							<Pumpkin size={26} lit={i < turnout} live />
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<div class="tkfilms" class:foggy={spooky}>
			{#each rows as row, i (row.film.id)}
				<div class="tkfilm">
					<div class="tkart" style:--i={i}>
						{#if row.film.poster_url}
							<img src={row.film.poster_url} alt="" />
						{:else}
							<div class="noimg"></div>
						{/if}
						{#if spooky}
							<!-- fog rolling about the poster's foot, and moonlight passing over it -->
							<span class="mist" aria-hidden="true"></span>
						{/if}
					</div>
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
						lang={data.lang} personId={castingFor} action="?/voteFor" spooky={data.look === 'halloween'} />
				{/key}
			{/if}
		</details>

		<form class="hostact" method="POST" action="?/closeRunoff" use:enhance={submit}>
			<button class="bigbtn">{T.hostLock}</button>
		</form>
	</div>
{:else if data.winner}
	{@const w = data.winner}
	<!-- §7.3: the decided night on the projector: the film, said big, once the
	     count has run, and the count itself as a race of points underneath -->
	<div class="winshow">
		{#if revealed}
			<!-- the hand-over from the count: the counter folds away, the bars line
			     up, and the winner opens out above them, its poster growing into
			     place and its words arriving one after another -->
			<section
				class="winhead"
				in:unfold={{ delay: 1200 * motion, duration: 560 * motion }}
				out:unfold={{ duration: 320 * motion }}
			>
				<div class="winposter" in:scale|global={{ start: 0.86, delay: 1380 * motion, duration: 560 * motion, easing: backOut }}>
					<Poster title={w.film.title} url={w.film.posterUrl} />
				</div>
				<div class="winbody">
					<div class="sec" in:fly|global={{ y: 10, delay: 1460 * motion, duration: 380 * motion }}>{T.hostWinnerH}</div>
					<h1 id="win-title" in:fly|global={{ y: 12, delay: 1540 * motion, duration: 420 * motion }}>{w.film.title}</h1>
					<div class="wmeta" in:fly|global={{ y: 10, delay: 1640 * motion, duration: 380 * motion }}>
						{#if w.film.year}<span>{w.film.year}</span>{/if}
						{#if w.film.runtime}<span>{T.minutes(w.film.runtime)}</span>{/if}
						<span><SeenCount n={w.seen} /></span>
					</div>
					{#if w.film.overview}
						<p class="over" in:fly|global={{ y: 10, delay: 1720 * motion, duration: 400 * motion }}>{w.film.overview}</p>
					{/if}
					{#if w.film.note && w.nominator}
						<div class="dnote" in:fly|global={{ y: 10, delay: 1800 * motion, duration: 400 * motion }}>
							“{w.film.note}”<span class="sig">{T.noteSig(w.nominator.name)}</span>
						</div>
					{/if}
				</div>
			</section>
		{:else if phase === 'ready'}
			<!-- the vote is over and nobody, the host included, knows the result:
			     the room hears it when this button goes down -->
			<section class="countpanel" out:unfold={{ duration: 300 * motion }}>
				<div class="sec">{T.hostRevealClosed}</div>
				<div class="bignum">{total}</div>
				<div class="numword">{T.turnoutWord(total)}</div>
				<form method="POST" action="?/reveal" use:enhance={reveal}>
					<button class="bigbtn gobtn">{T.hostRevealGo}</button>
				</form>
			</section>
		{:else}
			<section
				class="countpanel counting"
				aria-live="polite"
				in:unfold={{ duration: 360 * motion }}
				out:unfold={{ duration: 320 * motion }}
			>
				<div class="sec">{T.hostRevealCounting}</div>
				<div class="bignum">{counted}<small> / {total}</small></div>
			</section>
		{/if}

		{#if w.turnout > 0 && w.results.length > 1}
			<section class="stage" aria-label={T.roomResults}>
				<PointsRace
					films={w.results.map((row) => row.film)}
					winnerId={w.film.id}
					ballots={w.rankings.map((ballot, i) => ({
						name: voterName(i),
						colour: ballot.colour ?? 'var(--line3)',
						avatar: ballot.avatar,
						xp: ballot.xp ?? 0,
						ranking: ballot.ranking
					}))}
					{counted}
					{revealed}
					lang={data.lang}
					spooky={data.look === 'halloween'}
					onreplay={count}
				/>
			</section>
		{:else if revealed}
			<p class="reason">{w.results.length === 1 ? T.hostOnlyFilm : T.hostNoVotes}</p>
		{/if}

		{#if revealed && w.comments.length}
			<section class="stage cmts">
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
			</section>
		{/if}
	</div>
{:else}
	<!-- nothing is happening yet, so the screen is one card and one button -->
	<!-- nothing is happening yet: the same stage the count stands on, waiting,
	     with the one button that starts it all -->
	<section class="countpanel idle">
		<div class="sec">{T.hostIdle}</div>
		<div class="idleart" aria-hidden="true">
			{#if data.look === 'halloween'}
				<span class="lantern"><Pumpkin size={120} live /></span>
			{:else}
				<svg viewBox="0 0 48 48"
					><path d="M7 19h34v20a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z" /><path d="m6.2 12.6 32.6-7.4 1.6 7-32.6 7.4z" /><path
						d="m14 11 4.5 6M22.5 9l4.5 6M31 7.2l4.5 6M7 26h34"
					/></svg
				>
			{/if}
		</div>
		<form method="POST" action="?/close" use:enhance={submit}>
			<button class="bigbtn gobtn">{T.hostClose}</button>
		</form>
		{@render heldNote()}
	</section>
{/if}

{#if burst}
	{#if data.look === 'halloween'}
		<BatBurst count={70} from={burstFrom} onDone={() => (burst = false)} />
	{:else}
		<Confetti count={120} duration={2400} onDone={() => (burst = false)} />
	{/if}
{/if}

<style>

	/* ---------------------------------------------------------- halloween -- */
	/* the way in, haunted: a web strung in the card's corner, faded out before
	   the rounded edge, a spider lowering itself on a thread beside it, and the
	   code glowing like the face of a lit pumpkin */
	.joincard.haunted {
		position: relative;
		background:
			radial-gradient(circle at 100% 0, transparent 34px, var(--card) 92px) no-repeat right top / 90px 90px,
			var(--web) no-repeat right top / 90px 90px,
			var(--card);
	}
	.hdangle {
		position: absolute;
		top: 0;
		right: 98px;
		width: 22px;
		height: 30px;
		background:
			var(--spider) no-repeat center bottom / 20px 22px,
			linear-gradient(var(--thread), var(--thread)) no-repeat center top / 1px calc(100% - 14px);
		animation: lower 6s ease-in-out infinite alternate;
		pointer-events: none;
	}
	@keyframes lower {
		from { height: 30px; }
		to { height: 74px; }
	}
	.haunted .code {
		color: #ffb347;
		text-shadow: 0 0 6px rgba(255, 150, 40, 0.75), 0 0 18px rgba(255, 110, 20, 0.45);
		animation: candle 3.4s infinite;
	}
	:global(:root[data-theme='light']) .haunted .code {
		color: var(--accent);
		text-shadow: 0 0 10px rgba(255, 140, 40, 0.45);
	}
	@keyframes candle {
		0%, 100% { opacity: 1; }
		8% { opacity: 0.8; }
		11% { opacity: 0.96; }
		45% { opacity: 0.88; }
		48% { opacity: 1; }
		72% { opacity: 0.76; }
		75% { opacity: 0.94; }
	}
	/* a pumpkin for every ballot, lit as each one lands */
	.patch {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 14px 10px;
		/* six to a row */
		max-width: 216px;
		margin: 18px auto 0;
		padding-top: 6px;
	}
	/* the posters stand in a low fog with the moon passing over them */
	.tkart {
		position: relative;
		overflow: hidden;
		line-height: 0;
	}
	.mist {
		--mist: rgba(214, 204, 232, 0.5);
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	:global(:root[data-theme='light']) .mist {
		--mist: rgba(255, 250, 240, 0.6);
	}
	/* the fog: soft banks drifting sideways along the foot, faded out upwards so
	   it has no top edge, each poster's at its own point in the drift */
	.mist::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 50%;
		/* each bank stays inside its tile, or the repeat cuts it off in a line */
		background:
			radial-gradient(22% 60% at 25% 75%, var(--mist), transparent),
			radial-gradient(20% 50% at 50% 90%, var(--mist), transparent),
			radial-gradient(22% 65% at 75% 78%, var(--mist), transparent);
		background-size: 200% 100%;
		-webkit-mask-image: linear-gradient(transparent, #000 55%);
		mask-image: linear-gradient(transparent, #000 55%);
		animation: drift 22s linear infinite;
		animation-delay: calc(var(--i) * -7s);
	}
	@keyframes drift {
		from { background-position: 0 0; }
		to { background-position: -200% 0; }
	}
	/* moonlight: a pale band sweeping slowly across, one poster after another */
	.mist::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(105deg, transparent 38%, rgba(235, 238, 255, 0.2) 50%, transparent 62%) no-repeat;
		background-size: 300% 100%;
		mix-blend-mode: screen;
		animation: moonlight 12s ease-in-out infinite;
		animation-delay: calc(var(--i) * 1.4s);
	}
	@keyframes moonlight {
		0%, 30% { background-position: 110% 0; }
		70%, 100% { background-position: -10% 0; }
	}
	@media (prefers-reduced-motion: reduce) {
		.hdangle, .haunted .code, .mist::before, .mist::after { animation: none; }
	}

	/* the decided night on the projector: one film, said big. This screen is a
	   moment rather than a page, so it takes the room's width, not the phone's */
	/* the shortlist on the projector, before the count: posters a size the back of
	   the room can read, each named under its art the way the list names its cards */
	.tkfilms { max-width: 980px; margin-left: auto; margin-right: auto; }
	.tkbody { display: flex; flex-direction: column; gap: 5px; padding: 14px 14px 16px; }
	.tkbody b { font-size: 18px; line-height: 1.25; color: var(--ink); }
	.tkbody span { display: flex; justify-content: center; align-items: center; gap: 4px; color: var(--dim); font-size: 13px; }
	/* the decided night: one column a projector's width, the film first */
	.winshow { display: grid; gap: 18px; padding-top: 8px; max-width: 1040px; margin: 0 auto; }
	.stage {
		background: var(--card);
		border-radius: var(--r);
		box-shadow: var(--lift);
		padding: 24px;
	}
	.winhead { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 28px; align-items: start; }
	.winposter {
		aspect-ratio: 2/3;
		border-radius: 14px;
		overflow: hidden;
		background: var(--raise);
		box-shadow: 0 0 0 3px var(--accent), 0 0 44px -10px var(--accent), 0 26px 60px -22px var(--shadow);
	}
	.winposter :global(img) { display: block; width: 100%; height: 100%; object-fit: cover; }
	.winbody { min-width: 0; padding-top: 6px; }
	.winbody > .sec:first-child { margin: 0 0 4px; color: var(--accent); font-size: 15px; }
	.winbody h1 { margin: 0; font-size: 46px; line-height: 1.05; letter-spacing: -0.02em; overflow-wrap: anywhere; }
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
	.winbody .over { font-size: 15px; line-height: 1.6; color: var(--ink2); margin: 14px 0 0; max-width: 62ch; }
	.winbody .dnote { margin-top: 14px; }
	.cmts .sec { margin: 0 0 4px; }
	/* before the reveal: the count, said big */
	.countpanel { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 12px 0; }
	.countpanel .sec { margin: 0 0 6px; font-size: 15px; color: var(--accent); }
	.bignum { font-size: 96px; font-weight: 800; line-height: 1; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; }
	.countpanel.counting .bignum { font-size: 72px; }
	/* the big figure's tight tracking would otherwise pull the slash into it */
	.bignum small { margin-left: 14px; font-size: 40px; color: var(--dim); letter-spacing: 0; }
	.numword { color: var(--dim); font-size: 15px; font-weight: 650; }
	.countpanel form { width: 100%; max-width: 360px; }
	.gobtn { margin-top: 26px; padding: 20px 0; font-size: 20px; font-weight: 800; }
	/* before anything: the stage waiting, its centrepiece floating in its own light */
	.countpanel.idle { padding-top: 7vh; }
	.idleart {
		display: grid;
		place-items: center;
		width: 220px;
		height: 200px;
		margin-top: 8px;
		background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 22%, transparent), transparent);
	}
	.idleart svg { width: 104px; height: 104px; fill: none; stroke: var(--accent); stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; }
	.lantern { display: inline-flex; animation: lantern 3.6s ease-in-out infinite; }
	@keyframes lantern {
		0%, 100% { transform: translateY(0) rotate(-2deg); }
		50% { transform: translateY(-8px) rotate(2deg); }
	}
	.countpanel.idle .gobtn { margin-top: 10px; }
	/* §3.5: what stepped aside this week, as a label over a few quiet chips */
	.heldnote { display: grid; justify-items: center; gap: 8px; margin-top: 26px; }
	.heldnote b { font-size: 13px; font-weight: 650; color: var(--dim); }
	.heldfilms { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
	.heldfilms span { padding: 6px 13px; border-radius: 99px; background: var(--raise); color: var(--ink2); font-size: 13.5px; }
	@media (prefers-reduced-motion: reduce) {
		.lantern { animation: none; }
	}
	.reason { margin: 14px 0 0; color: var(--dim); font-size: 13px; line-height: 1.55; }

	/* the proxy ballot sits in a card on a desktop: no thumb to keep the save near */
	.castbox :global(.rankbar) { position: static; margin: 0; padding: 14px 0 0; background: none; }

	@media (max-width: 700px) {
		.winhead { grid-template-columns: minmax(0, 1fr); }
		.winposter { width: 160px; justify-self: center; }
		.winbody h1 { font-size: 30px; }
		.stage { padding: 16px; }
	}
</style>
