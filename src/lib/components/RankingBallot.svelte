<script lang="ts">
	import { enhance } from '$app/forms';
	import { flip } from 'svelte/animate';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { dictFor, type Lang } from '$lib/i18n';
	import { say } from '$lib/toast.svelte';
	import Poster from './Poster.svelte';
	import SeenCount from './SeenCount.svelte';

	let { films, seen, lang, savedRanking, personId = '', action = '?/flashVote' }: {
		films: { id: number; title: string; year: number | null; runtime: number | null; poster_url: string | null }[];
		seen: Record<number, number>;
		lang: Lang;
		savedRanking?: number[];
		personId?: string;
		action?: string;
	} = $props();
	const T = $derived(dictFor(lang));
	let draft = $state<number[] | null>(null);
	let submitted = $state<number[] | null>(null);
	let busy = $state(false);
	const saved = $derived(submitted ?? savedRanking ?? []);
	const ranking = $derived(draft ?? saved);
	const complete = $derived(ranking.length === films.length);
	const unchanged = $derived(JSON.stringify(ranking) === JSON.stringify(saved));
	// the order so far rises to the top, so the list reads as the ranking it is
	// becoming; whatever is still unplaced keeps the shortlist's order underneath
	const ordered = $derived([
		...ranking.map((id) => films.find((f) => f.id === id)!).filter(Boolean),
		...films.filter((f) => !ranking.includes(f.id))
	]);
	const motion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;

	function toggle(id: number) {
		if (ranking.includes(id)) {
			draft = ranking.filter((f) => f !== id);
			return;
		}
		const next = [...ranking, id];
		// with one film left there is no choice left to make, so it takes last place
		const rest = films.filter((f) => !next.includes(f.id));
		draft = rest.length === 1 ? [...next, rest[0].id] : next;
	}

	const submit: SubmitFunction = () => {
		busy = true;
		const sending = [...ranking];
		return async ({ result, update }) => {
			busy = false;
			if (result.type === 'success') {
				submitted = sending;
				draft = null;
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

<form method="POST" {action} use:enhance={submit}>
	<p class="hintline">{T.roomRankHint}</p>
	<input type="hidden" name="personId" value={personId} />
	{#each ranking as id (id)}
		<input type="hidden" name="filmId" value={id} />
	{/each}
	<div class="roomvote">
		{#each ordered as film (film.id)}
			{@const position = ranking.indexOf(film.id) + 1}
			<button type="button" class="pickbtn" class:on={position > 0} animate:flip={{ duration: motion }}
				aria-pressed={position > 0} disabled={busy} onclick={() => toggle(film.id)}>
				<div class="th"><Poster title={film.title} url={film.poster_url} /></div>
				<div class="rbody">
					<b>{film.title}</b>
					<span>{[film.year, film.runtime ? T.minutes(film.runtime) : null].filter(Boolean).join(' · ')} · <SeenCount n={seen[film.id] ?? 0} size={11} /></span>
				</div>
				<!-- a placed film wears its place; an unplaced one, ringed the way the
				     list rings an unspent vote, shows the place a tap would give it -->
				<span class="rankcoin" class:next={!position} aria-label={position ? T.roomRankPosition(position) : undefined}>
					{#if !position}
						<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.4" pathLength="24" /></svg>
					{/if}
					<b aria-hidden="true">{position || ranking.length + 1}</b>
				</span>
			</button>
		{/each}
	</div>
	<div class="rankbar">
		<div class="rankstatus" aria-live="polite">
			{#if saved.length === films.length && unchanged}
				<span class="okchip">{T.roomRankSaved}</span>
			{:else if saved.length}
				<span>{T.roomRankUnsaved}</span>
			{:else}
				<span>{T.roomRankProgress(ranking.length, films.length)}</span>
			{/if}
		</div>
		<div class="rankactions">
			<button type="button" class="ghostbtn" disabled={busy || !ranking.length} onclick={() => (draft = [])}>{T.roomRankReset}</button>
			<button class="bigbtn" disabled={busy || !complete || unchanged}>{T.roomRankSave}</button>
		</div>
	</div>
</form>

<style>
	.roomvote { margin-top: 10px; }
	.roomvote .pickbtn { gap: 14px; padding: 12px 14px 12px 12px; margin-bottom: 10px; }
	.roomvote .pickbtn .th { width: 56px; flex-basis: 56px; border-radius: 9px; }
	.roomvote .pickbtn b { font-size: 16.5px; line-height: 1.25; }
	.rbody { display: flex; flex-direction: column; }
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
	.roomvote .pickbtn .rankcoin.next { background: none; color: color-mix(in srgb, var(--accent) 45%, transparent); }
	.pickbtn .rankcoin.next b { font-size: 15px; }
	.rankcoin svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	.rankcoin circle {
		fill: none;
		stroke: color-mix(in srgb, var(--accent) 55%, transparent);
		stroke-width: 0.7;
		stroke-linecap: round;
		stroke-dasharray: 0.9 1.1;
	}
	.pickbtn:not(.on) .th { opacity: 0.8; }
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
	.rankactions { display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: center; }
	.rankactions button { width: auto; margin-top: 0; padding: 15px 18px; }
	button:disabled { opacity: .45; cursor: default; }
	@media (prefers-reduced-motion: reduce) {
		.rankcoin { transition: none; }
	}
</style>
