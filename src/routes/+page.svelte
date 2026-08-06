<script lang="ts">
	import { enhance } from '$app/forms';
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
	type Backer = Film['backers'][number];

	/* ------------------------------------------------------------ backers -- */

	/** width of .bkpop; the clamp needs it before the popup has been laid out */
	const POP_W = 156;
	/** roughly its height, only ever used to decide whether it still fits above */
	const POP_H = 190;

	let peek = $state<{ backer: Backer; x: number; y: number; below: boolean; tap: boolean } | null>(
		null
	);
	let closing: ReturnType<typeof setTimeout>;
	// a mouse opens on hover and a finger on tap. A touchscreen laptop does both,
	// so go by the pointer that actually arrived rather than what the screen can do
	let mousing = false;

	function peekAt(pill: EventTarget | null, backer: Backer, tap: boolean) {
		clearTimeout(closing);
		if (!(pill instanceof HTMLElement)) return;
		const box = pill.getBoundingClientRect();
		const half = POP_W / 2;
		const below = box.top < POP_H;
		peek = {
			backer,
			// clamped, or the pills at either end of the row get sliced by the viewport
			x: Math.min(Math.max(box.left + box.width / 2, half + 8), window.innerWidth - half - 8),
			y: below ? box.bottom : box.top,
			below,
			tap
		};
	}

	function unpeek() {
		clearTimeout(closing);
		peek = null;
	}

	// a beat of grace, so crossing the gap between two pills does not flicker
	function unpeekSoon() {
		clearTimeout(closing);
		closing = setTimeout(() => (peek = null), 80);
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
			{#each film.backers as backer (backer.person_id)}
				<!-- a 16px face says nothing on a phone, so the pill opens a readable one -->
				<button
					class="bk"
					type="button"
					aria-label={backer.name}
					transition:scale={{ duration: 180, start: 0.5, easing: backOut }}
					onpointerenter={(event) => {
						mousing = event.pointerType === 'mouse';
						if (mousing) peekAt(event.currentTarget, backer, false);
					}}
					onpointerleave={(event) => event.pointerType === 'mouse' && unpeekSoon()}
					onclick={(event) => !mousing && peekAt(event.currentTarget, backer, true)}
					onfocus={(event) => {
						// a tap focuses too, and would fight the click handler for the same pill
						if (event.currentTarget.matches(':focus-visible'))
							peekAt(event.currentTarget, backer, false);
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
					{#key backer.points}
						<b in:scale={{ duration: 200, start: 1.7, easing: backOut }}>{backer.points}</b>
					{/key}
				</button>
			{/each}
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
						<i>{undoSeconds(film)}</i>
					</button>
				</form>
			{:else}
				<span class="pip set"><i>✓</i></span>
			{/if}
		{/each}
		{#each Array(Math.max(0, left)) as _, i (i)}
			<!-- the transition keeps every card honest in motion: spending anywhere
			     makes this slot leave gracefully instead of blinking out -->
			<form
				method="POST"
				action="?/setPoints"
				use:enhance={submit()}
				transition:scale={{ duration: 180, start: 0.4, easing: backOut }}
			>
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

{#snippet row(film: Film, lead: boolean, shelf: boolean)}
	<div class="film" class:lead class:fading={film.atRisk && !shelf} class:shelf>
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
		<div class="b">
			<div class="hd">
				<div class="ttl">{film.title}</div>
				<div class="sc"><b>{fmtScore(film.score)}</b><i>{T.unit(film.score, votes)}</i></div>
			</div>
			<div class="meta">
				{film.year ?? ''}{#if film.year && film.director}<span class="dot"> · </span>{/if}{film.director ??
					''}
			</div>
			<div class="meta2">
				{[
					film.genre,
					film.runtime ? T.minutes(film.runtime) : null,
					T.addedBy(film.addedByName, film.added_week)
				]
					.filter(Boolean)
					.join(' · ')}
			</div>
			{#if film.note}<div class="note">{film.note}</div>{/if}
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
				{:else if film.myPoints + left > 0}
					<!-- no dock at all when there is nothing to do here: no dead UI -->
					{@render pipDock(film)}
				{/if}
			</div>
		</div>
	</div>
{/snippet}

<div class="list">
	{#each data.films as film, i (film.id)}
		{#if data.shortlistCount && i === 0}
			<div class="shortlist-head">{T.shortlistHead(data.shortlistCount)}</div>
			<p class="shortlist-note">{T.shortlistNote(data.shortlistCount)}</p>
		{/if}
		{#if data.shortlistCount && i === data.shortlistCount}
			<div class="rest-head">{T.restHead}</div>
		{/if}
		{@render row(film, i < data.shortlistCount, false)}
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
					<div class="hd"><div class="ttl">{film.title}</div></div>
					<div class="meta">{film.year ?? ''}</div>
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
					<div class="sc">
						<b>{fmtScore(detail.score)}</b>
						<small>{T.unit(detail.score, votes)} · {T.sortLabel(rules)}</small>
					</div>
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
			name={peek.backer.name}
			colour={peek.backer.colour}
			avatar={peek.backer.avatar}
			size={116}
			font={40}
			titled={false}
		/>
		<b>{peek.backer.name}</b>
		<span class="bktitle">{T.levels[levelOf(peek.backer.xp)]}</span>
		<span>{peek.backer.points} {T.unit(peek.backer.points, votes)}</span>
	</div>
{/if}

<!-- it is placed from a rect, so anything that moves the pill has to close it -->
<svelte:window
	onscroll={unpeek}
	onresize={unpeek}
	onkeydown={(event) => event.key === 'Escape' && unpeek()}
/>
