<script lang="ts">
	import { enhance } from '$app/forms';
	import { flip } from 'svelte/animate';
	import { scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Avatar from '$lib/components/Avatar.svelte';
	import FacePeek, {
		anchorAt,
		peekFor,
		type Peek,
		type PeekFace
	} from '$lib/components/FacePeek.svelte';
	import Poster from '$lib/components/Poster.svelte';
	import { dictFor, fmtScore, isVotes } from '$lib/i18n';
	import { REACTIONS } from '$lib/reactions';
	import { levelOf } from '$lib/levels';
	import Banana from '$lib/components/Banana.svelte';
	import { say } from '$lib/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const T = $derived(dictFor(data.lang));
	const rules = $derived(data.rules);
	const votes = $derived(isVotes(rules));
	const left = $derived(data.person?.left ?? 0);
	const open = $derived(data.week?.status === 'open');
	const nominated = $derived(data.nominatedThisWeek);

	/* ----------------------------------------------------------- shortlist -- */

	const shortlist = $derived(new Set(data.shortlistIds));
	// §3.5: a sleeper is no candidate, so it does not sit in the candidates' half
	// of the list. Pulling the shortlist to the front makes the band a prefix
	// again, and the cards at the top of the screen the ones that actually go to
	// the room. Both halves keep the §3.2 ordering, so the rest is still headed
	// by whatever scored highest among them, sleeper or not
	const ordered = $derived(
		shortlist.size
			? [
					...data.films.filter((film) => shortlist.has(film.id)),
					...data.films.filter((film) => !shortlist.has(film.id))
				]
			: data.films
	);
	const restStart = $derived(shortlist.size ? shortlist.size : -1);
	// the reszta divider rides in the same keyed list as the cards, as an item of
	// its own: on a desktop it has to span the whole row of the grid, which it
	// cannot do from inside a card's wrapper, and as a sibling it glides with them
	const board = $derived(
		ordered.flatMap((film, i): { key: number | string; film: Film | null }[] => [
			...(i === restStart ? [{ key: 'rest', film: null }] : []),
			{ key: film.id, film }
		])
	);
	// the film already spending the viewer's one hold, for the sheet's refusal
	const heldTitle = $derived(data.films.find((film) => film.id === data.myHold)?.title ?? '');

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

	/** the note popup is wider and shorter: a paragraph, not a portrait */
	const NPOP_W = 264;
	const NPOP_H = 150;
	/** the comment peek is wider still: names, dates and tallies share its rows */
	const CPOP_W = 340;
	/** the seen list is a column of names, so it only needs room for the longest */
	const SPOP_W = 190;

	type WeekPoints = { week: number; points: number };
	let peek = $state<Peek | null>(null);
	let notePop = $state<{
		text: string;
		sig: string;
		/** true for a nominator's pitch, false for a database blurb */
		quoted: boolean;
		x: number;
		y: number;
		below: boolean;
		tap: boolean;
	} | null>(null);
	type ScoreRow = { week: number; points: number; mult: number; contrib: number };
	let scorePop = $state<{
		rows: ScoreRow[];
		/** the same sum one week older, which is what it will be if nobody votes */
		next: number;
		x: number;
		y: number;
		below: boolean;
		tap: boolean;
	} | null>(null);
	// hover preview of the thread; a click or tap opens the real modal instead
	let cmtPop = $state<{ film: Film; x: number; y: number; below: boolean } | null>(null);
	// a mouse hovers it and a finger taps it open; on a tap the mark itself moves
	// inside, so looking and owning up stay two separate gestures on a phone
	let seenPop = $state<{
		film: Film;
		x: number;
		y: number;
		below: boolean;
		tap: boolean;
	} | null>(null);
	let closing: ReturnType<typeof setTimeout>;
	// a mouse opens on hover and a finger on tap. A touchscreen laptop does both,
	// so go by the pointer that actually arrived rather than what the screen can do
	let mousing = false;

	function peekAt(
		pill: EventTarget | null,
		face: PeekFace,
		sub: string,
		tap: boolean,
		rows: WeekPoints[] = []
	) {
		clearTimeout(closing);
		const next = peekFor(
			pill,
			face,
			sub,
			tap,
			rows.map((row) => ({ label: T.week(row.week), value: String(row.points) }))
		);
		if (!next) return;
		shutPops();
		peek = next;
	}

	function noteAt(el: EventTarget | null, film: Film, tap: boolean) {
		clearTimeout(closing);
		if (!(el instanceof HTMLElement) || !film.note) return;
		shutPops();
		notePop = {
			text: film.note,
			sig: T.noteSig(film.addedByName),
			quoted: true,
			tap,
			...anchorAt(el, NPOP_W, NPOP_H)
		};
	}

	/** the TMDB synopsis, standing in where the nominator left no pitch */
	function blurbAt(el: EventTarget | null, film: Film, tap: boolean) {
		clearTimeout(closing);
		if (!(el instanceof HTMLElement) || !film.overview) return;
		shutPops();
		notePop = {
			text: film.overview,
			sig: '',
			quoted: false,
			tap,
			...anchorAt(el, NPOP_W, NPOP_H)
		};
	}

	/** why a film is sitting this one out, in the words of whoever asked */
	function holdAt(el: EventTarget | null, film: Film, tap: boolean) {
		clearTimeout(closing);
		if (!(el instanceof HTMLElement) || !film.held?.reason) return;
		shutPops();
		notePop = {
			text: film.held.reason,
			sig: T.holdSig(film.held.name),
			quoted: true,
			tap,
			...anchorAt(el, NPOP_W, NPOP_H)
		};
	}

	/**
	 * §3.5: yours, still on the list, and your one hold for the round is either
	 * unspent or already spent on this very film.
	 */
	function canHold(film: Film): boolean {
		return (
			open &&
			film.added_by === data.person?.id &&
			film.status === 'active' &&
			(data.myHold === null || data.myHold === film.id)
		);
	}

	/** the fade arithmetic behind a score, one row per week with points */
	function scoreAt(el: EventTarget | null, film: Film, tap: boolean) {
		clearTimeout(closing);
		const weekNow = data.week?.number;
		if (!(el instanceof HTMLElement) || rules.scoring !== 'fade' || !weekNow) return;
		if (!film.weeklyPoints.length) return;
		shutPops();
		const rows = film.weeklyPoints.map((row) => {
			const mult = rules.decayFactor ** (weekNow - row.week);
			return { ...row, mult, contrib: row.points * mult };
		});
		const total = rows.reduce((sum, row) => sum + row.contrib, 0);
		scorePop = { rows, next: total * rules.decayFactor, tap, ...anchorAt(el, NPOP_W, NPOP_H) };
	}

	/** the comment thread under the badge, read-only; the modal is for writing */
	function cmtsAt(el: EventTarget | null, film: Film) {
		clearTimeout(closing);
		if (!(el instanceof HTMLElement)) return;
		shutPops();
		cmtPop = { film, ...anchorAt(el, CPOP_W, NPOP_H) };
	}

	/** who has already seen it, spelled out from the eye's count */
	function seenAt(el: EventTarget | null, film: Film, tap: boolean) {
		clearTimeout(closing);
		if (!(el instanceof HTMLElement)) return;
		// on a hover the pill already says nought and a popup repeating it would be
		// furniture. On a tap it has to open regardless, because it is now the only
		// way to the mark from the card
		if (!tap && !film.seen.length) return;
		shutPops();
		seenPop = { film, tap, ...anchorAt(el, SPOP_W, NPOP_H) };
	}

	/** the popups are exclusive: opening one shuts the rest */
	function shutPops() {
		peek = null;
		notePop = null;
		scorePop = null;
		cmtPop = null;
		seenPop = null;
	}

	function unpeek() {
		clearTimeout(closing);
		shutPops();
	}

	// a beat of grace, so crossing the gap between two pills does not flicker
	function unpeekSoon() {
		clearTimeout(closing);
		closing = setTimeout(shutPops, 80);
	}

	/* ------------------------------------------------------------- sheets -- */

	let detailId = $state<number | null>(null);
	let noteEdit = $state(false);
	let searchOpen = $state(false);
	// the +N fold opens every backer pill in a small modal; face popups stack on top
	let backersOpenId = $state<number | null>(null);
	// the badge on the poster opens the thread in a modal, for reading and writing
	let commentsOpenId = $state<number | null>(null);

	const detail = $derived(
		detailId === null
			? null
			: ([...data.films, ...data.archived].find((f) => f.id === detailId) ?? null)
	);
	const backersFilm = $derived(
		backersOpenId === null
			? null
			: ([...data.films, ...data.archived].find((f) => f.id === backersOpenId) ?? null)
	);
	const commentsFilm = $derived(
		commentsOpenId === null
			? null
			: ([...data.films, ...data.archived].find((f) => f.id === commentsOpenId) ?? null)
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
		if ('commented' in form && form.commented) say(T.tCommented);
		if ('held' in form && form.held) say(T.tHeld(form.held));
		if ('released' in form && form.released) say(T.tReleased(form.released));
	});

	let commentDraft = $state('');
	// which comment's emoji picker is unfolded; one at a time is plenty
	let pickerFor = $state<number | null>(null);

	function commentDay(at: string): string {
		return new Date(at).toLocaleDateString(data.lang === 'pl' ? 'pl-PL' : 'en-GB', {
			day: 'numeric',
			month: 'short'
		});
	}
</script>

{#snippet bkPill(backer: Film['backers'][number])}
	<!-- a 16px face says nothing on a phone, so the pill opens a readable one -->
	<button
		class="bk"
		type="button"
		style="--bkring:var(--tier{levelOf(backer.xp)})"
		aria-label={backer.name}
		onpointerenter={(event) => {
			mousing = event.pointerType === 'mouse';
			if (mousing)
				peekAt(
					event.currentTarget,
					backer,
					`${backer.points} ${T.unit(backer.points, votes)}`,
					false,
					backer.weekly
				);
		}}
		onpointerleave={(event) => event.pointerType === 'mouse' && unpeekSoon()}
		onclick={(event) =>
			!mousing &&
			peekAt(
				event.currentTarget,
				backer,
				`${backer.points} ${T.unit(backer.points, votes)}`,
				true,
				backer.weekly
			)}
		onfocus={(event) => {
			// a tap focuses too, and would fight the click handler for the same pill
			if (event.currentTarget.matches(':focus-visible'))
				peekAt(
					event.currentTarget,
					backer,
					`${backer.points} ${T.unit(backer.points, votes)}`,
					false,
					backer.weekly
				);
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
{/snippet}

<!-- the backer pill with the points taken off: the sheet names people it has
     room to name, where a card only has room to count them -->
{#snippet facePill(face: { name: string; colour: string; avatar: string | null })}
	<span class="bk face">
		<Avatar
			name={face.name}
			colour={face.colour}
			avatar={face.avatar}
			size={16}
			font={8}
			titled={false}
		/>
		<b>{face.name}</b>
	</span>
{/snippet}

<!-- one thread, two homes: the detail sheet and the badge's modal -->
{#snippet commentThread(film: { id: number; comments: Film['comments'] })}
	<div class="cmts">
		<div class="sec">{film.comments.length ? T.commentsH(film.comments.length) : T.commentNone}</div>
		{#each film.comments as comment (comment.id)}
			<div class="cmt">
				<Avatar
					name={comment.name}
					colour={comment.colour}
					avatar={comment.avatar}
					size={22}
					font={9}
					titled={false}
					xp={comment.xp}
					slim
				/>
				<div class="cbody">
					<div class="who">
						<b>{comment.name}</b>
						<time>{commentDay(comment.created_at)}</time>
					</div>
					<p>{comment.body}</p>
					<div class="rrow">
						{#each comment.reacts as react (react.emoji)}
							<form method="POST" action="?/react" use:enhance={submit()}>
								<input type="hidden" name="commentId" value={comment.id} />
								<button
									class="rchip"
									class:mine={react.mine}
									name="emoji"
									value={react.emoji}
									title={react.people.map((p) => p.name).join(', ')}
								>
									<span class="remoji">{react.emoji}</span>
									<span class="rfaces">
										{#each react.people.slice(0, 3) as person (person.id)}
											<Avatar
												name={person.name}
												colour={person.colour}
												avatar={person.avatar}
												size={14}
												font={7}
												titled={false}
											/>
										{/each}
									</span>
									{#if react.people.length > 3}<b>+{react.people.length - 3}</b>{/if}
								</button>
							</form>
						{/each}
						<button
							class="rchip radd"
							type="button"
							aria-label={T.reactAdd}
							onclick={() => (pickerFor = pickerFor === comment.id ? null : comment.id)}
						>
							🍿<span class="plus">+</span>
						</button>
					</div>
					{#if pickerFor === comment.id}
						<form
							class="rpick"
							method="POST"
							action="?/react"
							use:enhance={submit(() => (pickerFor = null))}
						>
							<input type="hidden" name="commentId" value={comment.id} />
							{#each REACTIONS as emoji (emoji)}
								<button name="emoji" value={emoji}>{emoji}</button>
							{/each}
						</form>
					{/if}
				</div>
			</div>
		{/each}
		<form
			class="cwrite"
			method="POST"
			action="?/comment"
			use:enhance={submit(() => (commentDraft = ''))}
		>
			<input type="hidden" name="filmId" value={film.id} />
			<textarea
				class="nin"
				name="body"
				rows="2"
				maxlength="280"
				placeholder={T.commentPh}
				bind:value={commentDraft}
			></textarea>
			<button class="csend" aria-label={T.commentSend} disabled={!commentDraft.trim()}>
				<svg
					viewBox="0 0 24 24"
					width="14"
					height="14"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M12 19V5M5 12l7-7 7 7" />
				</svg>
			</button>
		</form>
	</div>
{/snippet}

<!-- §3.5, said on the title line rather than in the fine print: a sleeper's row
     is one line tall, and the chip trailing the title is the only place that
     leaves the coin and the dock where every other card puts them -->
{#snippet heldChip(film: Film)}
	{#if film.held}
		{@const mine = film.held.personId === data.person?.id}
		{#if film.held.reason}
			<button
				class="holdchip"
				type="button"
				onpointerenter={(event) => {
					mousing = event.pointerType === 'mouse';
					if (mousing) holdAt(event.currentTarget, film, false);
				}}
				onpointerleave={(event) => event.pointerType === 'mouse' && unpeekSoon()}
				onclick={(event) => !mousing && holdAt(event.currentTarget, film, true)}
				onblur={unpeek}
			>
				💤 <span class="holdwho">{mine ? T.holdMine : T.holdBy(film.held.name)}</span>
			</button>
		{:else}
			<span class="holdchip"
				>💤 <span class="holdwho">{mine ? T.holdMine : T.holdBy(film.held.name)}</span></span
			>
		{/if}
	{/if}
{/snippet}

{#snippet backerRow(film: Film)}
	<span class="backers">
		{#if film.backers.length}
			<!-- the top seven by points plus the fold make eight items at most,
			     so the row wraps to two tidy rows and never stretches the card -->
			{#each film.backers.slice(0, 7) as backer (backer.person_id)}
				{@render bkPill(backer)}
			{/each}
			{#if film.backers.length > 7}
				<button
					class="bk more"
					type="button"
					aria-label={film.backers
						.slice(7)
						.map((b) => b.name)
						.join(', ')}
					onclick={() => {
						unpeek();
						backersOpenId = film.id;
					}}
				>
					+{film.backers.length - 7}
				</button>
			{/if}
		{:else}
			<span class="nobk">{T.noBackers}</span>
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
				<span class="pip set"><i>{#if data.banana}<Banana />{:else}✓{/if}</i></span>
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
				>
					<!-- drawn, not bordered: the same even ring the small docks use -->
					<svg viewBox="0 0 36 36" aria-hidden="true"
						><circle cx="18" cy="18" r="17.1" pathLength="30" /></svg
					>
				</button>
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
				<span class="tdot set" in:scale={{ duration: 260, start: 0.3, easing: backOut }}
					><i>{#if data.banana}<Banana />{:else}✓{/if}</i></span
				>
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
	<div
		class="film"
		class:lead
		class:fading={film.atRisk && !shelf}
		class:shelf
		class:held={Boolean(film.held)}
	>
		<!-- a podium card on a desktop stands its poster on a blurred copy of itself -->
		<div class="pw" style:--art={lead && film.poster_url ? `url("${encodeURI(film.poster_url)}")` : null}>
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
				<div class="hleft">
					<!-- the title line is text only, so it wraps cleanly: title, year,
					     length. The nominator sits on the poster; the rest is the
					     sheet's business -->
					<div class="ttl">
						<span class="tname">{film.title}</span>
						{#if film.year || film.runtime}
							<span class="mm"
								>{[film.year, film.runtime ? T.minutes(film.runtime) : null]
									.filter(Boolean)
									.join(' · ')}</span
							>
						{/if}
					</div>
					{@render heldChip(film)}
					<!-- one line right under the title, ending before the coin: the
					     nominator's pitch, or the synopsis where nobody pitched -->
					{#if film.note}
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
								if (event.currentTarget.matches(':focus-visible'))
									noteAt(event.currentTarget, film, false);
							}}
							onblur={unpeek}
						>
							{film.note}
						</button>
					{:else if film.overview}
						<button
							class="note blurb"
							type="button"
							onpointerenter={(event) => {
								mousing = event.pointerType === 'mouse';
								if (mousing) blurbAt(event.currentTarget, film, false);
							}}
							onpointerleave={(event) => event.pointerType === 'mouse' && unpeekSoon()}
							onclick={(event) => !mousing && blurbAt(event.currentTarget, film, true)}
							onfocus={(event) => {
								if (event.currentTarget.matches(':focus-visible'))
									blurbAt(event.currentTarget, film, false);
							}}
							onblur={unpeek}
						>
							{film.overview}
						</button>
					{:else if film.director || film.genre}
						<div class="note blurb still">
							{[film.director, film.genre].filter(Boolean).join(' · ')}
						</div>
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
		<!-- the card's fine print, always present and spanning the full card:
		     the attrition warning on the left, and on the right edge an eye
		     that both counts who has seen the film and toggles the viewer's
		     own mark. Indented to the text column on desktop, flush on phones -->
		<div class="cardfoot">
			{#if film.atRisk && data.week}
				<span class="warnchip">
					{rules.attrition.kind === 'archive'
						? T.warnFades(
								Math.max(
									1,
									rules.attrition.afterWeeksAtZero - (data.week.number - film.added_week)
								)
							)
						: T.warnDrops}
				</span>
			{/if}
			<!-- §3.5. A film stepping aside is public the instant it happens, which
			     is half the point: there is still time to put votes elsewhere. On
			     your own candidate the chip is the one tap that does it; the reason
			     goes on afterwards, in the sheet -->
			{#if lead && canHold(film)}
				<form method="POST" action="?/hold" use:enhance={submit()}>
					<input type="hidden" name="filmId" value={film.id} />
					<input type="hidden" name="title" value={film.title} />
					<button class="holdchip act">💤 {T.holdCta}</button>
				</form>
			{/if}
			<!-- the thread's pill: a hover peeks at it, a click or tap opens the
			     modal where it can be read and joined -->
			<button
				class="eyebtn cmtbtn"
				type="button"
				aria-label={film.comments.length ? T.commentsH(film.comments.length) : T.commentNone}
				onpointerenter={(event) => {
					mousing = event.pointerType === 'mouse';
					if (mousing) cmtsAt(event.currentTarget, film);
				}}
				onpointerleave={(event) => event.pointerType === 'mouse' && unpeekSoon()}
				onclick={() => {
					unpeek();
					commentsOpenId = film.id;
				}}
			>
				<svg
					viewBox="0 0 24 24"
					width="13"
					height="13"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
				</svg>
				<b>{film.comments.length}</b>
			</button>
			<!-- the popup holds the faces it opened with, so the toggle shuts it
			     rather than leaving a list one name out of date under the cursor -->
			<form class="eyeform" method="POST" action="?/seen" use:enhance={submit(unpeek)}>
				<input type="hidden" name="filmId" value={film.id} />
				<button
					class="eyebtn"
					class:on={film.seenMine}
					title={T.seenBtn}
					aria-label={T.seenBtn}
					onpointerenter={(event) => {
						mousing = event.pointerType === 'mouse';
						if (mousing) seenAt(event.currentTarget, film, false);
					}}
					onpointerleave={(event) => event.pointerType === 'mouse' && unpeekSoon()}
					onclick={(event) => {
						// a finger opens the list instead of submitting; the mark is a
						// button inside it. A mouse keeps the click it always had
						if (mousing) return;
						event.preventDefault();
						seenAt(event.currentTarget, film, true);
					}}
				>
					<svg
						viewBox="0 0 24 24"
						width="14"
						height="14"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
						<circle cx="12" cy="12" r="3" />
					</svg>
					<b>{film.seen.length}</b>
				</button>
			</form>
		</div>
	</div>
{/snippet}

<div class="list">
	<!-- no banner over the trójka: the lead glow and the reszta divider say it.
	     The wrapper exists for the flip: confirmed votes glide cards to their
	     new seats instead of teleporting them -->
	{#each board as { key, film } (key)}
		<div
			class="fwrap"
			class:podium={film !== null && shortlist.has(film.id)}
			class:headrow={film === null}
			animate:flip={{ duration: flipMs }}
		>
			{#if film}
				{@render row(film, shortlist.has(film.id), false)}
			{:else}
				<div class="rest-head">{T.restHead}</div>
			{/if}
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
							<span class="tname">{film.title}</span>
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

<div class="sheet dsheet" class:on={detail !== null}>
	<button class="handle" aria-label="close" onclick={closeSheets}></button>
	<div class="inner">
		{#if detail}
			<!-- the top of the sheet is a card like everything under it, which is
			     what gives the coin a right edge to sit against rather than the
			     far side of the window -->
			<div class="dblock dtop">
				<div class="dhero">
					<div class="p"><Poster title={detail.title} url={detail.poster_url} /></div>
					<div class="dh">
						<h2>{detail.title}</h2>
						<!-- joined in one expression: markup around the separator left
						     the spaces to whitespace collapsing, which ate them -->
						<div class="yr">
							{[detail.year, detail.director].filter(Boolean).join(' · ')}
						</div>
					</div>
					<!-- the same coin the list wears, one size up: a film's score should
					     not be a different object depending on which screen says it -->
					<button
						class="coin dcoin"
						type="button"
						onpointerenter={(event) => {
							mousing = event.pointerType === 'mouse';
							if (mousing) scoreAt(event.currentTarget, detail, false);
						}}
						onpointerleave={(event) => event.pointerType === 'mouse' && unpeekSoon()}
						onclick={(event) => !mousing && scoreAt(event.currentTarget, detail, true)}
						onblur={unpeek}
					>
						<b>{fmtScore(detail.score)}</b><i>{T.unit(detail.score, votes)}</i>
					</button>
				</div>

				<!-- the thin facts are chips: a block apiece for a genre and a runtime
				     was a lot of ground for four words, and the nominator is a face,
				     not a row that says one name and then stops -->
				<div class="dmeta">
					{#if detail.genre}<span class="mchip">{detail.genre}</span>{/if}
					{#if detail.runtime}<span class="mchip">{T.minutes(detail.runtime)}</span>{/if}
					{@render facePill(detail.nominator)}
					<span class="dwhen">{T.nomPop(detail.added_week)}</span>
				</div>
			</div>

			<!-- two columns that wrap into the one stack a phone had, so the order
			     here is also the order a phone reads in: a rail under the poster
			     for who pitched it and who is behind it, and the wider half for
			     what the film is, what you can do about it, and the talk -->
			<div class="dcols">
				<div class="drail">
					<!-- the pitch and the button that writes it are one block, so the
					     button cannot end up in a column of its own -->
					{#if noteEdit && detail.added_by === data.person?.id}
						<form
							class="dblock"
							method="POST"
							action="?/setNote"
							use:enhance={submit(() => (noteEdit = false))}
						>
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
					{:else if detail.note || detail.added_by === data.person?.id}
						<div class="dblock pitch">
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
						</div>
					{/if}

					<!-- both people questions in one block: apart, "nikt" cost a whole card
					     to say nothing, and the two are read as one thought anyway. The
					     label takes a line of its own as soon as there is anybody to
					     name, so a crowd wraps across the block instead of queueing up
					     behind it -->
					<div class="dblock">
						<div class="dsec">
							<div class="drow">
								<span class="dlab">{T.dBacked}</span>
								{#if !detail.backers.length}<span class="dnone">{T.dNobody}</span>{/if}
							</div>
							{#if detail.backers.length}
								<div class="dpeople">
									{#each detail.backers as backer (backer.person_id)}
										{@render bkPill(backer)}
									{/each}
								</div>
							{/if}
						</div>
						<!-- owning up to a rewatch is a toggle, so a misclick is not a
						     confession; it sits with the faces it would join -->
						<div class="dsec">
							<div class="drow">
								<span class="dlab">{T.dSeen}</span>
								{#if !detail.seen.length}<span class="dnone">{T.dNobody}</span>{/if}
								<form method="POST" action="?/seen" use:enhance={submit()}>
									<input type="hidden" name="filmId" value={detail.id} />
									<button class="tap" class:on={detail.seenMine}>
										{detail.seenMine ? `✓ ${T.seenBtn}` : T.seenBtn}
									</button>
								</form>
							</div>
							{#if detail.seen.length}
								<div class="dpeople">
									{#each detail.seen as face (face.id)}
										{@render facePill(face)}
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>

				<div class="dmain">
					{#if detail.overview}
						<div class="dblock"><p class="over">{detail.overview}</p></div>
					{/if}

					<!-- §3.5: the whole mechanic, on the one screen that belongs to a single
					     film. The reason is optional and shared, because the ask it replaces
					     used to land in the group chat -->
					{#if open && detail.added_by === data.person?.id && detail.status === 'active'}
						<div class="holdbox">
							<!-- the heading carries the way out, the way a block's heading
							     carries its control everywhere else on this sheet -->
							<div class="holdh">
								<span>{T.holdH}</span>
								{#if detail.held}
									<form method="POST" action="?/release" use:enhance={submit()}>
										<input type="hidden" name="filmId" value={detail.id} />
										<input type="hidden" name="title" value={detail.title} />
										<button class="tap">{T.holdRelease}</button>
									</form>
								{/if}
							</div>
							<!-- what it costs, read before the button rather than after it -->
							<div class="holdhint">{T.holdHint(rules.shortlistSize)}</div>
							{#if detail.held || data.myHold === null || data.myHold === detail.id}
								<form method="POST" action="?/hold" use:enhance={submit()}>
									<input type="hidden" name="filmId" value={detail.id} />
									<input type="hidden" name="title" value={detail.title} />
									<textarea
										class="nin"
										name="reason"
										rows="2"
										maxlength="160"
										placeholder={T.holdWhyPh}
										value={detail.held?.reason ?? ''}
									></textarea>
									<div class="cbtns">
										{#if detail.held}
											<button class="go">{T.holdSave}</button>
										{:else}
											<button class="go">💤 {T.holdBtn}</button>
										{/if}
									</div>
								</form>
							{:else}
								<div class="holdhint">{T.holdSpent(heldTitle)}</div>
							{/if}
						</div>
					{/if}


					<div class="dblock">{@render commentThread(detail)}</div>
				</div>
			</div>

		{/if}
	</div>

	<!-- the dock is a child of the sheet and not of its measure, so it reaches
	     the sheet's own edges and sits flush against the bottom of the screen;
	     its contents keep the column the rest of the sheet reads on -->
	{#if detail}
		<div class="spendbar">
			<div class="inner">
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
		</div>
	{/if}
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
	<FacePeek {peek} lang={data.lang} onclose={unpeek} />
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
		<p>{notePop.quoted ? `“${notePop.text}”` : notePop.text}</p>
		{#if notePop.sig}<span class="sig">{notePop.sig}</span>{/if}
	</div>
{/if}

{#if cmtPop}
	<!-- hover-only preview: the last few voices, newest at the bottom -->
	<div class="bkpop cmpop" class:below={cmtPop.below} style="left:{cmtPop.x}px;top:{cmtPop.y}px" role="tooltip">
		{#if cmtPop.film.comments.length}
			{#if cmtPop.film.comments.length > 3}
				<span class="sig">{T.commentMore(cmtPop.film.comments.length - 3)}</span>
			{/if}
			{#each cmtPop.film.comments.slice(-3) as comment (comment.id)}
				<div class="cmt">
					<Avatar
						name={comment.name}
						colour={comment.colour}
						avatar={comment.avatar}
						size={18}
						font={8}
						titled={false}
						xp={comment.xp}
						slim
					/>
					<div>
						<div class="who">
							<b>{comment.name}</b>
							<time>{commentDay(comment.created_at)}</time>
							{#each comment.reacts as react (react.emoji)}
								<span class="rmini">{react.emoji}{react.people.length}</span>
							{/each}
						</div>
						<p>{comment.body}</p>
					</div>
				</div>
			{/each}
		{:else}
			<span>{T.commentNone}</span>
		{/if}
	</div>
{/if}

{#if seenPop}
	{#if seenPop.tap}
		<button class="menu-backdrop" aria-label={T.close} onclick={unpeek}></button>
	{/if}
	<!-- the eye's number, read out as the faces behind it -->
	<div
		class="bkpop spop"
		class:tappable={seenPop.tap}
		class:below={seenPop.below}
		style="left:{seenPop.x}px;top:{seenPop.y}px"
		role={seenPop.tap ? 'dialog' : 'tooltip'}
	>
		<span class="sig">{T.dSeen}</span>
		{#each seenPop.film.seen as face (face.id)}
			<div class="sface">
				<Avatar
					name={face.name}
					colour={face.colour}
					avatar={face.avatar}
					size={18}
					font={8}
					titled={false}
					slim
				/>
				<b>{face.name}</b>
			</div>
		{:else}
			<span>{T.dNobody}</span>
		{/each}
		{#if seenPop.tap}
			<!-- owning up lives here on a phone, since the card's tap now looks -->
			<form method="POST" action="?/seen" use:enhance={submit(unpeek)}>
				<input type="hidden" name="filmId" value={seenPop.film.id} />
				<button class="tap" class:on={seenPop.film.seenMine}>
					{seenPop.film.seenMine ? `✓ ${T.seenBtn}` : T.seenBtn}
				</button>
			</form>
		{/if}
	</div>
{/if}

{#if commentsFilm}
	<button class="bkm-backdrop" aria-label={T.close} onclick={() => (commentsOpenId = null)}
	></button>
	<div class="bkmodal cmodal" role="dialog" aria-label={commentsFilm.title}>
		<h3>{commentsFilm.title}</h3>
		{@render commentThread(commentsFilm)}
	</div>
{/if}

{#if backersFilm}
	<!-- everyone with points on the film; each pill opens the usual face popup
	     above this modal (the popup layers sit higher on purpose) -->
	<button class="bkm-backdrop" aria-label={T.close} onclick={() => (backersOpenId = null)}
	></button>
	<div class="bkmodal" role="dialog" aria-label={T.dBacked}>
		<h3>{backersFilm.title}</h3>
		<div class="bkmgrid">
			{#each backersFilm.backers as backer (backer.person_id)}
				{@render bkPill(backer)}
			{/each}
		</div>
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
		<!-- where the number lands next week if nothing more is spent on it -->
		<div class="srow next">
			<span>{T.scoreNext}</span>
			<b>≈ {fmtScore(scorePop.next)}</b>
		</div>
		<span class="sig">{T.fadeNote(rules)}</span>
	</div>
{/if}

<!-- it is placed from a rect, so anything that moves the pill has to close it -->
<svelte:window
	onscroll={unpeek}
	onresize={unpeek}
	onkeydown={(event) => {
		if (event.key !== 'Escape') return;
		unpeek();
		backersOpenId = null;
		commentsOpenId = null;
	}}
	onpointerdown={disarmElsewhere}
/>
