<script lang="ts">
	import '../app.css';
	import '../themes.css';
	import { page } from '$app/state';
	import { scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import Avatar from '$lib/components/Avatar.svelte';
	import { formatNight } from '$lib/datetime';
	import { dictFor, isVotes, LANGS } from '$lib/i18n';
	import {
		ACCENTS,
		ACCENT_SWATCH,
		BANANA_BG,
		LOOK_BG,
		THEME_BG,
		THEMES,
		type Accent,
		type Theme
	} from '$lib/themes';
	import { enhance } from '$app/forms';
	import { flushSync } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Banana from '$lib/components/Banana.svelte';
	import Ticket from '$lib/components/Ticket.svelte';
	import LookToken from '$lib/components/LookToken.svelte';
	import Scenery from '$lib/components/Scenery.svelte';
	import Cinema from '$lib/components/Cinema.svelte';
	import { specialOf } from '$lib/specials';
	import { customOf } from '$lib/custom-weeks';
	import { nomSheet } from '$lib/special-sheet.svelte';
	import { inFlight } from '$lib/points-in-flight.svelte';
	import { picked } from '$lib/look-picked.svelte';
	import { toast } from '$lib/toast.svelte';
	import type { LayoutServerData } from './$types';

	let { data, children }: { data: LayoutServerData; children: import('svelte').Snippet } = $props();

	const T = $derived(dictFor(data.lang));
	const path = $derived(page.url.pathname);
	// the room vote and the back office are each their own world: no tabs, no
	// budget, and in the room's case possibly no account
	const bare = $derived(path.startsWith('/f/') || path.startsWith('/admin'));

	// the header's countdown; a bare page has no header to count down in
	let now = $state(Date.now());
	$effect(() => {
		if (bare) return;
		now = Date.now();
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});

	const countdown = $derived.by(() => {
		if (!data.week) return '';
		const left = new Date(data.week.closesAt).getTime() - now;
		if (left <= 0) return null;
		return T.timeLeft(
			Math.floor(left / 86400000),
			Math.floor(left / 3600000) % 24,
			Math.floor(left / 60000) % 60,
			Math.floor(left / 1000) % 60
		);
	});
	const title = $derived.by(() => {
		if (path.startsWith('/history')) return T.watchedH;
		if (path.startsWith('/stats')) return T.statsH;
		if (path.startsWith('/me')) return (data.person?.name ?? T.tabYou).split(' ')[0];
		if (path.startsWith('/host')) return T.hostH;
		return T.appTitle;
	});

	const showPill = $derived(Boolean(data.person) && (path === '/' || path.startsWith('/me')));
	// §3.6: the special round's page stands where the list does while the list sleeps
	const listPath = $derived(data.week?.special ? '/special' : '/');
	const home = $derived(path === '/' || path === '/special');
	// §3.6: the special round's name and rules ride in the bar, where the points
	// pill would be: a special round spends no points, so the slot is free
	const special = $derived.by(() => {
		const base = path === '/special' ? specialOf(data.week?.special) : null;
		if (!base) return null;
		// §3.7: a custom week brings its own name, pick count and rules
		const custom = customOf(data.week?.custom);
		return { ...base, picksPerPerson: custom?.picks ?? base.picksPerPerson, custom };
	});
	const spName = $derived(special ? (special.custom?.name ?? T.spName(special.id)) : '');
	let rulesOpen = $state(false);
	// until somebody has read the rules once, the chip says it can be opened:
	// a dot and a slow ring, put away for good the first time it is tapped
	const RULES_SEEN = 'fn_rules_seen';
	let rulesSeen = $state(true);
	$effect(() => {
		if (!special) return;
		try {
			rulesSeen = localStorage.getItem(`${RULES_SEEN}_${special.id}`) === '1';
		} catch {
			rulesSeen = true;
		}
	});
	function openRules() {
		rulesOpen = !rulesOpen;
		if (rulesSeen || !special) return;
		rulesSeen = true;
		try {
			localStorage.setItem(`${RULES_SEEN}_${special.id}`, '1');
		} catch {
			// private mode: it nags again next visit, which is the lesser harm
		}
	}
	// closing the announcement closes that one; a new text comes back up
	const NOTICE_CLOSED = 'fn_notice_closed';
	let noticeClosed = $state(true);
	$effect(() => {
		if (!data.notice) return;
		try {
			noticeClosed = localStorage.getItem(NOTICE_CLOSED) === data.notice;
		} catch {
			noticeClosed = false;
		}
	});
	function closeNotice() {
		noticeClosed = true;
		try {
			localStorage.setItem(NOTICE_CLOSED, data.notice ?? '');
		} catch {
			// private mode: it is back next visit, which is the lesser harm
		}
	}
	// picks the viewer still has, read off the round's own page data
	const picksLeft = $derived(
		special ? Math.max(0, special.picksPerPerson - Number(page.data.used ?? 0)) : 0
	);
	// the list's +: on the list itself, while the week is open to nominations
	const addable = $derived(
		path === '/' && Boolean(data.person) && data.week?.status === 'open' && !data.week.special
	);
	// this week's own film, read off the list's page data
	const nominatedTitle = $derived(
		(page.data.nominatedThisWeek as { title: string } | null | undefined)?.title ?? null
	);
	// the + greys once there is nothing left to add, and a tap on it says what
	// was: the title of a button means nothing on a phone
	const addedSays = $derived(
		special
			? picksLeft === 0
				? T.spAddDone((page.data.mine as string[] | undefined) ?? [])
				: null
			: nominatedTitle
				? T.nomDone(nominatedTitle)
				: null
	);
	let addedOpen = $state(false);
	function addClick(event: MouseEvent & { currentTarget: HTMLElement }) {
		if (addedSays && !nomSheet.open) {
			addedOpen = !addedOpen;
			return;
		}
		if (special) {
			const rect = event.currentTarget.getBoundingClientRect();
			nomSheet.from = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
		} else {
			nomSheet.from = null;
		}
		nomSheet.open = !nomSheet.open;
	}

	// every page gets the compact bar, so the app has one header rather than two.
	// The list has no name worth printing, so the night takes that slot, because
	// the date is the thing anybody acts on; the others put their name there. The
	// round's number is nobody's reason for opening this, so it waits in the tip
	const lean = $derived(!bare && Boolean(data.week));
	const leanLabel = $derived(
		home && data.week ? formatNight(data.week.closesAt, data.lang) : title
	);

	// how much of the round is spent
	const burnt = $derived.by(() => {
		if (!data.week) return 0;
		const opens = new Date(data.week.opensAt).getTime();
		const closes = new Date(data.week.closesAt).getTime();
		if (!(closes > opens)) return 100;
		return Math.min(100, Math.max(0, ((now - opens) / (closes - opens)) * 100));
	});
	// the last day, where the chip stops being furniture and starts being a warning
	const urgent = $derived(
		Boolean(data.week) && new Date(data.week!.closesAt).getTime() - now < 86400000
	);
	// how far through the round, as one of the ramp's colours rather than a
	// gradient. The last day is red whatever the fraction says, because a short
	// round can reach its final hours while the bar still reads two thirds spent
	const heat = $derived(
		urgent
			? 'var(--burn3)'
			: burnt < 55
				? 'var(--burn0)'
				: burnt < 78
					? 'var(--burn1)'
					: 'var(--burn2)'
	);

	// which of the demo's three people the bar is offering; only ever rendered
	// when the server said this is the demo, so the real app never sees it
	const personaLabel = (kind: 'member' | 'admin' | 'fresh') =>
		kind === 'admin' ? T.demoAdmin : kind === 'fresh' ? T.demoFresh : T.demoMember;

	let tipOpen = $state(false);
	// the bar answers a tap on a card's + at once, before the server does
	const spentNow = $derived(
		Math.min(
			(data.person?.spent ?? 0) + (data.person?.left ?? 0),
			inFlight.spent ?? data.person?.spent ?? 0
		)
	);
	const leftNow = $derived(
		Math.max(0, (data.person?.spent ?? 0) + (data.person?.left ?? 0) - spentNow)
	);
	// once the page says what the bar was already showing, the guess has done
	// its job and goes, without the bar moving
	$effect(() => {
		if (inFlight.spent !== null && data.person?.spent === inFlight.spent) inFlight.spent = null;
	});
	// a point spent on a card leaves the bar with a pop, and comes back with one
	const pipPop = {
		duration:
			typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
				? 0
				: 340,
		start: 0.2,
		easing: backOut
	};
	let weekTip = $state(false);
	let menuOpen = $state(false);
	// the menu folds back up before it goes: shut a beat after asking, so the
	// way out can play. Opening is the details element's own, animated in CSS
	let menuClosing = $state(false);
	function closeMenu() {
		if (!menuOpen || menuClosing) return;
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			menuOpen = false;
			return;
		}
		menuClosing = true;
		setTimeout(() => {
			menuOpen = false;
			menuClosing = false;
		}, 150);
	}

	// a menu that survived navigation would hang over the page you just opened
	$effect(() => {
		path;
		menuOpen = false;
	});

	// §3.6: the special look is put on <html> by the server, which only a full
	// load goes through. A round that starts or ends while a page is open (an
	// admin switching it on and walking over to the list, say) arrives as page
	// data instead, so the attribute follows the data here, or the bats and the
	// lights would turn up without the palette they are drawn for
	$effect(() => {
		const root = document.documentElement;
		if (data.look) root.dataset.special = data.look;
		else delete root.dataset.special;
	});

	// the palette, the bananas and the accent, as picked on this page or as the
	// server said when it loaded. A pick shows at once and is only then sent to
	// be kept, so the page never reloads to change colour
	const theme = $derived(picked.theme ?? data.theme);
	const banana = $derived(picked.banana ?? data.banana);
	const accent = $derived(picked.accent ?? data.accent);

	// what hooks.server.ts dresses <html> in on a full load, kept true after
	// it: the palette (auto resolved, and followed, since the phone can change
	// its mind while the page is open), the bananas, and the two meta tags the
	// browser reads its own chrome off
	$effect(() => {
		const root = document.documentElement;
		const query = matchMedia('(prefers-color-scheme: light)');
		const apply = () =>
			(root.dataset.theme = theme === 'auto' ? (query.matches ? 'light' : 'dark') : theme);
		apply();
		root.toggleAttribute('data-banana', banana);
		if (accent === 'rose') delete root.dataset.accent;
		else root.dataset.accent = accent;
		document
			.querySelector('meta[name="color-scheme"]')
			?.setAttribute('content', theme === 'auto' ? 'light dark' : theme);
		const bg = data.look ? LOOK_BG[data.look] : banana ? BANANA_BG : THEME_BG;
		const old = document.querySelectorAll('meta[name="theme-color"]');
		const tint = (content: string, media?: 'dark' | 'light') => {
			const meta = document.createElement('meta');
			meta.name = 'theme-color';
			meta.content = content;
			if (media) meta.media = `(prefers-color-scheme: ${media})`;
			return meta;
		};
		const tints =
			theme === 'auto' ? [tint(bg.dark, 'dark'), tint(bg.light, 'light')] : [tint(bg[theme])];
		if (old[0]) old[0].before(...tints);
		else document.head.append(...tints);
		old.forEach((m) => m.remove());
		if (theme !== 'auto') return;
		query.addEventListener('change', apply);
		return () => query.removeEventListener('change', apply);
	});

	// the switch itself: the new look fades in over the old one (a view
	// transition, where there is one, and a plain swap where there is not or
	// motion is unwanted), and the cookie is set behind it. The forms still
	// post and redirect without scripting, as they always did
	const pick =
		(next: { theme?: Theme; banana?: boolean; accent?: Accent }): SubmitFunction =>
		() => {
			const before = { ...picked };
			const swap = () => {
				Object.assign(picked, next);
				flushSync();
			};
			// a palette or bananas repaint the whole page, so the old page fades
			// into the new one. An accent alone is a few buttons and rings: it
			// blends there in place (the registered --accent in app.css), and is
			// kept out of the page-wide fade, which iOS plays as a flash and a
			// jump down a long, scrolled list
			// On a phone there is no page-wide fade at all (it flashes there too):
			// for a moment every colour on the page eases over in place instead
			const whole = next.theme !== undefined || (next.banana ?? banana) !== banana;
			const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
			const mouse = matchMedia('(hover: hover) and (pointer: fine)').matches;
			if (whole && !still && mouse && document.startViewTransition)
				document.startViewTransition(swap);
			else if (whole && !still) {
				const root = document.documentElement;
				root.classList.add('look-easing');
				swap();
				setTimeout(() => root.classList.remove('look-easing'), 420);
			} else swap();
			// the pick is already on screen and the cookie only keeps it for the
			// next load, so nothing is fetched back: reloading the page's data
			// would redraw the list under it, which a phone shows as a flash and a
			// jump. The pick stands in for the data until then. Only if it was
			// not kept does the page go back to how it was
			return async ({ result }) => {
				if (result.type === 'error' || result.type === 'failure') {
					delete picked.theme;
					delete picked.banana;
					delete picked.accent;
					Object.assign(picked, before);
				}
			};
		};

	// toasts fade themselves out; keyed on seq so the same text twice still shows
	let visible = $state(false);
	$effect(() => {
		if (!toast.seq) return;
		visible = true;
		const timer = setTimeout(() => (visible = false), 2600);
		return () => clearTimeout(timer);
	});
</script>

<svelte:head><title>{T.appTitle}</title></svelte:head>

{#if data.demo}
	<!-- the demo says what it is before it says anything else, and it says it on
	     every page: the room screen and the back office are the two a stranger is
	     most likely to mistake for somebody's real evening -->
	<div class="demobar">
		<div class="demoin">
			<p><b>{T.demoWhat}</b> {T.demoResets}</p>
			<div class="demoas">
				<span>{T.demoAs}</span>
				{#each data.demo.offer as persona (persona.kind)}
					<a
						class="demopill"
						class:on={data.demo.who === persona.kind}
						href="/demo/as?who={persona.kind}&to={encodeURIComponent(path)}"
						>{personaLabel(persona.kind)}: {persona.name.split(' ')[0]}</a
					>
				{/each}
				{#if data.demo.home}
					<a class="demohome" href={data.demo.home}>{T.demoHome}</a>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- the face and everything behind it, shared by both headers -->
{#snippet identity()}
	{#if data.person}
		<!-- details, not a button, so the only navigation still works without JS -->
		<details class="menuwrap" class:closing={menuClosing} bind:open={menuOpen}>
			<summary
				class="iconbtn"
				aria-label={T.menu}
				onclick={(event) => {
					if (!menuOpen) return;
					event.preventDefault();
					closeMenu();
				}}
			>
				<Avatar
					name={data.person.name}
					colour={data.person.colour}
					avatar={data.person.avatar}
					size={30}
					font={12}
					xp={data.person.xp}
				/>
			</summary>

			<div class="menu">
				<a href={listPath} class:on={home}>
					<span class="ic">
						<svg
							width="17"
							height="17"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.9"
							stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg
						>
					</span>
					{T.tabList}
				</a>
				<a href="/history" class:on={path.startsWith('/history')}>
					<span class="ic">
						<svg
							width="17"
							height="17"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.9"
							stroke-linecap="round"
							stroke-linejoin="round"><path d="M20 6.5 9.5 17 4 11.5" /></svg
						>
					</span>
					{T.tabSeen}
				</a>
				<a href="/stats" class:on={path.startsWith('/stats')}>
					<span class="ic">
						<svg
							width="17"
							height="17"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.9"
							stroke-linecap="round"
							><path d="M5 20V12M12 20V5M19 20v-5" /></svg
						>
					</span>
					{T.tabStats}
				</a>
				<a href="/me" class:on={path.startsWith('/me')}>
					<span class="ic">
						<svg
							width="17"
							height="17"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.9"
							stroke-linecap="round"
							><circle cx="12" cy="8" r="3.6" /><path
								d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4"
							/></svg
						>
					</span>
					{T.tabYou}
					<!-- who this link is: the face is the button that opened the menu,
					     so the name rides here rather than a second picture of it -->
					<span class="mname">{data.person.name}</span>
				</a>
				{#if data.person.isAdmin}
					<a href="/admin" class:on={path.startsWith('/admin')}>
						<span class="ic">
							<svg
								width="17"
								height="17"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.9"
								stroke-linecap="round"
								stroke-linejoin="round"
								><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path
									d="M3 9.5h18M8 4.5v15"
								/></svg
							>
						</span>
						{T.tabAdmin}
					</a>
				{/if}
				<!-- the settings nobody touches twice a year, kept out of the bar -->
				<div class="menufoot">
					{@render langswitch()}
					<!-- §3.6: a special look is dark only and brings its own accent, so
					     there is nothing to switch -->
					{#if !data.look}
						{@render themeswitch()}
						{@render accentswitch()}
					{/if}
				</div>
			</div>
		</details>
	{/if}
{/snippet}

{#snippet langswitch()}
	<div class="lang">
		{#each LANGS as code (code)}
			<form method="POST" action="/lang?/set">
				<input type="hidden" name="lang" value={code} />
				<input type="hidden" name="to" value={path} />
				<button class:on={data.lang === code}>{code.toUpperCase()}</button>
			</form>
		{/each}
	</div>
{/snippet}

<!-- the accent: a dot of each, half its dark shade and half its light, so it
     says what it will be on either palette. Bananas are the last dot: they bring
     an accent of their own, so they are one more way to be coloured, and
     picking a colour puts them away -->
{#snippet accentswitch()}
	<div class="lang accents">
		{#each ACCENTS as name (name)}
			<form
				method="POST"
				action="/theme?/accent"
				use:enhance={pick({ accent: name, banana: false })}
			>
				<input type="hidden" name="accent" value={name} />
				<input type="hidden" name="to" value={path} />
				<button
					class:on={!banana && accent === name}
					style:--d={ACCENT_SWATCH[name].dark}
					style:--l={ACCENT_SWATCH[name].light}
					title={T.accentNames[name]}
					aria-label={T.accentNames[name]}
					aria-pressed={!banana && accent === name}
				><i></i></button>
			</form>
		{/each}
		<form
			method="POST"
			action="/theme?/banana"
			class="nana"
			use:enhance={(input) => pick({ banana: !banana })(input)}
		>
			<input type="hidden" name="banana" value={banana ? '0' : '1'} />
			<input type="hidden" name="to" value={path} />
			<button
				class:on={banana}
				title={T.themeBanana}
				aria-label={T.themeBanana}
				aria-pressed={banana}><Banana /></button
			>
		</form>
	</div>
{/snippet}

{#snippet themeswitch()}
	<div class="lang themes">
		{#each THEMES as name (name)}
			{@const label =
				name === 'auto' ? T.themeAuto : name === 'dark' ? T.themeDark : T.themeLight}
			<form method="POST" action="/theme?/set" use:enhance={pick({ theme: name })}>
				<input type="hidden" name="theme" value={name} />
				<input type="hidden" name="to" value={path} />
				<button class:on={theme === name} title={label} aria-label={label}>
					<svg
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.9"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						{#if name === 'auto'}
							<!-- half the dial filled: the phone decides which half -->
							<circle cx="12" cy="12" r="9" />
							<path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
						{:else if name === 'dark'}
							<path d="M20 13.4A8.4 8.4 0 0 1 10.6 4 8.4 8.4 0 1 0 20 13.4z" />
						{:else}
							<circle cx="12" cy="12" r="4.2" />
							<path
								d="M12 2.6v2M12 19.4v2M4.4 4.4l1.5 1.5M18.1 18.1l1.5 1.5M2.6 12h2M19.4 12h2M4.4 19.6l1.5-1.5M18.1 5.9l1.5-1.5"
							/>
						{/if}
					</svg>
				</button>
			</form>
		{/each}
	</div>
{/snippet}

{#snippet budget()}
	{#if showPill && data.person}
		<div class="budget">
			<!-- the same grammar as the cards: a check is spent, a dashed dot is
			     still yours. The words live in the tip -->
			<button
				class="pill"
				aria-expanded={tipOpen}
				aria-label={T.budgetPill(data.person.left, data.person.budget, isVotes(data.rules))}
				onclick={() => (tipOpen = !tipOpen)}
				onblur={() => (tipOpen = false)}
			>
				<!-- the points are things you hold: a banana each with bananas on, a
				     cinema ticket each without, and a faint ghost of one where a
				     point has been spent, so the week starts full and ends on ghosts -->
				{#each Array(Math.max(0, spentNow)) as _, i (i)}
					<span class="hpip spent ghost" in:scale={pipPop}
						>{#if banana}<Banana />{:else}<Ticket />{/if}</span
					>
				{/each}
				{#each Array(Math.max(0, leftNow)) as _, i (i)}
					<span class="hpip free held" in:scale={pipPop}
						>{#if banana}<Banana />{:else}<Ticket />{/if}</span
					>
				{/each}
			</button>
			<div class="tip" style:display={tipOpen ? 'block' : 'none'}>
				<b>{T.budgetPill(data.person.left, data.person.budget, isVotes(data.rules))}</b>
				· {T.budgetHelp(data.rules)}
			</div>
		</div>
	{/if}
{/snippet}

{#snippet addGlyph()}
	<!-- said in a word, "+ Film", so it is never taken for the cards' round +,
	     which gives a point. Open, it is the modal's × -->
	{#if nomSheet.open}
		<svg class="addx" viewBox="0 0 12 12" width="13" height="13" aria-hidden="true"
			><path d="M2.8 2.8l6.4 6.4M9.2 2.8l-6.4 6.4" /></svg
		>
	{:else}
		<svg class="addplus" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"
			><path d="M6 1.8v8.4M1.8 6h8.4" /></svg
		><span class="addword">{special ? '' : T.btnAddFilm}</span>
	{/if}
{/snippet}

{#snippet addButton()}
	{@const label = nomSheet.open
		? T.close
		: (addedSays ?? (special ? T.spAddAria(picksLeft) : T.nomH))}
	<div class="addwrap">
		<button
			class="pill spadd"
			class:on={nomSheet.open}
			class:done={Boolean(addedSays) && !nomSheet.open}
			aria-disabled={Boolean(addedSays) && !nomSheet.open}
			aria-label={label}
			aria-expanded={nomSheet.open}
			onclick={addClick}
			onblur={() => (addedOpen = false)}
		>
			{@render addGlyph()}
		</button>
		{#if addedSays && !nomSheet.open}
			<div class="tip" style:display={addedOpen ? 'block' : 'none'}>{addedSays}</div>
		{/if}
	</div>
{/snippet}

{#snippet addFilm()}
	{#if addable}
		<!-- the list's own +, the one call to action in the bar, the way a special
		     round's is: it opens the sheet films are put up in, and turns into its
		     close while that is open. Once this week's film is in it stays, greyed,
		     so the bar does not jump about, and a tap on it says what was added -->
		{@render addButton()}
	{/if}
{/snippet}

{#snippet specialChip()}
	{#if special && data.week}
		<div class="budget">
			<button
				class="pill spchip"
				class:fresh={!rulesSeen}
				aria-expanded={rulesOpen}
				aria-label="{spName}: {T.youRules}"
				onclick={openRules}
				onblur={() => (rulesOpen = false)}
			>
				{#if data.look}<LookToken look={data.look} size={17} />{/if}
				<span class="splabel">{spName}</span>
				<svg class="spchev" class:up={rulesOpen} viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"
					><path d="M2 3.6 5 6.6 8 3.6" /></svg
				>
			</button>
			<div class="tip sptip" style:display={rulesOpen ? 'block' : 'none'}>
				<ol>
					{#each T.spRules(special, data.week.closesAt, data.look) as rule (rule.head)}
						<li><b>{rule.head}</b> {rule.body}</li>
					{/each}
				</ol>
				{#if data.look}
					<div class="spfoot" aria-hidden="true"><Scenery look={data.look} part="foot" /></div>
				{/if}
			</div>
		</div>
		{#if data.week.status === 'open'}
			<!-- open, the + turns into the modal's close: it stays above the dimmed
			     page, and the modal grows out of it and shrinks back into it. With
			     every pick put up it stays where it was, greyed, so the bar does
			     not jump about and its absence does not read as a fault -->
			{@render addButton()}
		{/if}
	{/if}
{/snippet}

{#if bare}
	<!-- bare: no back row for the room's phones and the admin's tables -->
	<div class="wrap bare">{@render children()}</div>
{:else}
	<!-- the host view is a projector or a laptop, never a phone; let it breathe -->
	<div class="wrap" class:wide={path.startsWith('/host')} class:home
		class:roomy={home || ['/stats', '/history', '/me'].some((p) => path.startsWith(p))}
	>
		{#if lean && data.week}
			<!-- the list wears its state, not its name: a face, the night, and how
			     long there is left to vote in, warming as that runs out. It follows
			     the page down, because the deadline is why anybody opened this -->
			<header class="lean">
				<div class="hrow">
					{@render identity()}

					<!-- when, in two lines: the night, and under it what is left of the
					     round, in the rung's colour. The rung lives on the pair, so the tip
					     it opens can wear it too. Only while voting is open: a round that
					     is over has no heat left to report -->
					<div
						class="wk"
						class:lit={data.week.status === 'open' && Boolean(countdown)}
						style="--heat:{heat}"
					>
						<button
							class="wkbtn"
							aria-expanded={weekTip}
							onclick={() => (weekTip = !weekTip)}
							onblur={() => (weekTip = false)}
						>
							<span class="wlead">{leanLabel}</span>
							<!-- the words are the countdown already, so colour is all that is
							     left to say: how much of the round has gone. A chip round it
							     was one box too many in a bar that should be quiet -->
							<span class="wsub">
								{#if data.week.status === 'open' && countdown}
									{countdown}
								{:else if data.week.status === 'runoff'}
									{T.roomPicking(data.runoffCode ?? '')}
								{:else}
									{T.votingClosed}
								{/if}
							</span>
						</button>
						<!-- the round in full, one tap away: which evening it is heading for,
						     and the night down to the hour, which is no longer always Thursday at eight -->
						<div class="tip" style:display={weekTip ? 'block' : 'none'}>
							{T.evening(data.evenings[data.week.number])} ·
							<b>{countdown ?? '—'}</b> · {formatNight(data.week.closesAt, data.lang)}
						</div>
					</div>

					<!-- what you have to spend, and the one thing to add -->
					<div class="barend">
						{#if data.week.status === 'runoff' && data.runoffCode}
							<!-- the room is picking: nothing left to spend or add, so the
							     bar's one lit thing is the way in. Not on the projector,
							     which is the room -->
							{#if !path.startsWith('/host')}
								<a class="pill roomgo" href="/f/{data.runoffCode}" title={T.openRoom}
									>{T.roomGo}
									<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"
										><path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5" /></svg
									></a
								>
							{/if}
						{:else}
							{@render budget()}
							{@render addFilm()}
							{@render specialChip()}
						{/if}
					</div>
				</div>
			</header>
		{:else}
			<header>
				<div>
					<h1>{title}</h1>
					{#if data.week}
						<div class="sub">
							{T.evening(data.evenings[data.week.number])} ·
							{#if data.week.status === 'open' && countdown}
								<b>{countdown}</b>
								<!-- the date is no longer always a Thursday, so it is worth saying -->
								· {formatNight(data.week.closesAt, data.lang)}
							{:else if data.week.status === 'runoff'}
								{T.roomPicking(data.runoffCode ?? '')}
							{:else}
								{T.votingClosed}
							{/if}
						</div>
					{/if}
				</div>

				<div class="hr">
					<div class="top">
						<!-- signed out there is no menu to hide the switch in -->
						{#if !data.person}
							{@render langswitch()}
						{/if}
						{@render identity()}
					</div>

					{@render budget()}
				</div>
			</header>
		{/if}

		{#if menuOpen}
			<!-- a tap anywhere else dismisses the menu. It lives in the page's column,
			     under the bar and its menu: §3.6's look lifts the column into a layer
			     of its own, and a backdrop outside it would cover the menu too -->
			<button class="menu-backdrop" aria-label={T.close} onclick={closeMenu}></button>
		{/if}

		{#if data.notice && !noticeClosed && !path.startsWith('/host')}
			<div class="banner notice">
				<p>{data.notice}</p>
				<button aria-label={T.close} onclick={closeNotice}>
					<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"
						><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" /></svg
					>
				</button>
			</div>
		{/if}

		{@render children()}

		{#if data.look}
			<Scenery look={data.look} part="ground" />
		{/if}
	</div>
	{#if data.look}
		<Scenery look={data.look} part="land" />
	{:else}
		<Cinema />
	{/if}

{/if}

{#if data.look}
	<Scenery look={data.look} part="sky" />
{/if}

{#if !bare && data.changelog.length}
	<!-- news shown exactly once: dismissing records the newest id server-side -->
	<div class="chlog-backdrop"></div>
	<div class="chlog" role="dialog" aria-label={T.chlogH}>
		<h2>{T.chlogH}</h2>
		{#each data.changelog as entry (entry.id)}
			<h3>{entry.title}</h3>
			<ul>
				{#each entry.body as line (line)}
					<li>{line}</li>
				{/each}
			</ul>
		{/each}
		<form method="POST" action="/changelog?/dismiss">
			<input type="hidden" name="to" value={path} />
			<button class="tap go">{T.chlogOk}</button>
		</form>
	</div>
{/if}

<svelte:window onkeydown={(event) => event.key === 'Escape' && closeMenu()} />

<div class="toast" class:on={visible} class:bad={toast.bad}>{toast.text}</div>
