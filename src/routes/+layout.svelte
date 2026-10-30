<script lang="ts">
	import '../app.css';
	import '../themes.css';
	import { page } from '$app/state';
	import { scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import Avatar from '$lib/components/Avatar.svelte';
	import { formatNight } from '$lib/datetime';
	import { dictFor, isVotes, LANGS } from '$lib/i18n';
	import { THEMES } from '$lib/themes';
	import Banana from '$lib/components/Banana.svelte';
	import Check from '$lib/components/Check.svelte';
	import Halloween from '$lib/components/Halloween.svelte';
	import Cinema from '$lib/components/Cinema.svelte';
	import Pumpkin from '$lib/components/Pumpkin.svelte';
	import Skull from '$lib/components/Skull.svelte';
	import { specialOf } from '$lib/specials';
	import { nomSheet } from '$lib/special-sheet.svelte';
	import { toast } from '$lib/toast.svelte';
	import type { LayoutServerData } from './$types';

	let { data, children }: { data: LayoutServerData; children: import('svelte').Snippet } = $props();

	const T = $derived(dictFor(data.lang));
	const path = $derived(page.url.pathname);
	// the room vote and the back office are each their own world: no tabs, no
	// budget, and in the room's case possibly no account
	const bare = $derived(path.startsWith('/f/') || path.startsWith('/admin'));

	let now = $state(Date.now());
	$effect(() => {
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
	const special = $derived(path === '/special' ? specialOf(data.week?.special) : null);
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

	// on auto the phone can change its mind while the page is open, and the
	// inline boot script has already run by then
	$effect(() => {
		if (data.theme !== 'auto') return;
		const query = matchMedia('(prefers-color-scheme: light)');
		const apply = () =>
			(document.documentElement.dataset.theme = query.matches ? 'light' : 'dark');
		apply();
		query.addEventListener('change', apply);
		return () => query.removeEventListener('change', apply);
	});

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
		<details class="menuwrap" bind:open={menuOpen}>
			<summary class="iconbtn" aria-label={T.menu}>
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
				<div class="who">
					<Avatar
						name={data.person.name}
						colour={data.person.colour}
						avatar={data.person.avatar}
						size={26}
						font={11}
						xp={data.person.xp}
					/>
					<b>{data.person.name}</b>
				</div>
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
					<!-- §3.6: a special look is dark only, so there is nothing to switch -->
					{#if !data.look}{@render themeswitch()}{/if}
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

{#snippet themeswitch()}
	<div class="lang themes">
		{#each THEMES as name (name)}
			{@const label =
				name === 'auto' ? T.themeAuto : name === 'dark' ? T.themeDark : T.themeLight}
			<form method="POST" action="/theme?/set">
				<input type="hidden" name="theme" value={name} />
				<input type="hidden" name="to" value={path} />
				<button class:on={data.theme === name} title={label} aria-label={label}>
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
	<!-- bananas lie over whichever palette is showing, so they are a toggle of
	     their own rather than a fourth way to be lit -->
	<form method="POST" action="/theme?/banana" class="lang themes nana">
		<input type="hidden" name="banana" value={data.banana ? '0' : '1'} />
		<input type="hidden" name="to" value={path} />
		<button
			class:on={data.banana}
			title={T.themeBanana}
			aria-label={T.themeBanana}
			aria-pressed={data.banana}><Banana /></button
		>
	</form>
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
				{#each Array(Math.max(0, data.person.spent)) as _, i (i)}
					<span class="hpip spent" in:scale={pipPop}
						>{#if data.banana}<Banana />{:else}<Check />{/if}</span
					>
				{/each}
				{#each Array(Math.max(0, data.person.left)) as _, i (i)}
					<!-- the ring is drawn rather than bordered, exactly as the cards
					     draw theirs: even dashes at this size -->
					<span class="hpip free" in:scale={pipPop}>
						<svg viewBox="0 0 12 12" aria-hidden="true"
							><circle cx="6" cy="6" r="5.25" pathLength="12" /></svg
						>
					</span>
				{/each}
			</button>
			<div class="tip" style:display={tipOpen ? 'block' : 'none'}>
				<b>{T.budgetPill(data.person.left, data.person.budget, isVotes(data.rules))}</b>
				· {T.budgetHelp(data.rules)}
			</div>
		</div>
	{/if}
{/snippet}

{#snippet addFilm()}
	{#if addable}
		<!-- the list's own +, the one call to action in the bar, the way a special
		     round's is: it opens the sheet films are put up in, and turns into its
		     close while that is open. Once this week's film is in it stays, greyed,
		     with the film's name in its title, so the bar does not jump about -->
		<button
			class="pill spadd"
			class:on={nomSheet.open}
			disabled={Boolean(nominatedTitle) && !nomSheet.open}
			aria-label={nomSheet.open ? T.close : nominatedTitle ? T.nomDone(nominatedTitle) : T.nomH}
			aria-expanded={nomSheet.open}
			title={nomSheet.open ? T.close : nominatedTitle ? T.nomDone(nominatedTitle) : T.nomH}
			onclick={() => {
				nomSheet.from = null;
				nomSheet.open = !nomSheet.open;
			}}
		>
			<svg viewBox="0 0 12 12" width="13" height="13" aria-hidden="true"
				><path d="M6 1.5v9M1.5 6h9" /></svg
			>
		</button>
	{/if}
{/snippet}

{#snippet specialChip()}
	{#if special && data.week}
		<div class="budget">
			<button
				class="pill spchip"
				class:fresh={!rulesSeen}
				aria-expanded={rulesOpen}
				aria-label="{T.spName(special.id)}: {T.youRules}"
				onclick={openRules}
				onblur={() => (rulesOpen = false)}
			>
				<Pumpkin size={17} />
				<span class="splabel">{T.spName(special.id)}</span>
				<svg class="spchev" class:up={rulesOpen} viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"
					><path d="M2 3.6 5 6.6 8 3.6" /></svg
				>
			</button>
			<div class="tip sptip" style:display={rulesOpen ? 'block' : 'none'}>
				<ol>
					{#each T.spRules(special, data.week.closesAt) as rule (rule.head)}
						<li><b>{rule.head}</b> {rule.body}</li>
					{/each}
				</ol>
				<div class="spfoot" aria-hidden="true"><Skull size={15} /><Pumpkin size={24} /></div>
			</div>
		</div>
		{#if data.week.status === 'open'}
			<!-- open, the + turns into the modal's close: it stays above the dimmed
			     page, and the modal grows out of it and shrinks back into it. With
			     every pick put up it stays where it was, greyed, so the bar does
			     not jump about and its absence does not read as a fault -->
			<button
				class="pill spadd"
				class:on={nomSheet.open}
				disabled={picksLeft === 0 && !nomSheet.open}
				aria-label={nomSheet.open ? T.close : picksLeft ? T.spAddAria(picksLeft) : T.spAddDone}
				aria-expanded={nomSheet.open}
				title={nomSheet.open ? T.close : picksLeft ? T.spAddAria(picksLeft) : T.spAddDone}
				onclick={(event) => {
					const rect = event.currentTarget.getBoundingClientRect();
					nomSheet.from = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
					nomSheet.open = !nomSheet.open;
				}}
			>
				<svg viewBox="0 0 12 12" width="13" height="13" aria-hidden="true"
					><path d="M6 1.5v9M1.5 6h9" /></svg
				>
			</button>
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
						<!-- the round in full, one tap away: which week it is, and the night
						     down to the hour, which is no longer always Thursday at eight -->
						<div class="tip" style:display={weekTip ? 'block' : 'none'}>
							{T.week(data.week.number)} ·
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
							{T.week(data.week.number)} ·
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
			<button class="menu-backdrop" aria-label={T.close} onclick={() => (menuOpen = false)}></button>
		{/if}

		{@render children()}

		{#if data.look === 'halloween'}
			<Halloween part="ground" />
		{/if}
	</div>
	{#if data.look === 'halloween'}
		<Halloween part="land" />
	{:else if !data.look}
		<Cinema part="seats" />
	{/if}

{/if}

{#if data.look === 'halloween'}
	<Halloween part="sky" />
{:else if !data.look}
	<Cinema part="sky" />
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

<svelte:window onkeydown={(event) => event.key === 'Escape' && (menuOpen = false)} />

<div class="toast" class:on={visible} class:bad={toast.bad}>{toast.text}</div>
