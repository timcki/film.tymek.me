<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate, invalidateAll } from '$app/navigation';
	import { pollRoom } from '$lib/room-poll';
	import { fly, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import type { SubmitFunction } from '@sveltejs/kit';
	import RankingBallot from '$lib/components/RankingBallot.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import LookBurst from '$lib/components/LookBurst.svelte';
	import Snowman from '$lib/components/Snowman.svelte';
	import Poster from '$lib/components/Poster.svelte';
	import SeenCount from '$lib/components/SeenCount.svelte';
	import { dictFor } from '$lib/i18n';
	import { say } from '$lib/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const T = $derived(dictFor(data.lang));
	const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const ms = (n: number) => (still ? 0 : n);

	// pick a name once, then keep the draft local while turnout updates
	let who = $state('');
	let filter = $state('');
	const needsName = $derived(!data.identified && !who);
	const shown = $derived(
		data.people.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()))
	);

	// the decision is the only thing on this screen that cannot be taken back, so
	// it is the only thing that gets confetti, and only on a phone that watched it
	// land: arriving at a room already decided is news, not a celebration
	let wasOpen = false;
	let burst = $state(false);
	$effect(() => {
		if (!data.decided || data.pending) wasOpen = true;
		else if (wasOpen) {
			wasOpen = false;
			burst = true;
		}
	});

	const submit =
		(): SubmitFunction =>
		() =>
		async ({ result, update }) => {
			if (result.type === 'failure') {
				const body = result.data as
					| { code?: string; params?: Record<string, string | number>; message?: string }
					| undefined;
				say(T.error(body?.code ?? '', body?.params ?? {}, body?.message ?? ''), true);
			}
			await update({ reset: false });
		};

	// only turnout is live; results arrive after close, and after the count on
	// the projector has run
	$effect(() => {
		if (data.decided && !data.pending) return;
		let caught = data.decided;
		return pollRoom(async () => {
			await invalidate('app:room');
			// the next week's navigation must catch up before the phone leaves the room
			if (data.decided && !caught) {
				caught = true;
				await invalidateAll();
			}
		});
	});
</script>

<!-- the same bar the rest of the app wears: your face, then the code for anyone
     typing it in by hand, and the register on the right once you are on it. The
     page is reachable without an account, so the face may simply not be there -->
<header class="lean">
	<div class="hrow">
		{#if data.me}
			<Avatar
				name={data.me.name}
				colour={data.me.colour}
				avatar={data.me.avatar}
				size={30}
				font={12}
				xp={data.me.xp}
			/>
		{/if}
		<div class="wk">
			<div class="roomcode"><span>{T.roomCode}</span><b>{data.code}</b></div>
		</div>
		{#if data.checkedIn || (who && who !== 'guest')}
			<span class="okchip">{T.roomCheckedIn}</span>
		{/if}
	</div>
</header>

{#if data.decided && data.pending}
	<!-- §7.2: the vote is over and the screen has the result; the phone says so
	     and nothing more until the count there has run -->
	<div class="lookup" aria-live="polite">
		{#if data.look === 'halloween'}
			<!-- §3.6: a ghost keeping watch with the room, its eyes on the screen -->
			<div class="spook" aria-hidden="true">
				<svg viewBox="0 0 30 36" width="58" height="70">
					<path
						class="spook-sheet"
						d="M15 1C7.3 1 3 6.8 3 14v18.5c1.6 1.8 3.4 1.8 5 0 1.6 1.8 3.4 1.8 5 0 1.4 1.8 2.6 1.8 4 0 1.6 1.8 3.4 1.8 5 0 1.6 1.8 3.4 1.8 5 0V14C27 6.8 22.7 1 15 1z"
					/>
					<g class="spook-look">
						<ellipse class="spook-hole" cx="10.6" cy="13.6" rx="2.1" ry="3" />
						<ellipse class="spook-hole" cx="19.4" cy="13.6" rx="2.1" ry="3" />
						<ellipse class="spook-glint" cx="11.2" cy="12.6" rx="0.6" ry="0.8" />
						<ellipse class="spook-glint" cx="20" cy="12.6" rx="0.6" ry="0.8" />
					</g>
					<ellipse class="spook-hole" cx="15" cy="21.8" rx="1.8" ry="2.4" />
				</svg>
				<span class="spook-shade"></span>
			</div>
		{:else if data.look === 'swieta'}
			<!-- §3.6: a snowman keeping watch with the room, its eyes on the screen -->
			<div class="snowwatch" aria-hidden="true"><Snowman size={50} up /></div>
		{:else if data.look === 'prl'}
			<!-- §3.6: the eye off a film poster, cut from paper, watching the screen -->
			<div class="painted" aria-hidden="true">
				<svg viewBox="0 0 60 40" width="84" height="56">
					<circle class="painted-sun" cx="34" cy="22" r="17" />
					<clipPath id="painted-eye"><path d="M4 20Q30-2 56 20 30 42 4 20z" /></clipPath>
					<path class="painted-white" d="M4 20Q30-2 56 20 30 42 4 20z" />
					<g clip-path="url(#painted-eye)">
						<g class="painted-look">
							<circle class="painted-iris" cx="30" cy="20" r="8.4" />
							<circle cx="30" cy="20" r="3.8" fill="#1d1a16" />
							<circle cx="28" cy="18" r="1.3" fill="#e6e0cf" />
						</g>
					</g>
					<path class="painted-lid" d="M4 20Q30-2 56 20" />
					<path class="painted-lash" d="M12 13.4 9 8.6M20 9 18.4 3.6M30 7.4V1.6M40 9l1.6-5.4M48 13.4 51 8.6" />
				</svg>
			</div>
		{:else}
			<div class="eyes" aria-hidden="true">👀</div>
		{/if}
		<b>{T.roomLookUp}</b>
		<p>{T.roomLookUpSub}</p>
		<div class="lookfilms">
			{#each data.tally as row (row.film.id)}
				<div class="th"><Poster title={row.film.title} url={row.film.poster_url} /></div>
			{/each}
		</div>
	</div>
{:else if data.decided}
	{@const won = data.tally.find((row) => row.film.id === data.winnerFilmId)}
	{#if won}
		<!-- §7.3: the night, decided: only the film it is, said big, arriving the
		     way it does on the projector, the poster first and its words after -->
		<section class="tonight">
			<div class="tsec" in:fly|global={{ y: 8, duration: ms(360) }}>{T.hostWinnerH}</div>
			<div class="tposter" in:scale|global={{ start: 0.86, delay: ms(120), duration: ms(560), easing: backOut }}>
				<Poster title={won.film.title} url={won.film.poster_url} />
			</div>
			<h1 in:fly|global={{ y: 12, delay: ms(340), duration: ms(420) }}>{won.film.title}</h1>
			<div class="tmeta" in:fly|global={{ y: 10, delay: ms(420), duration: ms(380) }}>
				{#if won.film.year}<span>{won.film.year}</span>{/if}
				{#if won.film.runtime}<span>{T.minutes(won.film.runtime)}</span>{/if}
				<span><SeenCount n={data.seen[won.film.id] ?? 0} size={12} /></span>
			</div>
			{#if won.film.overview}
				<p class="tover" in:fly|global={{ y: 10, delay: ms(500), duration: ms(400) }}>{won.film.overview}</p>
			{/if}
		</section>
	{/if}
{:else if needsName}
	<div class="sec">{T.roomWho}</div>
	<input class="sinput" placeholder={T.roomFilter} bind:value={filter} autocomplete="off" />
	<div class="namegrid">
		{#each shown as person (person.id)}
			<!-- picking a name is the check-in; display:contents keeps the grid intact -->
			<form method="POST" action="?/checkIn" style="display:contents" use:enhance={submit()}>
				<input type="hidden" name="personId" value={person.id} />
				<button class="namebtn" onclick={() => (who = person.id)}>{person.name}</button>
			</form>
		{/each}
	</div>
	<p class="hintline">{T.roomGuestNote}</p>
	<button class="ghostbtn" onclick={() => (who = 'guest')}>{T.roomGuest}</button>
{:else}
	<!-- with a face in the bar there is nobody to name; a guest still wants to know -->
	{#if !data.me}
		<p class="hintline">
			{T.roomVotingAs(data.people.find((p) => p.id === who)?.name ?? T.roomAsGuest)}
		</p>
	{/if}
	<div class="roomstate">
		<span class="turnchip"><b>{data.turnout}</b> {T.turnoutWord(data.turnout)}</span>
	</div>
	<!-- §7.3: how the room counts, said before anyone ranks anything -->
	<p class="pointsnote">
		<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 14h13M2.5 14V9.5H6V14M6 14V5h4v9M10 14V8h3.5v6" /></svg>
		<span>{T.roomPoints(data.tally.length)}</span>
	</p>
	{#key `${data.code}:${data.me?.id ?? who}`}
		<RankingBallot films={data.tally.map((r) => r.film)} seen={data.seen} lang={data.lang}
			savedRanking={data.identified || who === 'guest' ? data.myRanking : undefined}
			personId={who === 'guest' ? '' : who} withdraw="?/withdraw" look={data.look} />
	{/key}
{/if}

{#if burst}
	<LookBurst look={data.look} onDone={() => (burst = false)} />
{/if}

<style>
	.hrow { flex-wrap: wrap; }
	.wk { min-width: max-content; }
	.tonight {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		margin-top: 18px;
		padding: 24px 22px 26px;
		border-radius: var(--r);
		background: var(--card);
		box-shadow: var(--lift);
	}
	.tsec { color: var(--accent); font-size: 14px; font-weight: 700; letter-spacing: 0.02em; }
	.tposter {
		width: min(62vw, 240px);
		aspect-ratio: 2/3;
		margin-top: 16px;
		border-radius: 14px;
		overflow: hidden;
		background: var(--raise);
		box-shadow: 0 0 0 3px var(--accent), 0 0 48px -8px var(--accent), 0 26px 50px -20px var(--shadow);
	}
	.tposter :global(img) { display: block; width: 100%; height: 100%; object-fit: cover; }
	.tonight h1 { margin: 22px 0 0; font-size: 30px; line-height: 1.1; letter-spacing: -0.02em; overflow-wrap: anywhere; }
	.tmeta { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 12px; }
	.tmeta span {
		display: inline-flex;
		align-items: center;
		padding: 4px 10px;
		border-radius: 99px;
		background: var(--raise);
		color: var(--ink2);
		font-size: 12.5px;
		font-variant-numeric: tabular-nums;
	}
	.tover { margin: 16px 0 0; color: var(--ink2); font-size: 14.5px; line-height: 1.6; text-align: left; }
	.lookup {
		margin-top: 18px;
		padding: 34px 20px 26px;
		border-radius: var(--r);
		background: var(--card);
		box-shadow: var(--lift);
		text-align: center;
	}
	.eyes { font-size: 44px; line-height: 1; animation: glance 2.4s ease-in-out infinite; }
	.lookup b { display: block; margin-top: 14px; font-size: 21px; }
	.lookup p { margin: 8px 0 0; color: var(--dim); font-size: 13.5px; line-height: 1.5; }
	.lookfilms { display: flex; justify-content: center; gap: 10px; margin-top: 22px; }
	.lookfilms .th { width: 58px; aspect-ratio: 2/3; border-radius: 8px; overflow: hidden; background: var(--raise); }
	.lookfilms .th :global(img) { display: block; width: 100%; height: 100%; object-fit: cover; }
	@keyframes glance { 0%, 100% { transform: translateX(0); } 30% { transform: translateX(-6px); } 60% { transform: translateX(6px); } }
	/* the ghost floats over its own faint shadow, and keeps glancing up at the
	   screen and round the room, the way the eyes do on any other night */
	.snowwatch { display: flex; justify-content: center; }
	.painted { display: flex; justify-content: center; }
	.painted svg { display: block; overflow: visible; }
	.painted-sun { fill: #a8392e; opacity: 0.9; }
	.painted-white { fill: #e6e0cf; stroke: #1d1a16; stroke-width: 1.6; }
	.painted-iris { fill: #41686a; }
	.painted-lid { fill: none; stroke: #1d1a16; stroke-width: 2.6; stroke-linecap: round; }
	.painted-lash { stroke: #1d1a16; stroke-width: 1.8; stroke-linecap: round; }
	.painted-look { animation: watch 3.2s ease-in-out infinite; }
	@keyframes watch { 0%, 100% { transform: translateX(0); } 30% { transform: translateX(-7px); } 60% { transform: translateX(7px); } }
	.spook { display: flex; flex-direction: column; align-items: center; }
	.spook svg { display: block; overflow: visible; animation: hover 3.4s ease-in-out infinite; }
	.spook .spook-sheet { fill: rgba(246, 241, 252, 0.88); filter: drop-shadow(0 0 8px rgba(230, 220, 255, 0.5)); }
	:global(:root[data-theme='light']) .spook .spook-sheet {
		fill: #fff;
		filter: drop-shadow(0 3px 7px rgba(90, 50, 80, 0.22));
	}
	.spook .spook-hole { fill: #160e1c; }
	.spook .spook-glint { fill: rgba(255, 255, 255, 0.75); }
	.spook .spook-look { animation: lookabout 4.8s ease-in-out infinite; }
	.spook .spook-shade {
		width: 40px;
		height: 7px;
		margin-top: 6px;
		border-radius: 50%;
		background: radial-gradient(closest-side, color-mix(in srgb, var(--ink) 22%, transparent), transparent);
		animation: shade 3.4s ease-in-out infinite;
	}
	@keyframes hover {
		0%, 100% { transform: translateY(0) rotate(-3deg); }
		50% { transform: translateY(-8px) rotate(3deg); }
	}
	@keyframes shade {
		0%, 100% { transform: scale(1); opacity: 1; }
		50% { transform: scale(0.8); opacity: 0.6; }
	}
	@keyframes lookabout {
		0%, 14%, 100% { transform: translate(0, -1.6px); }
		24%, 40% { transform: translate(-2px, -1.2px); }
		50%, 64% { transform: translate(2px, -1.2px); }
		74%, 88% { transform: translate(0, -2.2px); }
	}
	@media (prefers-reduced-motion: reduce) { .eyes, .spook svg, .spook .spook-look, .spook .spook-shade, .painted-look { animation: none; } }
	.roomstate { display: flex; justify-content: center; margin-top: 6px; }
	.turnchip {
		padding: 6px 14px;
		border-radius: 99px;
		background: color-mix(in srgb, var(--accent) 16%, transparent);
		color: var(--accent);
		font-size: 13px;
		font-weight: 650;
	}
	.turnchip b { font-weight: 800; font-variant-numeric: tabular-nums; }
	.pointsnote {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		margin: 14px 0 0;
		padding: 11px 14px;
		border-radius: 14px;
		background: color-mix(in srgb, var(--sunk) 70%, transparent);
		color: var(--dim);
		font-size: 12.5px;
		line-height: 1.5;
	}
	.pointsnote svg {
		flex: none;
		width: 16px;
		height: 16px;
		margin-top: 1px;
		fill: none;
		stroke: var(--accent);
		stroke-width: 1.5;
		stroke-linecap: round;
	}
</style>
