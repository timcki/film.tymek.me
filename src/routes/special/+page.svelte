<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { fade, fly, scale } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { backOut, cubicIn, cubicInOut, cubicOut } from 'svelte/easing';
	import Avatar from '$lib/components/Avatar.svelte';
	import CommentThread from '$lib/components/CommentThread.svelte';
	import FacePeek, { peekFor, type Peek, type PeekFace } from '$lib/components/FacePeek.svelte';
	import Poster from '$lib/components/Poster.svelte';
	import LookToken from '$lib/components/LookToken.svelte';
	import Spider from '$lib/components/Spider.svelte';
	import LampToggle from '$lib/components/LampToggle.svelte';
	import NominateModal from '$lib/components/NominateModal.svelte';
	import { dictFor } from '$lib/i18n';
	import { say } from '$lib/toast.svelte';
	import { watchLive } from '$lib/live-poll';
	import { nomSheet } from '$lib/special-sheet.svelte';
	import { portal } from '$lib/portal';
	import { fitViewport } from '$lib/fit-viewport';
	import { knownBreach, rulesOf } from '$lib/custom-weeks';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const T = $derived(dictFor(data.lang));
	const name = $derived(data.special.custom?.name ?? T.spName(data.special.id));
	// §3.7: what a pick has to be this week, said from the rules the server checks
	const weekRules = $derived(data.special.custom ? rulesOf(data.special.custom.rules) : []);
	const open = $derived(data.week?.status === 'open');

	/* ------------------------------------------------------------- motion -- */

	// asked for less motion, every transition below takes no time at all
	const still =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const ms = (n: number) => (still ? 0 : n);

	/** the modal appears where it stands: a short rise, a touch of scale, a fade */
	function grow(node: HTMLElement, { out = false }: { out?: boolean } = {}) {
		return {
			duration: ms(out ? 140 : 200),
			easing: out ? cubicIn : cubicOut,
			css: (t: number, u: number) =>
				`transform: translateY(${u * 10}px) scale(${0.97 + 0.03 * t}); opacity: ${t};`
		};
	}

	/** the modal's contents arriving one after another, once it has room for them */
	const rise = (node: Element, i: number) =>
		fly(node, { y: 6, duration: ms(200), delay: ms(50 + i * 30), easing: cubicOut });

	/* -------------------------------------------------------------- search -- */

	// the modal itself is NominateModal; the page knows what is already up
	const known = $derived(new Set(data.picks.map((pick) => pick.title.toLowerCase())));

	/* -------------------------------------------------------------- detail -- */

	// the poster opens the film, in a modal like the one picks are put up in
	let detailId = $state<number | null>(null);
	const detail = $derived(detailId === null ? null : (data.picks.find((pick) => pick.id === detailId) ?? null));
	// the pitch is the nominator's to write, from their own pick's modal
	let noteEdit = $state(false);
	const mine = $derived(Boolean(detail && data.person && detail.added_by === data.person.id));
	const closeDetail = () => {
		detailId = null;
		noteEdit = false;
	};
	// opened from the comment pill: the modal comes up with its thread in view
	let toComments = $state(false);
	$effect(() => {
		if (!detail || !toComments) return;
		toComments = false;
		setTimeout(() => document.querySelector('.spdetail .cmts')?.scrollIntoView({ block: 'start', behavior: ms(1) ? 'smooth' : 'auto' }), ms(260));
	});

	/* --------------------------------------------------------------- lamps -- */

	// a lantern answers the tap at once and the server catches up; a refusal
	// puts it back the way it was
	let flipped = $state<Record<number, boolean>>({});
	const lit = (pick: { id: number; approved: boolean }) => flipped[pick.id] ?? pick.approved;

	function approve(id: number, next: boolean): SubmitFunction {
		return () => {
			flipped[id] = next;
			sending += 1;
			return async ({ result, update }) => {
				sending -= 1;
				if (result.type === 'failure') {
					const body = result.data as
						| { code?: string; params?: Record<string, string | number>; message?: string }
						| undefined;
					say(T.error(body?.code ?? '', body?.params ?? {}, body?.message ?? ''), true);
				}
				await update({ reset: false });
				delete flipped[id];
			};
		};
	}

	/* ------------------------------------------------------------- turnout -- */

	// the viewer's own face joins the pill the moment their first lantern is lit
	// and leaves with the last one, ahead of the server; everyone else's faces
	// arrive with the live poll. Already in, it keeps the place the server gave it
	const voters = $derived.by(() => {
		const me = data.person;
		const listed = data.turnout.voters;
		if (!me) return listed;
		const mine = data.picks.some((pick) => lit(pick));
		const there = listed.some((voter) => voter.id === me.id);
		if (mine && !there) {
			const { id, name, colour, avatar, xp } = me;
			return [{ id, name, colour, avatar, xp }, ...listed];
		}
		if (!mine && there) return listed.filter((voter) => voter.id !== me.id);
		return listed;
	});
	const voted = $derived(voters.length);

	/**
	 * A face taking its seat in the pill: the gap opens for it so the words slide
	 * along rather than jump, the face pops in with a little overshoot, and a ring
	 * of lantern light spreads off it and fades as it lands. Leaving, it shrinks
	 * away and the gap closes behind it.
	 */
	function seat(node: HTMLElement, { out = false }: { out?: boolean } = {}) {
		// the room opens and closes on the same symmetric curve over the same
		// span, so when a newcomer pushes the eighth face out of the pill the two
		// trade exactly and the pill holds its width
		const ROOM = 380;
		return {
			duration: ms(out ? ROOM : 620),
			css: (t: number) => {
				const room = cubicInOut(Math.min(1, out ? t : (t * 620) / ROOM));
				if (out) return `width: ${18 * room}px; margin-right: ${-5 * room}px; transform: scale(${t}); opacity: ${t};`;
				const pop = backOut(Math.min(1, Math.max(0, (t - 0.15) / 0.6)));
				const ring = Math.max(0, (t - 0.35) / 0.65);
				return (
					`width: ${18 * room}px; margin-right: ${-5 * room}px; transform: scale(${pop}); ` +
					`box-shadow: 0 0 0 2px var(--raise), 0 0 0 ${2 + 7 * ring}px ` +
					`color-mix(in srgb, var(--accent) ${Math.round(70 * (1 - ring) * Math.min(1, ring * 5))}%, transparent);`
				);
			}
		};
	}

	/* ---------------------------------------------------------------- peek -- */

	// the face on a poster's corner opens the same portrait it does on the list:
	// on hover for a mouse, on a tap for a finger
	let peek = $state<Peek | null>(null);
	let mousing = false;
	let closing: ReturnType<typeof setTimeout>;

	function peekAt(el: EventTarget | null, face: PeekFace, tap: boolean) {
		clearTimeout(closing);
		peek = peekFor(el, face, T.spNomPop(name), tap);
	}
	function unpeek() {
		clearTimeout(closing);
		peek = null;
	}
	// a beat of grace, so the pointer brushing the edge does not flicker it
	function unpeekSoon() {
		clearTimeout(closing);
		closing = setTimeout(() => (peek = null), 80);
	}

	/* --------------------------------------------------------------- forms -- */

	// the viewer's own writes in flight; the live poll waits for them to land
	let sending = $state(0);

	function submit(onOk?: () => void): SubmitFunction {
		return () => {
			sending += 1;
			return async ({ result, update }) => {
				sending -= 1;
				if (result.type === 'failure') {
					const body = result.data as
						| { code?: string; params?: Record<string, string | number>; message?: string }
						| undefined;
					say(T.error(body?.code ?? '', body?.params ?? {}, body?.message ?? ''), true);
				}
				if (result.type === 'success') onOk?.();
				await update({ reset: false });
			};
		};
	}

	// new picks and new faces as they land; nobody else's ticks, which stay put
	$effect(() =>
		watchLive({
			read: async () => (await (await fetch('/api/live', { cache: 'no-store' })).json()).gen,
			current: () => data.live,
			refresh: () => invalidateAll(),
			busy: () => sending > 0 || nomSheet.open
		})
	);

</script>

<!-- who is in on it, never what they ticked -->
<div class="spturn" aria-label="{voted} {T.turnoutWord(voted)}">
	<span class="tchip">
		{#if voted}
			<span class="tfaces">
				{#each voters.slice(0, 8) as voter (voter.id)}
					<span class="tface" in:seat out:seat={{ out: true }}>
						<Avatar
							name={voter.name}
							colour={voter.colour}
							avatar={voter.avatar}
							size={18}
							font={8}
							titled={false}
						/>
					</span>
				{/each}
				{#if voted > 8}<span class="tmore">+{voted - 8}</span>{/if}
			</span>
		{/if}
		<span class="twords"
			>{#key voted}<b class="tcount" in:scale={{ start: 0.5, duration: ms(320), easing: backOut }}
					>{voted}</b
				>{/key}
			{T.turnoutWord(voted)}</span
		>
	</span>
	<!-- with one pick each, the greyed + in the bar already says it is spent -->
	{#if data.special.picksPerPerson > 1}
		<span class="tchip">{T.spMine(data.used, data.special.picksPerPerson)}</span>
	{/if}
</div>

{#if data.week?.status === 'runoff'}
	<p class="banner">{T.spPicking}</p>
{/if}

{#if data.special.custom && (data.special.custom.about || weekRules.length)}
	<div class="banner spweek">
		{#if data.special.custom.about}<p>{data.special.custom.about}</p>{/if}
		{#if weekRules.length}
			<ul>
				{#each weekRules as rule (rule.kind + T.weekRule(rule))}
					<li>{T.weekRule(rule)}</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<div class="list">
	{#each data.picks as pick, i (pick.id)}
		<div
			class="film sppick"
			class:on={lit(pick)}
			animate:flip={{ duration: ms(320) }}
			in:fly={{ y: -14, duration: ms(420), easing: backOut }}
		>
			<!-- residents for some of the webs themes.css hangs: the right-hand web
			     of every sixth pick, and the left-hand one after it -->
			{#if data.look === 'halloween' && i % 6 === 0}
				<Spider zone="corner" />
			{:else if data.look === 'halloween' && i % 6 === 1}
				<Spider zone="ledge" />
			{/if}
			<div class="pw">
				<button class="p" type="button" aria-label={pick.title} onclick={() => (detailId = pick.id)}>
					<Poster title={pick.title} url={pick.poster_url} />
				</button>
				<button
					class="nomface"
					type="button"
					aria-label={pick.nominator.name}
					onpointerenter={(event) => {
						mousing = event.pointerType === 'mouse';
						if (mousing) peekAt(event.currentTarget, pick.nominator, false);
					}}
					onpointerleave={(event) => event.pointerType === 'mouse' && unpeekSoon()}
					onclick={(event) => !mousing && peekAt(event.currentTarget, pick.nominator, true)}
					onfocus={(event) => {
						if (event.currentTarget.matches(':focus-visible')) peekAt(event.currentTarget, pick.nominator, false);
					}}
					onblur={unpeek}
				>
					<Avatar
						name={pick.nominator.name}
						colour={pick.nominator.colour}
						avatar={pick.nominator.avatar}
						size={22}
						font={9}
						titled={false}
						xp={pick.nominator.xp}
						slim
					/>
				</button>
			</div>
			<div class="b">
				<div class="hd">
					<div class="hleft">
						<div class="ttl">
							<span class="tname">{pick.title}</span>
							{#if pick.year || pick.runtime}
								<span class="mm"
									>{[pick.year, pick.runtime ? T.minutes(pick.runtime) : null]
										.filter(Boolean)
										.join(' · ')}</span
								>
							{/if}
						</div>
						{#if pick.note}
							<p class="spnote">“{pick.note}”</p>
						{:else if pick.overview}
							<p class="spnote blurb">{pick.overview}</p>
						{:else if pick.director || pick.genre}
							<p class="spnote blurb">{[pick.director, pick.genre].filter(Boolean).join(' · ')}</p>
						{/if}
					</div>
				</div>
				<div class="ft">
					<!-- the thread's pill: opens the film with its comments in view -->
					<button
						class="eyebtn cmtbtn"
						type="button"
						aria-label={pick.comments.length ? T.commentsH(pick.comments.length) : T.commentNone}
						onclick={() => {
							toComments = true;
							detailId = pick.id;
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
						<b>{pick.comments.length}</b>
					</button>
					<form method="POST" action="?/seen" use:enhance={submit()}>
						<input type="hidden" name="filmId" value={pick.id} />
						<button
							class="eyebtn"
							class:on={pick.seenMine}
							title={pick.seen.map((face) => face.name).join(', ') || T.seenBtn}
							aria-label={T.seenBtn}
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
							<b>{pick.seen.length}</b>
						</button>
					</form>
					<form method="POST" action="?/approve" use:enhance={approve(pick.id, !lit(pick))}>
						<input type="hidden" name="filmId" value={pick.id} />
						<input type="hidden" name="title" value={pick.title} />
						<input type="hidden" name="on" value={lit(pick) ? '0' : '1'} />
						<LampToggle on={lit(pick)} label={T.spYes} disabled={!open} look={data.look} />
					</form>
				</div>
			</div>
		</div>
	{:else}
		<!-- an empty round is an invitation, not an absence: a lantern lit for
		     whoever goes first, and the button that makes them first -->
		<div class="spempty">
			{#if data.look}<span class="spempty-lamp"><LookToken look={data.look} size={68} /></span>{/if}
			<h3>{T.spEmptyH}</h3>
			<p>{T.spEmpty}</p>
			{#if open && data.used < data.special.picksPerPerson}
				<button
					class="tap go spempty-go"
					onclick={() => {
						nomSheet.from = null;
						nomSheet.open = true;
					}}
				>
					<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"
						><path d="M6 1.5v9M1.5 6h9" /></svg
					>
					{T.spEmptyCta}
				</button>
			{/if}
		</div>
	{/each}
</div>

{#if peek}
	<FacePeek {peek} lang={data.lang} onclose={unpeek} />
{/if}

<!-- ------------------------------------------------------------- modal -- -->

<NominateModal
	lang={data.lang}
	heading={T.spNomH(name)}
	hint={T.spNomHint(data.special.picksPerPerson)}
	{known}
	{submit}
	rules={weekRules.map((rule) => T.weekRule(rule))}
	breaks={(result) => !!knownBreach(data.special.custom, result)}
	typed={!weekRules.length}
/>

{#if detail}
	<!-- one film, opened from its poster: what it is, who put it up and why, and
	     who has seen it. Nothing about how many want it: that stays hidden here -->
	<button
		class="spveil"
		aria-label={T.close}
		onclick={closeDetail}
		in:fade={{ duration: ms(180) }}
		out:fade={{ duration: ms(140) }}
	></button>
	<!-- stays where Svelte expects it, while the modal moves above the look -->
	<div class="phost">
	<div
		class="spmodal spdetail"
		role="dialog"
		aria-modal="true"
		use:portal
		use:fitViewport
		aria-label={detail.title}
		in:grow
		out:grow={{ out: true }}
	>
		<!-- the way out has a row of its own, so it never sits on a panel -->
		<div class="spxrow">
			<button class="spx" type="button" aria-label={T.close} onclick={closeDetail}>
				<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" /></svg>
			</button>
		</div>
		<div class="dblock dtop" in:rise={0}>
			<div class="dhero">
				<div class="p"><Poster title={detail.title} url={detail.poster_url} /></div>
				<div class="dh">
					<h2>{detail.title}</h2>
					<div class="yr">{[detail.year, detail.director].filter(Boolean).join(' · ')}</div>
				</div>
			</div>
			<div class="dmeta">
				{#if detail.genre}<span class="mchip">{detail.genre}</span>{/if}
				{#if detail.runtime}<span class="mchip">{T.minutes(detail.runtime)}</span>{/if}
				<span class="bk face">
					<Avatar
						name={detail.nominator.name}
						colour={detail.nominator.colour}
						avatar={detail.nominator.avatar}
						size={16}
						font={8}
						titled={false}
					/>
					<b>{detail.nominator.name}</b>
				</span>
			</div>
		</div>
		{#if noteEdit && mine}
			<form class="dblock" method="POST" action="?/setNote" use:enhance={submit(() => (noteEdit = false))}>
				<input type="hidden" name="filmId" value={detail.id} />
				<textarea class="nin" name="note" rows="3" maxlength="160" placeholder={T.notePh} value={detail.note ?? ''}></textarea>
				<div class="cbtns">
					<button type="button" onclick={() => (noteEdit = false)}>{T.noteCancel}</button>
					<button class="go">{T.noteSave}</button>
				</div>
			</form>
		{:else if detail.note || mine}
			<div class="dblock pitch" in:rise={1}>
				{#if detail.note}
					<div class="dnote">“{detail.note}”</div>
				{/if}
				{#if mine}
					<button class="nedit" onclick={() => (noteEdit = true)}>{detail.note ? T.noteEdit : T.noteAdd}</button>
				{/if}
			</div>
		{/if}
		{#if detail.overview}
			<div class="dblock" in:rise={2}><p class="over">{detail.overview}</p></div>
		{/if}
		<div class="dblock" in:rise={3}>
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
							<span class="bk face">
								<Avatar name={face.name} colour={face.colour} avatar={face.avatar} size={16} font={8} titled={false} />
								<b>{face.name}</b>
							</span>
						{/each}
					</div>
				{/if}
			</div>
		</div>
		<div class="dblock" in:rise={4}>
			<CommentThread film={detail} lang={data.lang} {submit} admin={data.person?.isAdmin} />
		</div>
	</div>
	</div>
{/if}

<svelte:window
	onkeydown={(event) => {
		if (event.key !== 'Escape') return;
		nomSheet.open = false;
		closeDetail();
	}}
/>

<style>
	/* §3.7: the week's own description and rules */
	.spweek p,
	.spweek ul {
		margin: 0;
	}
	.spweek p + ul {
		margin-top: 6px;
	}
	.spweek ul {
		padding-left: 18px;
	}

	/* who is in on it: faces overlapping in a chip, the count, and your picks */
	.spturn {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 10px 2px 0;
	}
	.tchip {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 5px 11px 5px 6px;
		background: var(--raise);
		border-radius: 99px;
		font-size: 12px;
		color: var(--dim);
	}
	.tchip:last-child {
		padding-left: 11px;
	}
	.tfaces {
		display: inline-flex;
	}
	.tface {
		display: inline-flex;
		justify-content: center;
		width: 18px;
		margin-right: -5px;
		border-radius: 50%;
		box-shadow: 0 0 0 2px var(--raise);
	}
	.tmore {
		margin-left: 9px;
		font-weight: 650;
		color: var(--ink2);
	}
	.twords {
		margin-left: 5px;
	}
	.twords b {
		color: var(--ink);
	}
	.tcount {
		display: inline-block;
	}
	/* a pick says what it is in up to three lines: there is no sheet to open */
	.spnote {
		margin: 4px 0 0;
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--ink2);
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		overflow: hidden;
	}
	.spnote.blurb {
		color: var(--dim);
	}
	.ft form:last-child {
		margin-left: auto;
	}
	/* the poster and the words sit a layer above the web's resident, so it
	   crawls under the title rather than across it */
	.sppick .pw,
	.sppick .b {
		position: relative;
		z-index: 1;
	}
	/* ticked, the card is lit in the accent from inside: the viewer's own say,
	   and nobody else's, which is all a card here is allowed to show */
	.sppick.on {
		box-shadow:
			var(--lift),
			0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent),
			0 0 24px color-mix(in srgb, var(--accent) 14%, transparent);
	}
	/* the film's own modal: the list's detail blocks, stacked, with a way out */
	.spdetail { display: grid; gap: 10px; padding-top: 12px; }
	.spxrow { display: flex; justify-content: flex-end; margin-bottom: -2px; }
	.spx {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 0;
		border-radius: 50%;
		background: var(--raise);
		color: var(--ink2);
		cursor: pointer;
	}
	.spx svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
	.sppick .pw .p { border: 0; padding: 0; cursor: pointer; }
	/* 16px is the size below which iPhone Safari zooms the page in on focus,
	   which threw the whole modal off the screen mid-search */
	.spdetail .nin { width: 100%; }
	/* the empty round: a lantern in its own pool of light, a web in the corner */
	.spempty {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 30px 20px 26px;
		border-radius: var(--r);
		background:
			radial-gradient(
				150px 95px at 50% 66px,
				color-mix(in srgb, var(--accent) 20%, transparent),
				transparent
			),
			var(--web, none) no-repeat right top / 64px 64px,
			var(--card);
		box-shadow: var(--lift);
	}
	.spempty-lamp {
		display: inline-flex;
		animation: lantern 3.6s ease-in-out infinite;
	}
	@keyframes lantern {
		0%,
		100% {
			transform: translateY(0) rotate(-2deg);
		}
		50% {
			transform: translateY(-5px) rotate(2deg);
		}
	}
	.spempty h3 {
		margin: 14px 0 4px;
		font-size: 18px;
		letter-spacing: -0.01em;
	}
	.spempty p {
		margin: 0;
		color: var(--dim);
		font-size: 13.5px;
	}
	.spempty-go {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		margin-top: 18px;
		padding: 10px 18px;
		font-size: 13px;
		background: var(--accent);
		color: var(--accent-ink);
	}
	.spempty-go svg {
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
	}
	@media (prefers-reduced-motion: reduce) {
		.spempty-lamp {
			animation: none;
		}
	}
</style>
