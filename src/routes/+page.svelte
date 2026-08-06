<script lang="ts">
	import { enhance } from '$app/forms';
	import { flip } from 'svelte/animate';
	import { scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Avatar from '$lib/components/Avatar.svelte';
	import Poster from '$lib/components/Poster.svelte';
	import { dictFor, fmtScore, isVotes } from '$lib/i18n';
	import { levelOf } from '$lib/levels';
	import { say } from '$lib/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const T = $derived(dictFor(data.lang));
	const rules = $derived(data.rules);
	const votes = $derived(isVotes(rules));
	const left = $derived(data.person?.left ?? 0);
	const open = $derived(data.week?.status === 'open');
	const nominated = $derived(data.nominatedThisWeek);

	/* -------------------------------------------------------- vote finality -- */

	// drives the undo countdowns; 250 ms keeps the seconds display honest
	let nowMs = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (nowMs = Date.now()), 250);
		return () => clearInterval(timer);
	});

	type Graceful = { myPoints: number; myFloor: number; myGraceUntil: string | null };

	function graceLeftMs(film: Graceful): number {
		if (!film.myGraceUntil) return 0;
		return Math.max(0, new Date(film.myGraceUntil).getTime() - nowMs);
	}

	/** the undo affordance exists exactly while the server would honour it */
	function canUndo(film: Graceful): boolean {
		return open && film.myPoints > film.myFloor && graceLeftMs(film) > 0;
	}

	const undoSeconds = (film: Graceful) => Math.ceil(graceLeftMs(film) / 1000);

	/* ---------------------------------------------------- arming a vote -- */

	// the card votes in two taps: the first arms a dot, the second casts for
	// real. An armed dot not confirmed in time relaxes and earns the hint
	let armed = $state<{ filmId: number } | null>(null);
	let armTimer: ReturnType<typeof setTimeout>;

	function arm(filmId: number) {
		clearTimeout(armTimer);
		armed = { filmId };
		armTimer = setTimeout(() => {
			armed = null;
			say(T.armHint);
		}, 4000);
	}

	function disarm() {
		clearTimeout(armTimer);
		armed = null;
	}

	// a tap anywhere that is not the armed pill quietly relaxes the bowstring
	function disarmElsewhere(event: PointerEvent) {
		if (!armed) return;
		const pill = event.target instanceof Element ? event.target.closest('.tri') : null;
		if (!(pill instanceof HTMLElement) || pill.dataset.film !== String(armed.filmId)) disarm();
	}

	// the reorder glide after a confirmed vote; instant for reduced motion
	const flipMs =
		typeof matchMedia === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches
			? 0
			: 450;

	/**
	 * Starts the drain ring exactly once per mount. An action rather than a style
	 * binding, because the binding would re-run on every tick and restart the
	 * CSS animation from zero.
	 */
	function drain(node: SVGElement, opts: { until: string; total: number }) {
		const leftMs = Math.max(0, new Date(opts.until).getTime() - Date.now());
		node.style.animation = `ringdrain ${opts.total}s linear -${opts.total - leftMs / 1000}s forwards`;
	}

	type Result = {
		tmdbId: number | null;
		title: string;
		year: number | null;
		thumb: string | null;
		poster: string | null;
		overview: string;
	};

	type Film = PageData['films'][number];

	/* ------------------------------------------------------------ backers -- */

	/** width of .bkpop; the clamp needs it before the popup has been laid out */
	const POP_W = 156;
	/** roughly its height, only ever used to decide whether it still fits above */
	const POP_H = 190;
	/** the note popup is wider and shorter: a paragraph, not a portrait */
	const NPOP_W = 264;
	const NPOP_H = 150;

	// what the popup needs of a person; backers and nominators both satisfy it
	type PeekFace = { name: string; colour: string; avatar: string | null; xp: number };

	let peek = $state<{
		face: PeekFace;
		sub: string;
		x: number;
		y: number;
		below: boolean;
		tap: boolean;
	} | null>(null);
	let notePop = $state<{
		text: string;
		sig: string;
		x: number;
		y: number;
		below: boolean;
		tap: boolean;
	} | null>(null);
	type ScoreRow = { week: number; points: number; mult: number; contrib: number };
	let scorePop = $state<{
		rows: ScoreRow[];
		x: number;
		y: number;
		below: boolean;
		tap: boolean;
	} | null>(null);
	let closing: ReturnType<typeof setTimeout>;
	// a mouse opens on hover and a finger on tap. A touchscreen laptop does both,
	// so go by the pointer that actually arrived rather than what the screen can do
	let mousing = false;

	/** where a fixed popup of the given size lands, clamped to the viewport */
	function anchorAt(el: HTMLElement, w: number, h: number) {
		const box = el.getBoundingClientRect();
		const half = w / 2;
		const below = box.top < h;
		return {
			// clamped, or the pills at either end of the row get sliced by the viewport
			x: Math.min(Math.max(box.left + box.width / 2, half + 8), window.innerWidth - half - 8),
			y: below ? box.bottom : box.top,
			below
		};
	}

	function peekAt(pill: EventTarget | null, face: PeekFace, sub: string, tap: boolean) {
		clearTimeout(closing);
		if (!(pill instanceof HTMLElement)) return;
		notePop = null;
		scorePop = null;
		peek = { face, sub, tap, ...anchorAt(pill, POP_W, POP_H) };
	}

	function noteAt(el: EventTarget | null, film: Film, tap: boolean) {
		clearTimeout(closing);
		if (!(el instanceof HTMLElement) || !film.note) return;
		peek = null;
		scorePop = null;
		notePop = { text: film.note, sig: T.noteSig(film.addedByName), tap, ...anchorAt(el, NPOP_W, NPOP_H) };
	}

	/** the fade arithmetic behind a score, one row per week with points */
	function scoreAt(el: EventTarget | null, film: Film, tap: boolean) {
		clearTimeout(closing);
		const weekNow = data.week?.number;
		if (!(el instanceof HTMLElement) || rules.scoring !== 'fade' || !weekNow) return;
		if (!film.weeklyPoints.length) return;
		peek = null;
		notePop = null;
		const rows = film.weeklyPoints.map((row) => {
			const mult = rules.decayFactor ** (weekNow - row.week);
			return { ...row, mult, contrib: row.points * mult };
		});
		scorePop = { rows, tap, ...anchorAt(el, NPOP_W, NPOP_H) };
	}

	function unpeek() {
		clearTimeout(closing);
		peek = null;
		notePop = null;
		scorePop = null;
	}

	// a beat of grace, so crossing the gap between two pills does not flicker
	function unpeekSoon() {
		clearTimeout(closing);
		closing = setTimeout(() => {
			peek = null;
			notePop = null;
			scorePop = null;
		}, 80);
	}

	/* ------------------------------------------------------------- sheets -- */

	let detailId = $state<number | null>(null);
	let noteEdit = $state(false);
	let searchOpen = $state(false);

	const detail = $derived(
		detailId === null
			? null
			: ([...data.films, ...data.archived].find((f) => f.id === detailId) ?? null)
	);
	const anySheet = $derived(detail !== null || searchOpen);

	function closeSheets() {
		unpeek();
		detailId = null;
		noteEdit = false;
		searchOpen = false;
		picked = null;
	}

	/* ------------------------------------------------------------- search -- */

	let query = $state('');
	let results = $state<Result[]>([]);
	let degraded = $state(false);
	let searching = $state(false);
	let picked = $state<Result | null>(null);
	let timer: ReturnType<typeof setTimeout>;

	function onQuery() {
		clearTimeout(timer);
		const q = query.trim();
		if (q.length < 2) {
			results = [];
			searching = false;
			return;
		}
		searching = true;
		timer = setTimeout(async () => {
			try {
				const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
				const body = await response.json();
				results = body.results ?? [];
				degraded = Boolean(body.degraded);
			} catch {
				degraded = true;
				results = [];
			} finally {
				searching = false;
			}
		}, 250);
	}

	const known = $derived(
		new Set([...data.films, ...data.archived].map((f) => f.title.toLowerCase()))
	);

	function byHand(): Result {
		return {
			tmdbId: null,
			title: query.trim(),
			year: null,
			thumb: null,
			poster: null,
			overview: ''
		};
	}

	/* -------------------------------------------------------------- forms -- */

	function submit(onOk?: () => void): SubmitFunction {
		return () =>
			async ({ result, update }) => {
				if (result.type === 'failure') {
					const body = result.data as
						| { code?: string; params?: Record<string, string | number>; message?: string }
						| undefined;
					say(T.error(body?.code ?? '', body?.params ?? {}, body?.message ?? ''), true);
				}
				if (result.type === 'success') onOk?.();
				await update({ reset: false });
			};
	}

	$effect(() => {
		if (!form) return;
		if ('nominated' in form && form.nominated) say(T.tNominated(form.nominated));
		if ('renominated' in form && form.renominated) say(T.tRenominated(form.renominated));
		if ('noteSaved' in form && form.noteSaved) say(T.tNoteSaved);
	});
</script>

{#snippet backerRow(film: Film)}
	<span class="backers">
		{#if film.backers.length}
			<!-- the top four by points; the rest fold into a +N that opens the
			     sheet, so the vote dot always keeps its room on one row -->
			{#each film.backers.slice(0, 4) as backer (backer.person_id)}
				<!-- a 16px face says nothing on a phone, so the pill opens a readable one -->
				<button
					class="bk"
					type="button"
					style="--bkring:var(--tier{levelOf(backer.xp)})"
					aria-label={backer.name}
					onpointerenter={(event) => {
						mousing = event.pointerType === 'mouse';
						if (mousing)
							peekAt(event.currentTarget, backer, `${backer.points} ${T.unit(backer.points, votes)}`, false);
					}}
					onpointerleave={(event) => event.pointerType === 'mouse' && unpeekSoon()}
					onclick={(event) =>
						!mousing &&
						peekAt(event.currentTarget, backer, `${backer.points} ${T.unit(backer.points, votes)}`, true)}
					onfocus={(event) => {
						// a tap focuses too, and would fight the click handler for the same pill
						if (event.currentTarget.matches(':focus-visible'))
							peekAt(event.currentTarget, backer, `${backer.points} ${T.unit(backer.points, votes)}`, false);
					}}
					onblur={unpeek}
				>
					<Avatar
						name={backer.name}
						colour={backer.colour}
						avatar={backer.avatar}
						size={16}
						font={8}
						titled={false}
					/>
					<b>{backer.points}</b>
				</button>
			{/each}
			{#if film.backers.length > 4}
				<button
					class="bk more"
					type="button"
					aria-label={film.backers
						.slice(4)
						.map((b) => b.name)
						.join(', ')}
					onclick={() => {
						unpeek();
						detailId = film.id;
					}}
				>
					+{film.backers.length - 4}
				</button>
			{/if}
		{:else}
			<span class="nobk">{T.noBackers}</span>
		{/if}
		{#if film.atRisk && data.week}
			<span class="warnchip">
				{rules.attrition.kind === 'archive'
					? T.warnFades(
							Math.max(1, rules.attrition.afterWeeksAtZero - (data.week.number - film.added_week))
						)
					: T.warnDrops}
			</span>
		{/if}
	</span>
{/snippet}

{#snippet pipDock(film: Film)}
	<!-- the one voting control, card and sheet alike: your points as pips, your
	     remaining budget as tappable slots. The freshest pip wears its countdown
	     ring and a tap takes it back; a slot casts. -->
	<div class="pips">
		{#each Array(film.myPoints) as _, i (i)}
			{#if i === film.myPoints - 1 && canUndo(film)}
				<form method="POST" action="?/setPoints" use:enhance={submit()}>
					<input type="hidden" name="filmId" value={film.id} />
					<!-- the countdown lives inside the pip, so undoing needs no extra
					     element and nothing in the card ever shifts -->
					<button
						class="pip live"
						class:urgent={graceLeftMs(film) < 6000}
						name="points"
						value={film.myPoints - 1}
						aria-label={T.btnUndo(undoSeconds(film))}
						in:scale={{ duration: 260, start: 0.3, easing: backOut }}
					>
						{@render graceRing(film)}
						<i>{undoSeconds(film)}</i>
					</button>
				</form>
			{:else}
				<span class="pip set"><i>✓</i></span>
			{/if}
		{/each}
		{#each Array(Math.max(0, left)) as _, i (i)}
			<form method="POST" action="?/setPoints" use:enhance={submit()}>
				<input type="hidden" name="filmId" value={film.id} />
				<button
					class="pip empty"
					name="points"
					value={film.myPoints + 1}
					disabled={!open}
					aria-label={T.btnAddPoint}
				></button>
			</form>
		{/each}
	</div>
{/snippet}

{#snippet graceRing(film: Film)}
	<!-- keyed on the deadline, so a fresh cast restarts the drain from full -->
	{#key film.myGraceUntil}
		<svg viewBox="0 0 36 36" aria-hidden="true">
			<circle class="ringtrack" cx="18" cy="18" r="16" />
			<circle
				class="ring"
				cx="18"
				cy="18"
				r="16"
				use:drain={{ until: film.myGraceUntil ?? '', total: rules.voteGraceSeconds }}
			/>
		</svg>
	{/key}
{/snippet}

{#snippet triDots(film: Film)}
	<!-- the spent slots in the order the week's points were cast, so every
	     card tells the same story: a check where a point landed here, a busy
	     dot where it went to another film, free slots at the end. The first
	     free dot wears the plus that says tap me; armed, it trades the plus
	     for the bowstring drawn: one more tap makes it count -->
	{#each data.myCastOrder as entry (entry.filmId)}
		{#each Array(entry.points) as _, i (i)}
			{#if entry.filmId === film.id}
				<span class="tdot set" in:scale={{ duration: 260, start: 0.3, easing: backOut }}><i>✓</i></span>
			{:else}
				<span class="tdot busy"></span>
			{/if}
		{/each}
	{/each}
	{#each Array(Math.max(0, left)) as _, i (i)}
		<span class="tdot free" class:armed={i === 0 && armed?.filmId === film.id}>
			<!-- ring and plus are drawn, not borrowed from a border or a font:
			     even dashes, a dead-centre cross -->
			<svg viewBox="0 0 12 12" aria-hidden="true">
				<circle cx="6" cy="6" r="5.25" pathLength="12" />
				{#if i === 0 && open}<path d="M6 3.9v4.2M3.9 6h4.2" />{/if}
			</svg>
		</span>
	{/each}
{/snippet}

{#snippet voteTri(film: Film)}
	<!-- the card's vote control: one pill, the whole weekly budget as three
	     dots, and a two-tap cast: the first tap arms, the second is the vote,
	     final on the spot. Spent out, the pill opens the sheet. -->
	<div class="vd">
		{#if left > 0}
			<form method="POST" action="?/setPoints" use:enhance={submit(disarm)}>
				<input type="hidden" name="filmId" value={film.id} />
				<button
					class="tri"
					class:armed={armed?.filmId === film.id}
					data-film={film.id}
					type={armed?.filmId === film.id ? 'submit' : 'button'}
					name="points"
					value={film.myPoints + 1}
					disabled={!open}
					aria-label={T.btnAddPoint}
					onclick={(event) => {
						if (armed?.filmId !== film.id) {
							event.preventDefault();
							arm(film.id);
						}
					}}
				>
					{@render triDots(film)}
				</button>
			</form>
		{:else}
			<button
				class="tri"
				type="button"
				aria-label={T.dYours(film.myPoints, votes)}
				onclick={() => {
					unpeek();
					detailId = film.id;
				}}
			>
				{@render triDots(film)}
			</button>
		{/if}
	</div>
{/snippet}

{#snippet row(film: Film, lead: boolean, shelf: boolean)}
	<div class="film" class:lead class:fading={film.atRisk && !shelf} class:shelf>
		<div class="pw">
			<button
				class="p"
				onclick={() => {
					unpeek();
					detailId = film.id;
				}}
				aria-label={film.title}
			>
				<Poster title={film.title} url={film.poster_url} />
			</button>
			<!-- whose pick this is: a face on the poster's corner, wearing its rank
			     ring, out of the text flow so nothing ever wraps around it -->
			<button
				class="nomface"
				type="button"
				aria-label={film.nominator.name}
				onpointerenter={(event) => {
					mousing = event.pointerType === 'mouse';
					if (mousing) peekAt(event.currentTarget, film.nominator, T.nomPop(film.added_week), false);
				}}
				onpointerleave={(event) => event.pointerType === 'mouse' && unpeekSoon()}
				onclick={(event) =>
					!mousing && peekAt(event.currentTarget, film.nominator, T.nomPop(film.added_week), true)}
				onfocus={(event) => {
					if (event.currentTarget.matches(':focus-visible'))
						peekAt(event.currentTarget, film.nominator, T.nomPop(film.added_week), false);
				}}
				onblur={unpeek}
			>
				<Avatar
					name={film.nominator.name}
					colour={film.nominator.colour}
					avatar={film.nominator.avatar}
					size={22}
					font={9}
					titled={false}
					xp={film.nominator.xp}
					slim
				/>
			</button>
		</div>
		<div class="b">
			<div class="hd">
				<!-- the title line is text only, so it wraps cleanly: title, year,
				     length. The nominator sits on the poster; the rest is the
				     sheet's business -->
				<div class="ttl">
					{film.title}
					{#if film.year || film.runtime}
						<span class="mm">
							{[film.year, film.runtime ? T.minutes(film.runtime) : null]
								.filter(Boolean)
								.join(' · ')}
						</span>
					{/if}
				</div>
				<!-- tapping the coin explains the fade arithmetic behind the number -->
				<button
					class="coin"
					type="button"
					onpointerenter={(event) => {
						mousing = event.pointerType === 'mouse';
						if (mousing) scoreAt(event.currentTarget, film, false);
					}}
					onpointerleave={(event) => event.pointerType === 'mouse' && unpeekSoon()}
					onclick={(event) => !mousing && scoreAt(event.currentTarget, film, true)}
					onblur={unpeek}
				>
					<b>{fmtScore(film.score)}</b><i>{T.unit(film.score, votes)}</i>
				</button>
			</div>
			{#if film.note}
				<!-- one line on the card; the full pitch opens in a quick popup -->
				<button
					class="note"
					type="button"
					onpointerenter={(event) => {
						mousing = event.pointerType === 'mouse';
						if (mousing) noteAt(event.currentTarget, film, false);
					}}
					onpointerleave={(event) => event.pointerType === 'mouse' && unpeekSoon()}
					onclick={(event) => !mousing && noteAt(event.currentTarget, film, true)}
					onfocus={(event) => {
						if (event.currentTarget.matches(':focus-visible')) noteAt(event.currentTarget, film, false);
					}}
					onblur={unpeek}
				>
					{film.note}
				</button>
			{/if}
			<div class="ft">
				{@render backerRow(film)}
				{#if votes}
					<form method="POST" action="?/setPoints" use:enhance={submit()}>
						<input type="hidden" name="filmId" value={film.id} />
						<button
							class="tap"
							class:on={film.myPoints > 0}
							name="points"
							value={film.myPoints > 0 ? 0 : 1}
							disabled={!open ||
								(film.myPoints === 0 && left < 1) ||
								(film.myPoints > 0 && !canUndo(film))}
						>
							{film.myPoints > 0 ? T.btnVoted : T.btnVote}
						</button>
					</form>
				{:else if data.person}
					<!-- always present: even spent-out it shows where the week went -->
					{@render voteTri(film)}
				{/if}
			</div>
		</div>
	</div>
{/snippet}

<div class="list">
	<!-- no banner over the trójka: the lead glow and the reszta divider say it.
	     The wrapper exists for the flip: confirmed votes glide cards to their
	     new seats instead of teleporting them -->
	{#each data.films as film, i (film.id)}
		<div class="fwrap" animate:flip={{ duration: flipMs }}>
			{#if data.shortlistCount && i === data.shortlistCount}
				<div class="rest-head">{T.restHead}</div>
			{/if}
			{@render row(film, i < data.shortlistCount, false)}
		</div>
	{:else}
		<div class="empty">{T.listEmpty}</div>
	{/each}
</div>

<button
	class="addcard"
	disabled={Boolean(nominated) || !open}
	onclick={() => {
		searchOpen = true;
		query = '';
		results = [];
		picked = null;
	}}
>
	{#if nominated}
		{T.nomDone(nominated.title)}
	{:else}
		<b>{T.nomCta}</b><br /><span style="font-size:11.5px">{T.nomCtaSub}</span>
	{/if}
</button>

{#if data.archived.length || data.dropped.length}
	<div class="sec">
		{rules.attrition.kind === 'archive'
			? T.shelfArchive(data.archived.length)
			: T.shelfDropped(data.dropped.length)}
	</div>
	<div class="list">
		{#each data.archived as film (film.id)}
			{@render row(film, false, true)}
		{/each}
		{#each data.dropped as film (film.id)}
			<div class="film shelf">
				<div class="p"><Poster title={film.title} url={film.poster_url} /></div>
				<div class="b">
					<div class="hd">
						<div class="ttl">
							{film.title}
							{#if film.year}<span class="mm">{film.year}</span>{/if}
						</div>
					</div>
					<div class="ft">
						<span class="backers"></span>
						<form method="POST" action="?/renominate" use:enhance={submit()}>
							<input type="hidden" name="filmId" value={film.id} />
							<input type="hidden" name="title" value={film.title} />
							<button class="tap" disabled={Boolean(nominated) || !open}>{T.btnRenominate}</button>
						</form>
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}

<!-- ------------------------------------------------------------ sheets -- -->

<button
	class="scrim"
	class:on={anySheet}
	aria-label="close"
	tabindex={anySheet ? 0 : -1}
	onclick={closeSheets}
></button>

<div class="sheet" class:on={detail !== null}>
	<button class="handle" aria-label="close" onclick={closeSheets}></button>
	<div class="inner">
		{#if detail}
			<div class="dhero">
				<div class="p"><Poster title={detail.title} url={detail.poster_url} /></div>
				<div style="flex:1;min-width:0">
					<h2>{detail.title}</h2>
					<div class="yr">
						{detail.year ?? ''}{#if detail.year && detail.director}
							· {/if}{detail.director ?? ''}
					</div>
					<button
						class="sc"
						type="button"
						onpointerenter={(event) => {
							mousing = event.pointerType === 'mouse';
							if (mousing) scoreAt(event.currentTarget, detail, false);
						}}
						onpointerleave={(event) => event.pointerType === 'mouse' && unpeekSoon()}
						onclick={(event) => !mousing && scoreAt(event.currentTarget, detail, true)}
						onblur={unpeek}
					>
						<b>{fmtScore(detail.score)}</b>
						<small>{T.unit(detail.score, votes)} · {T.sortLabel(rules)}</small>
					</button>
				</div>
			</div>

			{#if noteEdit && detail.added_by === data.person?.id}
				<form method="POST" action="?/setNote" use:enhance={submit(() => (noteEdit = false))}>
					<input type="hidden" name="filmId" value={detail.id} />
					<textarea
						class="nin"
						name="note"
						rows="3"
						maxlength="160"
						placeholder={T.notePh}
						value={detail.note ?? ''}
					></textarea>
					<div class="cbtns">
						<button type="button" onclick={() => (noteEdit = false)}>{T.noteCancel}</button>
						<button class="go">{T.noteSave}</button>
					</div>
				</form>
			{:else}
				{#if detail.note}
					<div class="dnote">
						“{detail.note}”<span class="sig">{T.noteSig(detail.addedByName)}</span>
					</div>
				{/if}
				{#if detail.added_by === data.person?.id}
					<button class="nedit" onclick={() => (noteEdit = true)}>
						{detail.note ? T.noteEdit : T.noteAdd}
					</button>
				{/if}
			{/if}

			{#if detail.overview}<p class="over">{detail.overview}</p>{/if}

			<div class="facts">
				<div class="fact"><span>{T.dGenre}</span><b>{detail.genre ?? T.dEmpty}</b></div>
				<div class="fact">
					<span>{T.dRuntime}</span><b>{detail.runtime ? T.minutes(detail.runtime) : T.dEmpty}</b>
				</div>
				<div class="fact">
					<span>{T.dAdded}</span><b>{T.addedBy(detail.addedByName, detail.added_week)}</b>
				</div>
				<div class="fact">
					<span>{T.dBacked}</span>
					<b>
						{detail.backers.length
							? detail.backers.map((b) => `${b.name} (${b.points})`).join(', ')
							: T.dNobody}
					</b>
				</div>
			</div>

			<div class="spendbar">
				<div class="lab">
					{#if detail.myPoints}
						<b>{T.dYours(detail.myPoints, votes)}</b>
						{rules.banking ? T.dBankLeft(left) : T.dWeekLeft(left, data.person?.budget ?? 0)}
					{:else}
						<b>{T.dNone(left, votes)}</b>
					{/if}
				</div>
				{@render pipDock(detail)}
			</div>
		{/if}
	</div>
</div>

<div class="sheet" class:on={searchOpen}>
	<button class="handle" aria-label="close" onclick={closeSheets}></button>
	<div class="inner">
		<h2 style="margin:8px 0 2px;font-size:19px;letter-spacing:-.02em">{T.nomH}</h2>

		{#if picked}
			<form
				method="POST"
				action="?/nominate"
				use:enhance={submit(() => closeSheets())}
				style="padding-bottom:8px"
			>
				<input type="hidden" name="title" value={picked.title} />
				<input type="hidden" name="tmdbId" value={picked.tmdbId ?? ''} />
				<input type="hidden" name="year" value={picked.year ?? ''} />
				<input type="hidden" name="poster" value={picked.poster ?? ''} />
				<input type="hidden" name="overview" value={picked.overview} />
				<div class="crow">
					<div class="th"><Poster title={picked.title} url={picked.thumb} /></div>
					<div>
						<b>{picked.title}</b>
						<span>{picked.year ?? T.dEmpty}</span>
					</div>
				</div>
				<div class="nlabel">{T.noteQ}</div>
				<textarea class="nin" name="note" rows="3" maxlength="160" placeholder={T.notePh}></textarea>
				<div class="cbtns">
					<button type="button" onclick={() => (picked = null)}>{T.noteBack}</button>
					<button class="go">{T.noteConfirm}</button>
				</div>
			</form>
		{:else}
			<div class="hintline">{degraded ? T.nomOffline : T.nomHint}</div>
			<input
				class="sinput"
				bind:value={query}
				oninput={onQuery}
				placeholder={T.nomPh}
				autocomplete="off"
				spellcheck="false"
			/>
			<div class="sres">
				{#if searching}
					<div class="hintline">{T.nomSearching}</div>
				{:else}
					{#each results as result (result.tmdbId)}
						{@const dup = known.has(result.title.toLowerCase())}
						<button class="r" disabled={dup} onclick={() => (picked = result)}>
							<div class="th"><Poster title={result.title} url={result.thumb} /></div>
							<div class="m">
								<b>{result.title}</b>
								<span>{result.year ?? T.dEmpty}{dup ? ` · ${T.nomDup}` : ''}</span>
							</div>
						</button>
					{/each}
					{#if query.trim().length >= 2 && !results.length}
						<div class="hintline">{T.nomNone(query.trim())}</div>
					{/if}
					{#if query.trim().length >= 2}
						<button class="ghostbtn" onclick={() => (picked = byHand())}>
							{T.nomByHand(query.trim())}
						</button>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>

<!-- ----------------------------------------------------------- backers -- -->

{#if peek}
	{#if peek.tap}
		<!-- only a tap needs one; on a hover pointer it would swallow the pointerleave -->
		<button class="menu-backdrop" aria-label={T.close} onclick={unpeek}></button>
	{/if}
	<div class="bkpop" class:below={peek.below} style="left:{peek.x}px;top:{peek.y}px" role="tooltip">
		<Avatar
			name={peek.face.name}
			colour={peek.face.colour}
			avatar={peek.face.avatar}
			size={116}
			font={40}
			titled={false}
			xp={peek.face.xp}
		/>
		<b>{peek.face.name}</b>
		<span class="bktitle lv{levelOf(peek.face.xp)}">{T.levels[levelOf(peek.face.xp)]}</span>
		<span>{peek.sub}</span>
	</div>
{/if}

{#if notePop}
	{#if notePop.tap}
		<button class="menu-backdrop" aria-label={T.close} onclick={unpeek}></button>
	{/if}
	<div
		class="bkpop ntpop"
		class:below={notePop.below}
		style="left:{notePop.x}px;top:{notePop.y}px"
		role="tooltip"
	>
		<p>“{notePop.text}”</p>
		<span class="sig">{notePop.sig}</span>
	</div>
{/if}

{#if scorePop}
	{#if scorePop.tap}
		<button class="menu-backdrop" aria-label={T.close} onclick={unpeek}></button>
	{/if}
	<div
		class="bkpop scpop"
		class:below={scorePop.below}
		style="left:{scorePop.x}px;top:{scorePop.y}px"
		role="tooltip"
	>
		{#each scorePop.rows as row (row.week)}
			<div class="srow">
				<span>{T.week(row.week)}</span>
				<b>
					{row.points} × {row.mult.toFixed(2)}
					{row.mult === 1 ? '=' : '≈'}
					{fmtScore(row.contrib)}
				</b>
			</div>
		{/each}
		<span class="sig">{T.fadeNote(rules)}</span>
	</div>
{/if}

<!-- it is placed from a rect, so anything that moves the pill has to close it -->
<svelte:window
	onscroll={unpeek}
	onresize={unpeek}
	onkeydown={(event) => event.key === 'Escape' && unpeek()}
	onpointerdown={disarmElsewhere}
/>
