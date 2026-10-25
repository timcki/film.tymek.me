<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fade, fly } from 'svelte/transition';
	import { backOut, cubicOut } from 'svelte/easing';
	import Avatar from './Avatar.svelte';
	import Poster from './Poster.svelte';
	import RaceLane from './RaceLane.svelte';
	import { dictFor, type Lang } from '$lib/i18n';
	import { unfold } from '$lib/unfold';

	/**
	 * §7.3 on the projector: the count as a race. Every ballot that lands hands
	 * out its points (n-1 for first place down to nothing for last) and each
	 * film's bar grows by what it got, so the room watches the totals build the
	 * way it would watch any scoreboard. Until the last ballot is in, the films
	 * keep a fixed order that gives nothing away; then they line up by points
	 * with the winner on top.
	 *
	 * Above them, while the count runs, stands the ballot that just landed: its
	 * person, and a slot for each place saying what the place is worth with the
	 * film the ballot put there, so the room reads whose vote it was and where
	 * its points went. It opens with the first ballot and folds away with the
	 * last.
	 */
	type Film = { id: number; title: string; poster_url: string | null };
	type Ballot = { name: string; colour: string; avatar: string | null; xp: number; ranking: number[] };
	let {
		films,
		winnerId,
		ballots,
		counted,
		revealed,
		lang,
		spooky = false,
		onreplay
	}: {
		/** in the recorded result order, winner first */
		films: Film[];
		winnerId: number;
		ballots: Ballot[];
		counted: number;
		revealed: boolean;
		lang: Lang;
		spooky?: boolean;
		/** plays the count again on the screen; the phones are not told */
		onreplay?: () => void;
	} = $props();

	const T = $derived(dictFor(lang));
	const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const ms = (n: number) => (still ? 0 : n);

	const n = $derived(films.length);
	// a ballot's points for a film; one it never placed shares last place, as in tally()
	const pointsFrom = (ranking: number[], id: number) => n - 1 - ((ranking.indexOf(id) + 1 || n) - 1);
	const landed = $derived(ballots.slice(0, counted));
	const totals = $derived(
		new Map(films.map((film) => [film.id, landed.reduce((sum, b) => sum + pointsFrom(b.ranking, film.id), 0)]))
	);
	// the bars are drawn against the most any film could have, so they only grow
	const most = $derived(Math.max(1, (n - 1) * ballots.length));
	// the hand-over from the count is a sequence, never two moves at once: the
	// last ballot folds away, then (with nothing else moving, or the bars would
	// measure their way from places that are still shifting) they line up by
	// points, and only then does anything open underneath them
	let ranked = $state(false);
	$effect(() => {
		if (!revealed) {
			ranked = false;
			return;
		}
		const timer = setTimeout(() => (ranked = true), ms(380));
		return () => clearTimeout(timer);
	});
	const lanes = $derived(ranked ? films : [...films].sort((a, b) => a.id - b.id));
	const top = $derived(Math.max(...films.map((film) => totals.get(film.id) ?? 0)));
	const latest = $derived(counted > 0 && !revealed ? ballots[counted - 1] : null);
	const filmOf = (id: number) => films.find((film) => film.id === id);
	// level on points with the runner-up: the winner was settled by §3.2
	const tied = $derived(films.length > 1 && totals.get(films[0].id) === totals.get(films[1].id));
	const places = $derived(Array.from({ length: n }, (_, i) => i));

	let open = $state(false);
</script>

<div class="race">
	{#if latest}
		<!-- the ballot that just landed: one slot a place, each saying what it is
		     worth; one ballot hands over to the next by crossfading in place -->
		<div class="ballotwrap" transition:unfold={{ duration: ms(420) }}>
			<div class="ballot">
				<div class="who">
					{#key counted}
						<span class="whoin" in:fly={{ y: 8, duration: ms(260), easing: cubicOut }} out:fade={{ duration: ms(180) }}>
							<Avatar name={latest.name} colour={latest.colour} avatar={latest.avatar} xp={latest.xp} size={64} font={22} titled={false} />
							<b>{latest.name}</b>
						</span>
					{/key}
				</div>
				<div class="slots">
					{#each places as place (place)}
						{@const id = latest.ranking[place]}
						{@const worth = n - 1 - place}
						<div class="slot" class:first={place === 0}>
							<span class="pocket">
								{#if id !== undefined}
									{#key `${counted}:${place}`}
										<span
											class="sposter"
											in:fly={{ y: -14, duration: ms(320), delay: ms(place * 70), easing: backOut }}
											out:fade={{ duration: ms(180) }}
										>
											<Poster title={filmOf(id)?.title ?? ''} url={filmOf(id)?.poster_url ?? null} />
										</span>
									{/key}
								{/if}
							</span>
							<em>{worth}<small>{T.racePts(worth)}</small></em>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<div class="lanes">
		{#each lanes as film (film.id)}
			{@const points = totals.get(film.id) ?? 0}
			<!-- once it is decided they line up by points, a beat after the last
			     ballot has folded away -->
			<div animate:flip={{ duration: ms(800) }}>
				<RaceLane
					title={film.title}
					poster={film.poster_url}
					{points}
					gain={latest ? pointsFrom(latest.ranking, film.id) : 0}
					stamp={counted}
					{most}
					leading={!ranked && points > 0 && points === top}
					won={ranked && film.id === winnerId}
					behind={ranked && film.id !== winnerId}
					{spooky}
				/>
			</div>
		{/each}
	</div>

	{#if ranked && tied}
		<p class="note" in:unfold={{ delay: ms(820), duration: ms(360) }}>{T.raceTie}</p>
	{/if}

	{#if ranked}
		<div class="votes" in:unfold={{ delay: ms(820), duration: ms(420) }}>
			<!-- what there is to do once it is decided: read every vote, or watch
			     the count again -->
			<div class="acts">
				<button type="button" class="act" onclick={() => (open = !open)} aria-expanded={open}>
					<svg viewBox="0 0 20 20" aria-hidden="true"
						><circle cx="4" cy="5" r="1.3" /><circle cx="4" cy="10" r="1.3" /><circle cx="4" cy="15" r="1.3" /><path
							d="M8 5h8.5M8 10h8.5M8 15h8.5"
						/></svg
					>
					{open ? T.raceHideAll : T.raceShowAll}
					<svg class="chev" class:up={open} viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" /></svg>
				</button>
				{#if onreplay}
					<button type="button" class="act" onclick={onreplay}>
						<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 10a6 6 0 1 1-1.76-4.24" /><path d="M16.6 3.4v3.5h-3.5" /></svg>
						{T.hostReplay}
					</button>
				{/if}
			</div>
			{#if open}
				<!-- every ballot as the list its person made, with what each place earned -->
				<div class="vlist" transition:fade={{ duration: ms(200) }}>
					{#each ballots as ballot, i (i)}
						<div class="vballot">
							<Avatar name={ballot.name} colour={ballot.colour} avatar={ballot.avatar} xp={ballot.xp} size={28} font={10} titled={false} slim />
							<b>{ballot.name}</b>
							<span class="vorder">
								{#each ballot.ranking as id (id)}
									<span class="vpick" class:won={id === winnerId} title={filmOf(id)?.title}>
										<span class="vmini"><Poster title={filmOf(id)?.title ?? ''} url={filmOf(id)?.poster_url ?? null} /></span>
										<i>+{pointsFrom(ballot.ranking, id)}</i>
									</span>
								{/each}
							</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.race { display: grid; gap: 18px; }
	/* the ballot as one compact card, centred: the person, then their places */
	.ballotwrap { display: grid; justify-items: center; }
	.ballot {
		display: grid;
		grid-template-columns: 160px auto;
		align-items: center;
		gap: 22px;
		padding: 16px 22px 16px 16px;
		border-radius: 22px;
		background: color-mix(in srgb, var(--sunk) 70%, transparent);
	}
	.who { min-width: 0; display: grid; }
	.whoin { grid-area: 1 / 1; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
	.whoin b { font-size: 20px; line-height: 1.2; overflow-wrap: anywhere; }
	.slots { display: flex; gap: 12px; }
	.slot {
		display: grid;
		justify-items: center;
		gap: 10px;
		width: 146px;
		padding: 12px 10px;
		border-radius: 16px;
		background: var(--card);
	}
	.slot.first { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent); }
	/* the slot a film drops into: an outline waiting for a poster */
	.pocket {
		display: grid;
		width: 120px;
		aspect-ratio: 2/3;
		border-radius: 10px;
		border: 1.5px dashed color-mix(in srgb, var(--ink) 16%, transparent);
		overflow: hidden;
	}
	.pocket:has(.sposter) { border-color: transparent; box-shadow: 0 8px 20px -10px var(--shadow); }
	.sposter { display: block; grid-area: 1 / 1; width: 100%; height: 100%; }
	.sposter :global(img), .vmini :global(img) { display: block; width: 100%; height: 100%; object-fit: cover; }
	.slot em {
		display: flex;
		align-items: baseline;
		gap: 4px;
		font-style: normal;
		font-size: 22px;
		font-weight: 800;
		line-height: 1;
		color: var(--accent);
		font-variant-numeric: tabular-nums;
	}
	.slot em small { font-size: 13px; font-weight: 700; color: var(--dim); }
	.lanes { display: grid; gap: 12px; }
	.note { margin: 0; color: var(--dim); font-size: 15px; }
	.votes { display: grid; gap: 14px; margin-top: 4px; }
	.acts { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; }
	.act {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		height: 42px;
		padding: 0 18px 0 15px;
		border: 0;
		border-radius: 99px;
		background: var(--raise);
		color: var(--ink2);
		font: inherit;
		font-size: 14.5px;
		font-weight: 650;
		cursor: pointer;
		transition: background 0.2s, color 0.2s, box-shadow 0.2s, transform 0.12s;
	}
	.act:hover,
	.act[aria-expanded='true'] {
		background: color-mix(in srgb, var(--accent) 16%, var(--raise));
		color: var(--accent);
		box-shadow: 0 0 22px -10px var(--accent);
	}
	.act:active { transform: scale(0.97); }
	.act svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
	.act svg circle { fill: currentColor; stroke: none; }
	.act .chev { width: 12px; height: 12px; margin-left: -2px; transition: transform 0.25s; }
	.act .chev.up { transform: rotate(180deg); }
	.vlist { width: 100%; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 8px; }
	.vballot { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; background: color-mix(in srgb, var(--sunk) 70%, transparent); }
	.vballot b { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.vorder { display: flex; gap: 8px; }
	.vpick { display: flex; align-items: center; gap: 3px; }
	.vpick i { font-style: normal; font-size: 12px; font-weight: 800; color: var(--dim); }
	.vpick.won i { color: var(--accent); }
	.vmini { width: 24px; aspect-ratio: 2/3; border-radius: 4px; overflow: hidden; background: var(--raise); }
	.vpick.won .vmini { box-shadow: 0 0 0 2px var(--accent); }
	@media (prefers-reduced-motion: reduce) {
		.act, .act .chev { transition: none; }
	}
	@media (max-width: 760px) {
		.ballotwrap { justify-items: stretch; }
		.ballot { grid-template-columns: minmax(0, 1fr); }
		.slots { justify-content: space-between; }
		.slot { width: auto; flex: 1; }
	}
</style>
