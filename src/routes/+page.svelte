<script lang="ts">
	import { posterSrc } from '$lib/poster-src';
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { flip } from 'svelte/animate';
	import { reshuffle } from '$lib/reshuffle';
	import { fade, scale } from 'svelte/transition';
	import { portal } from '$lib/portal';
	import { fitViewport } from '$lib/fit-viewport';
	import { backOut, cubicIn, cubicOut } from 'svelte/easing';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Avatar from '$lib/components/Avatar.svelte';
	import CommentThread from '$lib/components/CommentThread.svelte';
	import FacePeek, {
		anchorAt,
		peekFor,
		type Peek,
		type PeekFace
	} from '$lib/components/FacePeek.svelte';
	import ScorePeek, { SCORE_W, type ScorePop } from '$lib/components/ScorePeek.svelte';
	import Poster from '$lib/components/Poster.svelte';
	import NominateModal from '$lib/components/NominateModal.svelte';
	import { dictFor, fmtScore, isVotes } from '$lib/i18n';
	import { levelOf } from '$lib/levels';
	import Banana from '$lib/components/Banana.svelte';
	import BananaBunch from '$lib/components/BananaBunch.svelte';
	import Ticket from '$lib/components/Ticket.svelte';
	import TicketStack from '$lib/components/TicketStack.svelte';
	import { say } from '$lib/toast.svelte';
	import { watchLive } from '$lib/live-poll';
	import { nomSheet } from '$lib/special-sheet.svelte';
	import { votePulse } from '$lib/vote-pulse';
	import { haptic } from '$lib/haptics';
	import { inFlight } from '$lib/points-in-flight.svelte';
	import { picked } from '$lib/look-picked.svelte';
	import { barPip, burst, fly, thump } from '$lib/vote-fx';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const T = $derived(dictFor(data.lang));
	/** a round said as the evening it ends in */
	const nominatedFor = (week: number) => T.nomPop(data.evenings[week]);
	// a banana switch flipped a moment ago, before the server has said so
	const banana = $derived(picked.banana ?? data.banana);
	const rules = $derived(data.rules);
	const votes = $derived(isVotes(rules));
	const left = $derived(data.person?.left ?? 0);
	const open = $derived(data.week?.status === 'open');
	const nominated = $derived(data.nominatedThisWeek);

	/* ----------------------------------------------------------- shortlist -- */

	// a run of votes holds the list still: every tap moves scores, and a card
	// that slid away between the first point and the second had to be hunted
	// for, or its way back with it. The order and the band are kept as they were
	// when the run began; numbers, dots and faces still change in place, and
	// once nothing the viewer gave can still be taken back (or SETTLE_MS after
	// the last landing, when nothing could) everything glides to where it now
	// belongs
	const SETTLE_MS = 2500;
	let still = $state<{ order: number[]; shortlist: number[] } | null>(null);
	let settleTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => () => clearTimeout(settleTimer));

	const shortlist = $derived(new Set(still ? still.shortlist : data.shortlistIds));
	// §3.5: a sleeper is no candidate, so it does not sit in the candidates' half
	// of the list. Pulling the shortlist to the front makes the band a prefix
	// again, and the cards at the top of the screen the ones that actually go to
	// the room. Both halves keep the §3.2 ordering, so the rest is still headed
	// by whatever scored highest among them, sleeper or not
	const ranked = $derived(
		shortlist.size
			? [
					...data.films.filter((film) => shortlist.has(film.id)),
					...data.films.filter((film) => !shortlist.has(film.id))
				]
			: data.films
	);
	// held still, a film keeps its seat; one that was not there yet goes last
	const ordered = $derived.by(() => {
		if (!still) return ranked;
		const seat = new Map(still.order.map((id, i) => [id, i]));
		return [...ranked].sort(
			(a, b) => (seat.get(a.id) ?? Infinity) - (seat.get(b.id) ?? Infinity)
		);
	});
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

	// drives the undo countdowns; 250 ms keeps the seconds display honest, and
	// it only runs while one of them does
	let nowMs = $state(Date.now());
	const undoRunning = $derived(
		data.films.some((film) => film.myGraceUntil && new Date(film.myGraceUntil).getTime() > nowMs)
	);
	$effect(() => {
		if (!undoRunning) return;
		nowMs = Date.now();
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

	/* ------------------------------------------------------- the base -- */

	const canCast = (film: Film) => open && left > 0 && Boolean(data.person);
	// which cards wear the faces and the + as their base: a member's, on the
	// live list, under points
	const based = (film: Film, shelf: boolean) => Boolean(data.person) && !votes && !shelf;
	// faces in the stack until the row's width is spent; a fold of one is
	// never worth its "+1", so the last face shows instead. The width is each
	// stack's own, measured, since a phone's row is narrower than the cap and
	// faces that do not fit would run under the +
	const FACE_ROOM = 210;
	let faceRoom = $state<Record<number, number>>({});
	// what is happening to a film about to go, said in full: the hover on the
	// words beside the card's +, and the sleeper's line
	function riskSays(film: Film) {
		if (!data.week) return '';
		return rules.attrition.kind === 'archive'
			? T.warnFades(
					Math.max(1, rules.attrition.afterWeeksAtZero - (data.week.number - film.added_week))
				)
			: T.warnDrops;
	}
	// goes when this round closes, said to everyone; and if you could still put
	// a point on it, the + says so too
	const endangered = (film: Film) => film.atRisk && !film.held && open;
	const rescuable = (film: Film) => endangered(film) && canCast(film);

	function stackFit(points: number[], room = FACE_ROOM): number {
		let width = 0;
		let fit = 0;
		for (const p of points) {
			const next = width + faceSize(p) - (fit ? 8 : 0);
			if (next > room - (fit < points.length - 1 ? 30 : 0)) break;
			width = next;
			fit++;
		}
		return fit >= points.length - 1 ? points.length : fit;
	}
	// a face in the stack grows with what its owner gave the film: its area in
	// proportion to the points, so eleven against two looks it, and five
	// against three looks close. Capped, so one big giver cannot crowd the row
	const faceSize = (points: number) => Math.round(Math.min(44, 16 * Math.sqrt(Math.max(1, points))));

	// who gave what: a tap on the stack opens the card itself downwards into a
	// list, right there under the poster, and a second tap folds it again. No
	// sheet, no backdrop, nothing to learn
	let crowdOpen = $state<number | null>(null);
	// opening it, the faces in the stack fly down to their seats in the list,
	// and closing it they fly back, so nobody is on the card twice. Each flies
	// as a copy over the page (the list unfolds inside a clip, which would cut
	// a face off on its way in), the face at either end hidden until it lands
	async function toggleCrowd(filmId: number, from: Element) {
		unpeek();
		const opening = crowdOpen !== filmId;
		const card = from.closest('.film');
		const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!card || still) {
			crowdOpen = opening ? filmId : null;
			return;
		}
		const faces = (where: string) =>
			new Map(
				[...card.querySelectorAll<HTMLElement>(`${where} [data-pid]`)].map((el) => [
					el.dataset.pid!,
					el
				])
			);
		const starts = faces(opening ? '.bfaces' : '.crowd');
		const rects = new Map([...starts].map(([pid, el]) => [pid, el.getBoundingClientRect()]));
		crowdOpen = opening ? filmId : null;
		await tick();
		const ends = faces(opening ? '.crowd' : '.bfaces');
		let k = 0;
		for (const [pid, end] of ends) {
			const start = starts.get(pid);
			const a = rects.get(pid);
			if (!start || !a || !a.width) continue;
			flyFace(start, a, end, k++);
		}
	}
	function flyFace(start: HTMLElement, a: DOMRect, end: HTMLElement, k: number) {
		const copy = start.cloneNode(true) as HTMLElement;
		copy.classList.add('faceflight');
		copy.removeAttribute('data-pid');
		Object.assign(copy.style, {
			left: `${a.left}px`,
			top: `${a.top}px`,
			width: `${a.width}px`,
			height: `${a.height}px`
		});
		document.body.append(copy);
		start.style.visibility = 'hidden';
		end.style.visibility = 'hidden';
		copy.querySelector('.ftop')?.animate([{ opacity: 1 }, { opacity: 0 }], {
			duration: 200,
			delay: k * 28,
			fill: 'forwards'
		});
		// the seat is looked up again every frame rather than once at take-off:
		// the list is still unfolding (and on a phone the page may scroll under
		// it), so a seat measured at the start has moved by the time it lands
		const begin = performance.now() + k * 28;
		const duration = 420;
		const ease = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
		const frame = (now: number) => {
			const t = Math.min(1, Math.max(0, (now - begin) / duration));
			const e = ease(t);
			const b = end.getBoundingClientRect();
			const dx = b.left + b.width / 2 - (a.left + a.width / 2);
			const dy = b.top + b.height / 2 - (a.top + a.height / 2);
			const scale = b.width / a.width;
			// a little lift on the way, as if picked up and set down
			const arc = Math.sin(Math.PI * e);
			copy.style.transform = `translate(${dx * e}px, ${dy * e - 14 * arc}px) scale(${1 + (scale - 1) * e + 0.08 * arc})`;
			if (t < 1) requestAnimationFrame(frame);
			else land();
		};
		// both ends given back: the stack keeps its faces hidden by class while
		// it is open, and a closed list is folded out of sight anyway
		const land = () => {
			end.style.visibility = '';
			start.style.visibility = '';
			copy.remove();
		};
		requestAnimationFrame(frame);
	}

	/** a number that runs to its new value rather than jumping there */
	function tween(node: HTMLElement, value: number) {
		let shown = value;
		let frame = 0;
		const reduced = matchMedia('(prefers-reduced-motion: reduce)');
		const paint = (n: number) => (node.textContent = fmtScore(Math.round(n * 10) / 10));
		return {
			update(next: number) {
				cancelAnimationFrame(frame);
				if (reduced.matches || next === shown) {
					shown = next;
					paint(next);
					return;
				}
				const from = shown;
				let start = -1;
				const step = (now: number) => {
					// timed from the first frame it paints, and held inside 0..1: a
					// frame's stamp can come before the call that asked for it
					if (start < 0) start = now;
					const t = Math.min(1, Math.max(0, (now - start) / 520));
					const eased = 1 - (1 - t) ** 3;
					shown = from + (next - from) * eased;
					paint(shown);
					if (t < 1) frame = requestAnimationFrame(step);
					else shown = next;
				};
				frame = requestAnimationFrame(step);
			},
			destroy: () => cancelAnimationFrame(frame)
		};
	}

	/* ------------------------------------------------- feeling a vote -- */

	// a point is the one thing everybody spends here every week, so spending one
	// should feel like something: a tick under the thumb, the point flying out of
	// the bar into the film, and a knock as it lands. Taking it back flies it home
	function castFx(button: Element, filmId?: number) {
		haptic();
		// measured before the bar redraws, so the point leaves from where it was
		const flight = fly(barPip('free'), button);
		inFlight.spent = (inFlight.spent ?? data.person?.spent ?? 0) + 1;
		flight.then(() => {
			// the card may have redrawn its button, or moved, while the point flew
			const target =
				(filmId !== undefined && document.querySelector(`[data-vote="${filmId}"]`)) || button;
			burst(target);
			thump(target);
			haptic('knock');
		});
	}

	function undoFx(button: Element) {
		haptic();
		const home = barPip('spent');
		inFlight.spent = Math.max(0, (inFlight.spent ?? data.person?.spent ?? 0) - 1);
		fly(button, home);
	}

	// the reorder after a run of votes (lib/reshuffle.ts) and the faces' own
	// glides; instant for reduced motion
	const flipMs =
		typeof matchMedia === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches
			? 0
			: 450;

	/** the film's modal appears where it stands: a short rise, a touch of scale, a fade */
	function grow(node: HTMLElement, { out = false }: { out?: boolean } = {}) {
		return {
			duration: flipMs ? (out ? 140 : 200) : 0,
			easing: out ? cubicIn : cubicOut,
			css: (t: number, u: number) => `transform: translateY(${u * 10}px) scale(${0.97 + 0.03 * t}); opacity: ${t};`
		};
	}

	/**
	 * Starts the drain ring exactly once per mount. An action rather than a style
	 * binding, because the binding would re-run on every tick and restart the
	 * CSS animation from zero.
	 */
	function drain(node: SVGElement, opts: { until: string; total: number }) {
		const leftMs = Math.max(0, new Date(opts.until).getTime() - Date.now());
		node.style.animation = `ringdrain ${opts.total}s linear -${opts.total - leftMs / 1000}s forwards`;
	}

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
	let scorePop = $state<ScorePop | null>(null);
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
		rows: WeekPoints[] = [],
		// opened from the card's own list: the weeks counted back from now and
		// the points drawn as points, the way the list beside it draws them
		crowd = false
	) {
		clearTimeout(closing);
		const now = data.week?.number;
		const next = peekFor(
			pill,
			face,
			sub,
			tap,
			rows.map((row) => ({
				label: crowd && now ? T.weeksAgo(now - row.week) : T.evening(data.evenings[row.week]),
				value: String(row.points)
			})),
			crowd ? (banana ? 'banana' : 'ticket') : undefined
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
			// the nominator's face is already on the card the note was opened from
			sig: '',
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
		if (!(el instanceof HTMLElement) || rules.scoring !== 'fade' || !data.week) return;
		if (!film.weeklyPoints.length) return;
		shutPops();
		// age is on the list's clock, which a special round does not move, so two
		// rounds can be the same age; their points count together, as in the score
		const byAge = new Map<number, number>();
		for (const row of film.weeklyPoints) byAge.set(row.age, (byAge.get(row.age) ?? 0) + row.points);
		const rows = [...byAge].map(([ago, points]) => {
			const mult = rules.decayFactor ** ago;
			return { points, ago, mult, contrib: points * mult };
		});
		const total = rows.reduce((sum, row) => sum + row.contrib, 0);
		// the weeks that still add something worth a digit are spelled out; the
		// long tail too old to matter is one line at the end
		const kept = rows.filter((row, i) => i === 0 || row.contrib >= 0.05);
		const rest = rows.filter((row) => !kept.includes(row));
		const pct = (m: number) => (m >= 0.995 ? '100%' : m >= 0.01 ? `${Math.round(m * 100)}%` : '<1%');
		scorePop = {
			score: fmtScore(film.score),
			unit: T.unit(film.score, votes),
			next: fmtScore(total * rules.decayFactor),
			rows: kept.map((row) => ({
				label: T.weeksAgo(row.ago),
				points: row.points,
				worth: pct(row.mult),
				adds: `+${fmtScore(row.contrib)}`
			})),
			older: rest.length
				? `+${fmtScore(rest.reduce((sum, row) => sum + row.contrib, 0))}`
				: null,
			note: T.fadeNote(rules),
			tap,
			...anchorAt(el, SCORE_W, 150 + kept.length * 22)
		};
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
	// a film from the dropped shelf, read in a modal of its own: it has no
	// score, backers or thread to show, only what it is and the way back
	let droppedId = $state<number | null>(null);
	// the modal films are put up in opens from the + in the bar, which the
	// layout draws, so whether it is open lives with the bar's. Leaving the list
	// shuts it, so it is not found open on the way back
	const searchOpen = $derived(nomSheet.open);
	$effect(() => () => (nomSheet.open = false));
	// the +N fold opens every backer pill in a small modal; face popups stack on top
	// the badge on the poster opens the thread in a modal, for reading and writing
	let commentsOpenId = $state<number | null>(null);

	const detail = $derived(
		detailId === null
			? null
			: ([...data.films, ...data.archived].find((f) => f.id === detailId) ?? null)
	);
	const droppedFilm = $derived(
		droppedId === null ? null : (data.dropped.find((f) => f.id === droppedId) ?? null)
	);
	const commentsFilm = $derived(
		commentsOpenId === null
			? null
			: ([...data.films, ...data.archived].find((f) => f.id === commentsOpenId) ?? null)
	);
	function closeSheets() {
		unpeek();
		detailId = null;
		droppedId = null;
		noteEdit = false;
		nomSheet.open = false;
	}

	/* ------------------------------------------------------------- search -- */

	// the modal itself is NominateModal; the list knows what is already up
	const known = $derived(
		new Set([...data.films, ...data.archived].map((f) => f.title.toLowerCase()))
	);

	/* -------------------------------------------------------------- forms -- */

	// the viewer's own writes in flight; the live poll waits for them to land
	let sending = $state(0);

	function submit(onOk?: () => void): SubmitFunction {
		return ({ action }) => {
			sending += 1;
			const vote = action.search.includes('setPoints');
			if (vote) {
				clearTimeout(settleTimer);
				still ??= { order: ordered.map((film) => film.id), shortlist: [...shortlist] };
			}
			return async ({ result, update }) => {
				sending -= 1;
				if (vote) clearTimeout(settleTimer);
				if (result.type === 'failure') {
					const body = result.data as
						| { code?: string; params?: Record<string, string | number>; message?: string }
						| undefined;
					say(T.error(body?.code ?? '', body?.params ?? {}, body?.message ?? ''), true);
				}
				if (result.type === 'success') onOk?.();
				await update({ reset: false });
				// a vote refused leaves the bar to say what the server says
				if (vote && result.type !== 'success') inFlight.spent = null;
				if (vote) {
					// restarted by every landing, and measured from the page as it now
					// is: the list moves when the last of the viewer's undos runs out
					clearTimeout(settleTimer);
					nowMs = Date.now();
					const undoable = data.films.filter(canUndo).map(graceLeftMs);
					settleTimer = setTimeout(
						() => (still = null),
						undoable.length ? Math.max(...undoable) + 200 : SETTLE_MS
					);
				}
			};
		};
	}

	// other people's votes, as they land: a short poll, and a reload only when
	// the server has moved past what is on screen. The cards glide to their new
	// seats on the same flip a vote of your own uses, the coin pulses, and new
	// faces pop in. Anything open or half-done holds it back until it is not
	$effect(() =>
		watchLive({
			read: async () => (await (await fetch('/api/live', { cache: 'no-store' })).json()).gen,
			current: () => data.live,
			refresh: () => invalidateAll(),
			// a film's sheet is only read, so what it says keeps up with the vote just
			// cast elsewhere; it holds the refresh only while somebody is typing in it
			busy: () =>
				sending > 0 ||
				(detailId !== null && (noteEdit || document.activeElement instanceof HTMLTextAreaElement)) ||
				droppedId !== null ||
				searchOpen ||
				crowdOpen !== null ||
				commentsOpenId !== null ||
				peek !== null ||
				notePop !== null ||
				scorePop !== null ||
				cmtPop !== null ||
				seenPop !== null
		})
	);

	$effect(() => {
		if (!form) return;
		if ('nominated' in form && form.nominated) say(T.tNominated(form.nominated));
		if ('renominated' in form && form.renominated) {
			say(T.tRenominated(form.renominated));
			droppedId = null;
		}
		if ('noteSaved' in form && form.noteSaved) say(T.tNoteSaved);
		if ('commented' in form && form.commented) say(T.tCommented);
		if ('held' in form && form.held) say(T.tHeld(form.held));
		if ('released' in form && form.released) say(T.tReleased(form.released));
	});


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
		in:scale={{ duration: 260, start: 0.3, easing: backOut }}
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
	<CommentThread {film} lang={data.lang} {submit} admin={data.person?.isAdmin} />
{/snippet}

<!-- §3.5, said on the title line rather than in the fine print: a sleeper's row
     is one line tall, and the chip trailing the title is the only place that
     leaves the coin and the dock where every other card puts them -->
{#snippet heldChip(film: Film)}
	{#if film.held}
		{@const who = film.held.personId === data.person?.id ? T.holdMine : film.held.name}
		<!-- a line, not a chip: a moon, that it sits this round out, and whose
		     call it was. With a reason given, the line opens it -->
		{#snippet says()}
			<svg class="moon" viewBox="0 0 12 12" aria-hidden="true"
				><path d="M9.8 7.6A4.4 4.4 0 0 1 4.4 2.2 4.4 4.4 0 1 0 9.8 7.6z" /></svg
			>
			<span class="sleepwhat">{T.holdWhat}</span>
			<span class="holdwho">{who}</span>
		{/snippet}
		{#if film.held.reason}
			<button
				class="sleeps why"
				type="button"
				onpointerenter={(event) => {
					mousing = event.pointerType === 'mouse';
					if (mousing) holdAt(event.currentTarget, film, false);
				}}
				onpointerleave={(event) => event.pointerType === 'mouse' && unpeekSoon()}
				onclick={(event) => !mousing && holdAt(event.currentTarget, film, true)}
				onblur={unpeek}
			>
				{@render says()}
			</button>
		{:else}
			<span class="sleeps">{@render says()}</span>
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
					onclick={(event) => toggleCrowd(film.id, event.currentTarget)}
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
						onclick={(event) => undoFx(event.currentTarget)}
						in:scale={{ duration: 260, start: 0.3, easing: backOut }}
					>
						{@render graceRing(film)}
						<i>{undoSeconds(film)}</i>
					</button>
				</form>
			{:else}
				<span class="pip set"><i>{#if banana}<Banana />{:else}<Ticket />{/if}</i></span>
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
					onclick={(event) => castFx(event.currentTarget)}
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

{#snippet scoreNum(film: Film)}
	<!-- the score, at one width wherever it stands, so down the list the numbers
	     line up and the order reads at a glance; a tap or a hover explains it -->
	<button
		class="pcnum"
		type="button"
		onpointerenter={(event) => {
			mousing = event.pointerType === 'mouse';
			if (mousing) scoreAt(event.currentTarget, film, false);
		}}
		onpointerleave={(event) => event.pointerType === 'mouse' && unpeekSoon()}
		onclick={(event) => !mousing && scoreAt(event.currentTarget, film, true)}
		onblur={unpeek}
		><b use:votePulse={film.score} use:tween={film.score}>{fmtScore(film.score)}</b><i
			>{T.unit(film.score, votes)}</i
		></button
	>
{/snippet}

{#snippet base(film: Film)}
	<!-- the card's base: who is behind the film, as faces big enough to know,
	     and the + that adds you. More people is a longer row, which is the
	     sign of a film the group wants rather than one somebody does. Whoever
	     put points in this week is lit; the rest rest quietened -->
	{@const fresh = (b: Film['backers'][number]) => b.weekly.some((w) => w.week === data.week?.number)}
	<!-- the stack is in order of what each gave, and each face is sized by it,
	     so the row reads at a glance as one person carrying a film or many
	     chipping in; the fan gives the exact count -->
	{@const mineFirst = [...film.backers].sort((x, y) => y.points - x.points)}
	<!-- the room is what the + and anything beside it leave, less the ring's
	     reach past the last face -->
	{@const fit = stackFit(
		mineFirst.map((b) => b.points),
		Math.min(FACE_ROOM, (faceRoom[film.id] ?? FACE_ROOM) - 4)
	)}
	<div class="fbase">
		{#if !film.held}
		<button
			class="bfaces"
			class:open={crowdOpen === film.id}
			type="button"
			aria-expanded={crowdOpen === film.id}
			aria-label={film.backers.map((b) => `${b.name} ${b.points}`).join(', ') || T.noBackers}
			onclick={(event) => film.backers.length && toggleCrowd(film.id, event.currentTarget)}
			bind:clientWidth={faceRoom[film.id]}
		>
			{#each mineFirst.slice(0, fit) as backer, i (backer.person_id)}
				<!-- the row leads with whoever matters most here, so each face lies
				     over the one after it, never under -->
				<span
					class="fface"
					data-pid={backer.person_id}
					style:z-index={film.backers.length - i}
					class:lit={fresh(backer)}
					animate:flip={{ duration: flipMs ? 380 : 0, easing: cubicOut }}
					in:scale={{ duration: flipMs ? 360 : 0, start: 0.5, easing: cubicOut }}
				>
					<Avatar
						name={backer.name}
						colour={backer.colour}
						avatar={backer.avatar}
						size={faceSize(backer.points)}
						font={Math.round(faceSize(backer.points) * 0.4)}
						titled={false}
					/>
					{#if i === 0 && backer.points > 1}
						<!-- the biggest giver's count, the one number worth a glance -->
						<b class="ftop">{backer.points}</b>
					{/if}
				</span>
			{/each}
			{#if !film.backers.length}
				<span class="nobk">{T.noBackers}</span>
			{/if}
			{#if film.backers.length > fit}
				<span class="fmore">+{film.backers.length - fit}</span>
			{/if}
			<!-- open, the faces are down in the list: what is left here is the
			     way to fold it back up -->
			<svg class="fshut" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 7.8 6 4.3l3.5 3.5" /></svg>
		</button>
		{/if}
		<div class="fvote" data-vote={film.id}>
			{#if canUndo(film)}
				<!-- for the grace window the + is the way back: ↶ in a draining ring -->
				<form method="POST" action="?/setPoints" use:enhance={submit()}>
					<input type="hidden" name="filmId" value={film.id} />
					<button
						class="fundo"
						class:urgent={graceLeftMs(film) < 6000}
						name="points"
						value={film.myPoints - 1}
						aria-label={T.btnUndo(undoSeconds(film))}
						title={T.btnUndo(undoSeconds(film))}
						onclick={(event) => undoFx(event.currentTarget)}
					>
						{@render graceRing(film)}
						<svg class="fback" viewBox="0 0 12 12" aria-hidden="true"
							><path d="M4.2 3.2 2 5.4l2.2 2.2M2.3 5.4h5a2.7 2.7 0 0 1 0 5.4H6" /></svg
						>
					</button>
				</form>
			{/if}
			{#if film.held}
				<!-- §3.5: asleep, it cannot be a candidate tonight and a point put on it
				     only fades, so it is offered no + at all; a point put on it just
				     before it fell asleep can still be taken back above -->
			{:else if !canCast(film) && film.myPoints > 0 && !canUndo(film)}
				<!-- nothing left to give, some of it went here, and the way back has
				     closed: only then does the + settle into what you gave, still lit,
				     so the card reads as yours. Until then it stays the + it was -->
				<span
					class="pcdone"
					aria-label={T.dYours(film.myPoints, votes)}
					in:scale={{ duration: 380, start: 0.5, easing: backOut }}
				>
					<i>{#if banana}<Banana />{:else}<Ticket />{/if}</i>
					{#key film.myPoints}<b>{film.myPoints}</b>{/key}
				</span>
			{:else}
				{#if endangered(film)}
					<!-- about to go: no line of warning on the card (which would grow
					     and shrink with every vote that saves it and every undo), but
					     its poster fading and the + saying so, right where the answer is -->
					<span class="rescue" title={riskSays(film)}>{T.rescue}</span>
				{/if}
				<form method="POST" action="?/setPoints" use:enhance={submit()}>
					<input type="hidden" name="filmId" value={film.id} />
					<button
						class="pcplus"
						class:mine={film.myPoints > 0}
						class:rescuing={rescuable(film)}
						name="points"
						value={film.myPoints + 1}
						disabled={!canCast(film)}
						aria-label={T.btnAddPoint}
						onclick={(event) => castFx(event.currentTarget, film.id)}
					>
						<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2 6h8" /></svg>
						{#if film.myPoints > 0}
							{#key film.myPoints}<span class="bpcount">{film.myPoints}</span>{/key}
						{/if}
					</button>
				</form>
			{/if}
		</div>
	</div>
{/snippet}

<!-- the card's fine print: the attrition warning on the left, and on the right
     edge the thread's pill and an eye that both counts who has seen the film
     and toggles the viewer's own mark. Where the faces and the + are the card's
     base it sits in the text column; on the rest, along the base -->
{#snippet fineprint(film: Film, lead: boolean)}
	{@render status(film, lead)}
	{@render chips(film)}
{/snippet}

<!-- what is happening to the film: about to drop, or the nominator's chance to
     let it sleep a round -->
{#snippet status(film: Film, lead: boolean)}
	{#if film.atRisk && data.week}
		<span class="warnchip">{riskSays(film)}</span>
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
{/snippet}

<!-- the thread and the eye, the card's two small counts -->
{#snippet chips(film: Film)}
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
		<div class="pw" style:--art={lead && film.poster_url ? `url("${encodeURI(posterSrc(film.poster_url))}")` : null}>
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
					if (mousing) peekAt(event.currentTarget, film.nominator, nominatedFor(film.added_week), false);
				}}
				onpointerleave={(event) => event.pointerType === 'mouse' && unpeekSoon()}
				onclick={(event) =>
					!mousing && peekAt(event.currentTarget, film.nominator, nominatedFor(film.added_week), true)}
				onfocus={(event) => {
					if (event.currentTarget.matches(':focus-visible'))
						peekAt(event.currentTarget, film.nominator, nominatedFor(film.added_week), false);
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
					{#if based(film, shelf) && !film.held}
						<!-- the two small counts, in the room under the pitch, so the
						     row below has the width for the faces -->
						<div class="fchips">{@render chips(film)}</div>
					{/if}
				</div>
				{#if data.person && !votes && !shelf}
					{@render scoreNum(film)}
				{:else}
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
					<b use:votePulse={film.score}>{fmtScore(film.score)}</b><i>{T.unit(film.score, votes)}</i>
				</button>
				{/if}
			</div>
			<div class="ft">
				{#if based(film, shelf)}
					<!-- the faces, the counts and the + sit at the foot of the text
					     column, level with the foot of the poster, so the card is
					     the poster's height and no taller -->
					{@render base(film)}
				{:else}
					{@render backerRow(film)}
				{/if}
				{#if votes}
					<form method="POST" action="?/setPoints" use:enhance={submit()}>
						<input type="hidden" name="filmId" value={film.id} />
						<button
							class="tap"
							class:on={film.myPoints > 0}
							name="points"
							value={film.myPoints > 0 ? 0 : 1}
							onclick={(event) =>
								film.myPoints > 0 ? undoFx(event.currentTarget) : castFx(event.currentTarget)}
							disabled={!open ||
								(film.myPoints === 0 && left < 1) ||
								(film.myPoints > 0 && !canUndo(film))}
						>
							{film.myPoints > 0 ? T.btnVoted : T.btnVote}
						</button>
					</form>
				{/if}
			</div>
		</div>
		<!-- the card's fine print along its base: all of it on a card without
		     the faces and the +, and on a sleeper's one-line card what is
		     happening to it; on a card with the faces it is in the counts' row -->
		{#if !based(film, shelf)}
			<div class="cardfoot">{@render fineprint(film, lead)}</div>
		{:else if film.held && ((film.atRisk && data.week) || (lead && canHold(film)))}
			<div class="cardfoot">{@render status(film, lead)}</div>
		{/if}
		{#if (based(film, shelf) && !film.held) || film.backers.length > 7}
			<!-- who gave what, opened in the card itself: biggest first, a face,
			     a name, and the points drawn as points. Always in the card and
			     folded to nothing, so opening it is one smooth unfold -->
			<div class="crowdfold" class:open={crowdOpen === film.id} inert={crowdOpen !== film.id}>
			<div class="crowdclip">
			<div class="crowd">
				{#each [...film.backers].sort((x, y) => y.points - x.points) as backer, r (backer.person_id)}
					<!-- a face over its points; the name, the rank and the weeks are
					     a tap away, in the face's own popup -->
					<button
						class="crowdrow"
						class:me={backer.person_id === data.person?.id}
						style:--r={r}
						type="button"
						aria-label="{backer.name}, {backer.points} {T.unit(backer.points, votes)}"
						onpointerenter={(event) => {
							mousing = event.pointerType === 'mouse';
							if (mousing)
								peekAt(
									event.currentTarget,
									backer,
									'',
									false,
									backer.weekly,
									true
								);
						}}
						onpointerleave={(event) => event.pointerType === 'mouse' && unpeekSoon()}
						onclick={(event) =>
							!mousing &&
							peekAt(
								event.currentTarget,
								backer,
								'',
								true,
								backer.weekly,
								true
							)}
					>
						<span class="cface" data-pid={backer.person_id}>
							<Avatar
								name={backer.name}
								colour={backer.colour}
								avatar={backer.avatar}
								size={30}
								font={12}
								titled={false}
								xp={backer.xp}
								slim
							/>
						</span>
						<!-- the points drawn as points, every five gathered into one mark:
						     a bunch of bananas, or a hand of tickets -->
						<span class="crowdpts">
							{#each Array(Math.floor(backer.points / 5)) as _, k (k)}
								<i class="five">{#if banana}<BananaBunch />{:else}<TicketStack />{/if}</i>
							{/each}
							{#each Array(backer.points % 5) as _, k (k)}
								<i>{#if banana}<Banana />{:else}<Ticket />{/if}</i>
							{/each}
						</span>
					</button>
				{/each}
			</div>
			</div>
			</div>
		{/if}
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
			animate:reshuffle={{ still: !flipMs, flat: film === null }}
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

{#if data.archived.length || data.dropped.length}
	<!-- what fell off the list is history, not the vote: folded away until asked
	     for, the count on the fold saying how much is in there -->
	<details class="shelfbox">
		<summary class="sec">
			{rules.attrition.kind === 'archive'
				? T.shelfArchive(data.archived.length)
				: T.shelfDropped(data.dropped.length)}
			<svg class="shelfchev" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"
				><path d="M2 3.6 5 6.6 8 3.6" /></svg
			>
		</summary>
		<div class="list">
			{#each data.archived as film (film.id)}
				{@render row(film, false, true)}
			{/each}
			{#each data.dropped as film (film.id)}
				<!-- the card opens the film's page; the button inside keeps its own job -->
				<div
					class="film shelf"
					role="button"
					tabindex="0"
					onclick={(event) => !(event.target as Element).closest('form') && (droppedId = film.id)}
					onkeydown={(event) =>
						event.target === event.currentTarget &&
						(event.key === 'Enter' || event.key === ' ') &&
						(event.preventDefault(), (droppedId = film.id))}
				>
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
	</details>
{/if}

<!-- ------------------------------------------------------------ sheets -- -->

<!-- the film's own page, in a modal in the middle of the screen like the one
     films are put up in: a bottom sheet slid up from under the screen was the
     one thing here iOS would not reliably let anybody tap -->
{#if detail}
<button
	class="dveil"
	aria-label={T.close}
	onclick={closeSheets}
	in:fade={{ duration: flipMs ? 180 : 0 }}
	out:fade={{ duration: flipMs ? 140 : 0 }}
></button>
<!-- stays where Svelte expects it, while the modal moves above the look -->
<div class="phost">
<div
	class="dsheet dmodal"
	role="dialog"
	aria-modal="true"
	aria-label={detail.title}
	use:portal
	use:fitViewport
	in:grow
	out:grow={{ out: true }}
>
	<!-- the way out has a row of its own, so it never sits on a panel -->
	<div class="dxrow">
		<button class="dx" type="button" aria-label={T.close} onclick={closeSheets}>
			<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" /></svg>
		</button>
	</div>
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
					<span class="dwhen">{nominatedFor(detail.added_week)}</span>
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
									“{detail.note}”
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
</div>
{/if}

{#if droppedFilm}
<button
	class="dveil"
	aria-label={T.close}
	onclick={closeSheets}
	in:fade={{ duration: flipMs ? 180 : 0 }}
	out:fade={{ duration: flipMs ? 140 : 0 }}
></button>
<div class="phost">
<div
	class="dsheet dmodal"
	role="dialog"
	aria-modal="true"
	aria-label={droppedFilm.title}
	use:portal
	use:fitViewport
	in:grow
	out:grow={{ out: true }}
>
	<div class="dxrow">
		<button class="dx" type="button" aria-label={T.close} onclick={closeSheets}>
			<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" /></svg>
		</button>
	</div>
	<div class="inner">
		<div class="dblock dtop">
			<div class="dhero">
				<div class="p"><Poster title={droppedFilm.title} url={droppedFilm.poster_url} /></div>
				<div class="dh">
					<h2>{droppedFilm.title}</h2>
					<div class="yr">
						{[droppedFilm.year, droppedFilm.director].filter(Boolean).join(' · ')}
					</div>
				</div>
			</div>
			<div class="dmeta">
				{#if droppedFilm.genre}<span class="mchip">{droppedFilm.genre}</span>{/if}
				{#if droppedFilm.runtime}<span class="mchip">{T.minutes(droppedFilm.runtime)}</span>{/if}
				{#if droppedFilm.nominator}{@render facePill(droppedFilm.nominator)}{/if}
				<span class="dwhen">{nominatedFor(droppedFilm.added_week)}</span>
			</div>
		</div>

		{#if droppedFilm.note}
			<div class="dblock pitch"><div class="dnote">“{droppedFilm.note}”</div></div>
		{/if}
		{#if droppedFilm.overview}
			<div class="dblock"><p class="over">{droppedFilm.overview}</p></div>
		{/if}
		{#if droppedFilm.tmdb_id}
			<p class="dlink">
				<a
					href="https://www.themoviedb.org/movie/{droppedFilm.tmdb_id}"
					target="_blank"
					rel="noopener noreferrer">{T.tmdbLink} ↗</a
				>
			</p>
		{/if}

		<div class="dblock">
			{#if nominated}<div class="holdhint">{T.nomDone(nominated.title)}</div>{/if}
			<form method="POST" action="?/renominate" use:enhance={submit()}>
				<input type="hidden" name="filmId" value={droppedFilm.id} />
				<input type="hidden" name="title" value={droppedFilm.title} />
				<div class="cbtns">
					<button class="go" disabled={Boolean(nominated) || !open}>{T.btnRenominate}</button>
				</div>
			</form>
		</div>
	</div>
</div>
</div>
{/if}

<NominateModal lang={data.lang} heading={T.nomH} hint={T.nomHint} {known} {submit} />

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


{#if scorePop}
	<ScorePeek pop={scorePop} lang={data.lang} marks={banana ? 'banana' : 'ticket'} onclose={unpeek} />
{/if}

<!-- it is placed from a rect, so anything that moves the pill has to close it -->
<svelte:window
	onscroll={unpeek}
	onresize={unpeek}
	onkeydown={(event) => {
		if (event.key !== 'Escape') return;
		// one press closes one thing: whatever is on top first, the film's modal last
		if (crowdOpen !== null || commentsOpenId !== null) {
			crowdOpen = null;
			commentsOpenId = null;
		} else if (detailId !== null || droppedId !== null || searchOpen) closeSheets();
		unpeek();
	}}
/>
