<script lang="ts">
	import { enhance } from '$app/forms';
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
					<b>{backer.points}</b>
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
				<form method="POST" action="?/setPoints" use:enhance={submit()}>
					<input type="hidden" name="filmId" value={film.id} />
					{#if votes}
						<button
							class="tap"
							class:on={film.myPoints > 0}
							name="points"
							value={film.myPoints > 0 ? 0 : 1}
							disabled={!open ||
								(film.myPoints === 0 && left < 1) ||
								(film.myPoints > 0 && film.myFloor > 0)}
						>
							{film.myPoints > 0 ? T.btnVoted : T.btnVote}
						</button>
					{:else}
						<button
							class="tap"
							class:on={film.myPoints > 0}
							name="points"
							value={film.myPoints + 1}
							disabled={!open || left < 1}
						>
							{film.myPoints > 0 ? T.btnSpent(film.myPoints) : T.btnAddPoint}
						</button>
					{/if}
				</form>
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
				<div class="step">
					<form method="POST" action="?/setPoints" use:enhance={submit()}>
						<input type="hidden" name="filmId" value={detail.id} />
						<button
							name="points"
							value={Math.max(detail.myFloor, detail.myPoints - 1)}
							disabled={!open || detail.myPoints <= detail.myFloor}>−</button
						>
					</form>
					<span class:on={detail.myPoints > 0}>{detail.myPoints}</span>
					<form method="POST" action="?/setPoints" use:enhance={submit()}>
						<input type="hidden" name="filmId" value={detail.id} />
						<button name="points" value={detail.myPoints + 1} disabled={!open || left < 1}>+</button>
					</form>
				</div>
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
