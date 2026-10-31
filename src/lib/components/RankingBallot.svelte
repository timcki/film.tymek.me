<script lang="ts">
	import { enhance } from '$app/forms';
	import { flip } from 'svelte/animate';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { dictFor, type Lang } from '$lib/i18n';
	import { say } from '$lib/toast.svelte';
	import Poster from './Poster.svelte';
	import SeenCount from './SeenCount.svelte';
	import type { Look } from '$lib/themes';
	import LookToken from './LookToken.svelte';

	let {
		films,
		seen,
		lang,
		savedRanking,
		personId = '',
		action = '?/flashVote',
		withdraw,
		look = null
	}: {
		films: { id: number; title: string; year: number | null; runtime: number | null; poster_url: string | null }[];
		seen: Record<number, number>;
		lang: Lang;
		savedRanking?: number[];
		personId?: string;
		action?: string;
		/** where a saved ranking is taken back from; without it the save only saves */
		withdraw?: string;
		/** §3.6: a night with a look ranks with its lanterns, lit once the ranking is saved */
		look?: Look | null;
	} = $props();
	const T = $derived(dictFor(lang));

	/* ------------------------------------------------------------- the order -- */

	// §7.2: the films stand in a column and the column is the ranking, best at
	// the top. It starts as the saved ranking when there is one, otherwise as the
	// shortlist, so there is never a film left unplaced
	const startOrder = () =>
		savedRanking?.length === films.length ? [...savedRanking] : films.map((film) => film.id);
	let order = $state<number[]>(startOrder());
	let submitted = $state<number[] | null>(null);
	let busy = $state(false);
	const saved = $derived(submitted ?? savedRanking ?? []);
	// the lanterns are lit by saving, and go dark again the moment the order on
	// screen stops being the one the room has
	const isSaved = $derived(saved.length === films.length && saved.every((id, i) => order[i] === id));
	const ordered = $derived(order.map((id) => films.find((film) => film.id === id)!).filter(Boolean));
	const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const motion = still ? 0 : 220;

	/* -------------------------------------------------------------- dragging -- */

	// a mouse picks a card up as soon as it moves; a finger has to hold it a
	// moment first, so a swipe across the cards still scrolls the page
	const HOLD_MS = 170;
	const SLOP = 8;
	const GAP = 10;
	type Drag = { id: number; from: number; to: number; dy: number; slot: number };
	let drag = $state<Drag | null>(null);
	let press: {
		id: number;
		el: HTMLElement;
		x: number;
		y: number;
		pointer: number;
		mouse: boolean;
		timer?: ReturnType<typeof setTimeout>;
	} | null = null;

	function lift() {
		if (!press) return;
		const from = order.indexOf(press.id);
		drag = { id: press.id, from, to: from, dy: 0, slot: press.el.offsetHeight + GAP };
		press.el.setPointerCapture?.(press.pointer);
		navigator.vibrate?.(8);
	}

	function down(event: PointerEvent, id: number) {
		if (busy || event.button > 0) return;
		const mouse = event.pointerType === 'mouse';
		press = {
			id,
			el: event.currentTarget as HTMLElement,
			x: event.clientX,
			y: event.clientY,
			pointer: event.pointerId,
			mouse
		};
		if (!mouse) press.timer = setTimeout(lift, HOLD_MS);
	}

	function move(event: PointerEvent) {
		if (drag && press) {
			const dy = event.clientY - press.y;
			const to = Math.max(0, Math.min(order.length - 1, drag.from + Math.round(dy / drag.slot)));
			drag = { ...drag, dy, to };
			return;
		}
		if (!press) return;
		if (Math.hypot(event.clientX - press.x, event.clientY - press.y) <= SLOP) return;
		if (press.mouse) lift();
		else {
			// moving before the hold was up: that was a scroll, not a pick-up
			clearTimeout(press.timer);
			press = null;
		}
	}

	// the drop lands in one motion. The cards that stood aside are already where
	// the new order puts them, so they swap their offset for their new place in
	// the same frame with nothing animating; only the card let go glides the
	// last bit from under the finger into its slot. Animating both the offsets
	// and the reorder made the neighbours jump
	let landing = $state<{ id: number; dy: number } | null>(null);
	let instant = $state(false);

	function up() {
		if (press) clearTimeout(press.timer);
		if (drag && drag.to !== drag.from) {
			const next = [...order];
			next.splice(drag.to, 0, ...next.splice(drag.from, 1));
			instant = true;
			landing = { id: drag.id, dy: drag.dy - (drag.to - drag.from) * drag.slot };
			order = next;
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					instant = false;
					landing = null;
				})
			);
		}
		drag = null;
		press = null;
	}

	// once a card is up, the finger is dragging it and not the page
	function holdScroll(node: HTMLElement) {
		const stop = (event: TouchEvent) => {
			if (drag) event.preventDefault();
		};
		node.addEventListener('touchmove', stop, { passive: false });
		return { destroy: () => node.removeEventListener('touchmove', stop) };
	}

	// the places as they would be if the card in the hand were dropped now, so
	// the numbers change hands as it passes; the column itself only reorders on
	// the drop
	const placing = $derived.by(() => {
		if (!drag || drag.to === drag.from) return order;
		const next = [...order];
		next.splice(drag.to, 0, ...next.splice(drag.from, 1));
		return next;
	});

	/** where a card stands while another is being carried past it */
	function shift(id: number): string | undefined {
		if (landing?.id === id) return `translateY(${landing.dy}px) scale(1.03)`;
		if (!drag) return undefined;
		if (id === drag.id) return `translateY(${drag.dy}px) scale(1.03)`;
		const at = order.indexOf(id);
		if (drag.from < drag.to && at > drag.from && at <= drag.to) return `translateY(${-drag.slot}px)`;
		if (drag.to < drag.from && at >= drag.to && at < drag.from) return `translateY(${drag.slot}px)`;
		return undefined;
	}

	/** the arrow keys move a focused card a place at a time */
	function nudge(event: KeyboardEvent, id: number) {
		const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
		if (!step || busy) return;
		event.preventDefault();
		const from = order.indexOf(id);
		const to = from + step;
		if (to < 0 || to >= order.length) return;
		const next = [...order];
		[next[from], next[to]] = [next[to], next[from]];
		order = next;
	}

	/* ---------------------------------------------------------------- saving -- */

	// the save works both ways: pressed with the ranking saved, it takes it back
	const taking = $derived(isSaved && Boolean(withdraw));

	const submit: SubmitFunction = () => {
		busy = true;
		const sending = taking ? [] : [...order];
		return async ({ result, update }) => {
			busy = false;
			if (result.type === 'success') {
				submitted = sending;
			} else if (result.type === 'failure') {
				const body = result.data as { code?: string; params?: Record<string, string | number>; message?: string };
				say(T.error(body.code ?? '', body.params ?? {}, body.message ?? ''), true);
			}
			await update({ reset: false });
			// personal and guest-device ballots follow the server after refresh;
			// proxy ballots stay local because the server never discloses them
			if (savedRanking !== undefined) submitted = null;
		};
	};
</script>

<svelte:window onpointermove={move} onpointerup={up} onpointercancel={up} />

<form method="POST" action={taking ? withdraw : action} use:enhance={submit}>
	<input type="hidden" name="personId" value={personId} />
	{#if !taking}
		{#each order as id (id)}
			<input type="hidden" name="filmId" value={id} />
		{/each}
	{/if}
	<div class="roomvote" use:holdScroll>
		{#each ordered as film (film.id)}
			{@const position = placing.indexOf(film.id) + 1}
			<button
				type="button"
				class="pickbtn"
				class:on={isSaved}
				class:carried={drag?.id === film.id}
				class:landing={landing?.id === film.id}
				class:instant
				style:transform={shift(film.id)}
				animate:flip={{ duration: instant || drag ? 0 : motion }}
				aria-label="{film.title}, {T.roomRankPosition(position)}"
				disabled={busy}
				onpointerdown={(event) => down(event, film.id)}
				onkeydown={(event) => nudge(event, film.id)}
				oncontextmenu={(event) => event.preventDefault()}
			>
				<!-- the grip says the card can be picked up -->
				<span class="grip" aria-hidden="true">
					<svg viewBox="0 0 8 14"
						><circle cx="2" cy="2" r="1.2" /><circle cx="6" cy="2" r="1.2" /><circle cx="2" cy="7" r="1.2" /><circle
							cx="6"
							cy="7"
							r="1.2"
						/><circle cx="2" cy="12" r="1.2" /><circle cx="6" cy="12" r="1.2" /></svg
					>
				</span>
				<div class="th"><Poster title={film.title} url={film.poster_url} /></div>
				<div class="rbody">
					<b>{film.title}</b>
					<span>{[film.year, film.runtime ? T.minutes(film.runtime) : null].filter(Boolean).join(' · ')} · <SeenCount n={seen[film.id] ?? 0} size={11} /></span>
				</div>
				{#if look}
					<!-- the place carved into a pumpkin: dark until the ranking is
					     saved, then lit with a candle, the film in first burning
					     brightest -->
					<span class="pcoin" class:on={isSaved} class:first={isSaved && position === 1} aria-hidden="true">
						<LookToken {look} size={44} lit={isSaved} live carve={String(position)} />
					</span>
				{:else}
					<!-- the place, ringed the way the list rings an unspent vote until
					     the ranking is saved, and filled in once it is -->
					<span class="rankcoin" class:next={!isSaved} aria-hidden="true">
						{#if !isSaved}
							<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="5.4" pathLength="24" /></svg>
						{/if}
						<b>{position}</b>
					</span>
				{/if}
			</button>
		{/each}
	</div>
	<div class="rankbar">
		<div class="rankstatus" aria-live="polite">
			{#if !isSaved && saved.length}
				<span>{T.roomRankUnsaved}</span>
			{/if}
		</div>
		<button
			class="bigbtn savebtn"
			class:pressed={isSaved}
			aria-pressed={isSaved}
			disabled={busy || (isSaved && !withdraw)}
		>
			{#if isSaved}
				<!-- saved, the button stays down and says how to take it back up -->
				<span class="savemain">{T.roomRankSaved}</span>
				{#if withdraw}<span class="savehint">{T.roomRankUndo}</span>{/if}
			{:else}
				{T.roomRankSave}
			{/if}
		</button>
	</div>
</form>

<style>
	.roomvote { margin-top: 10px; }
	.roomvote .pickbtn {
		gap: 12px;
		padding: 12px 14px 12px 8px;
		margin-bottom: 10px;
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		cursor: grab;
		transition: transform 0.18s ease, box-shadow 0.18s ease;
	}
	/* the card in the hand: lifted off the column, following the finger exactly */
	.roomvote .pickbtn.carried {
		position: relative;
		z-index: 3;
		cursor: grabbing;
		transition: box-shadow 0.18s ease;
		box-shadow: 0 18px 40px -12px var(--shadow), 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
	}
	/* let go: still above its neighbours while it glides into its slot */
	.roomvote .pickbtn.landing { position: relative; z-index: 3; }
	.roomvote .pickbtn.instant { transition: none; }
	.roomvote .pickbtn .th { width: 56px; flex-basis: 56px; border-radius: 9px; }
	.roomvote .pickbtn b { font-size: 16.5px; line-height: 1.25; }
	.grip { flex: none; display: grid; place-items: center; width: 14px; align-self: stretch; color: var(--dimmer); }
	.grip svg { width: 8px; height: 14px; fill: currentColor; }
	.rbody { display: flex; flex-direction: column; min-width: 0; flex: 1; }
	.rbody span { color: var(--dim); }
	/* the place itself, big enough to read at arm's length in a dark room */
	.roomvote .pickbtn .rankcoin {
		position: relative;
		margin: 0;
		flex: none;
		width: 46px;
		height: 46px;
		border-radius: 50%;
		display: grid;
		place-content: center;
		background: var(--accent);
		color: var(--accent-ink);
		transition: background 0.18s, color 0.18s;
	}
	.pickbtn .rankcoin b { font-size: 20px; font-weight: 800; line-height: 1; margin: 0; font-variant-numeric: tabular-nums; }
	.roomvote .pickbtn .rankcoin.next { background: none; color: color-mix(in srgb, var(--accent) 60%, transparent); }
	.rankcoin svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	.rankcoin circle {
		fill: none;
		stroke: color-mix(in srgb, var(--accent) 55%, transparent);
		stroke-width: 0.7;
		stroke-linecap: round;
		stroke-dasharray: 0.9 1.1;
	}
	.pcoin {
		flex: none;
		width: 46px;
		height: 46px;
		display: grid;
		place-items: center;
		padding-top: 4px;
		opacity: 0.72;
		transition: opacity 0.25s, filter 0.4s;
	}
	.pcoin.on { opacity: 1; filter: drop-shadow(0 0 5px color-mix(in srgb, var(--accent) 45%, transparent)); }
	.pcoin.first { filter: drop-shadow(0 0 12px color-mix(in srgb, var(--accent) 75%, transparent)); }
	/* the save is the one thing to do here, so it stays within thumb's reach while
	   the list scrolls above it */
	.rankbar {
		position: sticky;
		bottom: 0;
		z-index: 2;
		margin: 4px -14px 0;
		padding: 18px 14px calc(14px + env(safe-area-inset-bottom));
		background: linear-gradient(transparent, var(--bg) 22px);
	}
	.rankstatus { margin: 0 0 10px; color: var(--dim); font-size: 12.5px; min-height: 26px; display: flex; align-items: center; justify-content: center; text-align: center; }
	/* the same height saved or not, so the second line does not make it jump */
	.savebtn {
		width: 100%;
		min-height: 58px;
		margin-top: 0;
		padding: 8px 18px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		transition: background 0.25s, color 0.25s, box-shadow 0.25s;
	}
	/* pressed, the save stays down: the ranking is in, and pressing it again
	   takes it back out */
	.savebtn.pressed {
		background: color-mix(in srgb, var(--accent) 16%, var(--card));
		color: var(--accent);
		box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 60%, transparent);
	}
	button:disabled { opacity: .45; cursor: default; }
	.savebtn.pressed:disabled { opacity: 1; }
	.savemain { line-height: 1.25; }
	.savehint { font-size: 12.5px; font-weight: 600; line-height: 1.2; opacity: 0.75; }
	@media (prefers-reduced-motion: reduce) {
		.rankcoin, .pcoin, .roomvote .pickbtn, .savebtn { transition: none; }
	}
</style>
