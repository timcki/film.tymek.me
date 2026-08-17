<script lang="ts">
	import '../app.css';
	import '../themes.css';
	import { page } from '$app/state';
	import Avatar from '$lib/components/Avatar.svelte';
	import { formatNight } from '$lib/datetime';
	import { dictFor, isVotes, LANGS } from '$lib/i18n';
	import { THEMES } from '$lib/themes';
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
		return T.clock(
			Math.floor(left / 86400000),
			Math.floor(left / 3600000) % 24,
			Math.floor(left / 60000) % 60,
			Math.floor(left / 1000) % 60
		);
	});

	const title = $derived.by(() => {
		if (path.startsWith('/history')) return T.watchedH;
		if (path.startsWith('/me')) return (data.person?.name ?? T.tabYou).split(' ')[0];
		if (path.startsWith('/host')) return T.hostH;
		return T.appTitle;
	});

	const showPill = $derived(Boolean(data.person) && (path === '/' || path.startsWith('/me')));

	// every page gets the compact bar, so the app has one header rather than two.
	// The list has no name worth printing, so the round takes that slot; the
	// others put their name there and let the round move into the tip
	const lean = $derived(!bare && Boolean(data.week));
	const leanLabel = $derived(path === '/' ? T.week(data.week?.number ?? 0) : title);

	// how much of the round is spent, as the bar under the header
	const burnt = $derived.by(() => {
		if (!data.week) return 0;
		const opens = new Date(data.week.opensAt).getTime();
		const closes = new Date(data.week.closesAt).getTime();
		if (!(closes > opens)) return 100;
		return Math.min(100, Math.max(0, ((now - opens) / (closes - opens)) * 100));
	});
	// the last day, where the bar stops being furniture and starts being a warning
	const urgent = $derived(
		Boolean(data.week) && new Date(data.week!.closesAt).getTime() - now < 86400000
	);
	// the colour ramp is painted across the fill, which is only part of the
	// track, so it is scaled back up to the track's width to be read at the tip
	const ramp = $derived((100 / Math.max(burnt, 5)) * 100);


	let tipOpen = $state(false);
	let weekTip = $state(false);
	let menuOpen = $state(false);

	// a menu that survived navigation would hang over the page you just opened
	$effect(() => {
		path;
		menuOpen = false;
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
				<a href="/" class:on={path === '/'}>
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
					{@render themeswitch()}
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
					<span class="hpip spent">✓</span>
				{/each}
				{#each Array(Math.max(0, data.person.left)) as _, i (i)}
					<span class="hpip free"></span>
				{/each}
			</button>
			<div class="tip" style:display={tipOpen ? 'block' : 'none'}>
				<b>{T.budgetPill(data.person.left, data.person.budget, isVotes(data.rules))}</b>
				· {T.budgetHelp(data.rules)}
			</div>
		</div>
	{/if}
{/snippet}

{#if bare}
	<div class="wrap">{@render children()}</div>
{:else}
	<!-- the host view is a projector or a laptop, never a phone; let it breathe -->
	<div class="wrap" class:wide={path.startsWith('/host')}>
		{#if lean && data.week}
			<!-- the list wears its state, not its name: a face, the round, what is
			     left of it, and a bar draining under the lot. It follows the page
			     down, because the deadline is the reason anybody opened this -->
			<header class="lean">
				<div class="hrow">
					{@render identity()}

					<div class="wk">
						<button
							class="wkbtn"
							class:urgent
							aria-expanded={weekTip}
							onclick={() => (weekTip = !weekTip)}
							onblur={() => (weekTip = false)}
						>
							<span class="wknum">{leanLabel}</span>
							{#if data.week.status === 'open' && countdown}
								<span class="wkdot">·</span>
								<b>{T.closesInShort} {countdown}</b>
							{:else if data.week.status === 'runoff'}
								<span class="wkdot">·</span>
								<b>{T.roomPicking(data.runoffCode ?? '')}</b>
							{:else}
								<span class="wkdot">·</span>
								<b>{T.votingClosed}</b>
							{/if}
						</button>
						<!-- the round in full, one tap away: which week it is, and the exact
						     night, which is no longer always a Thursday -->
						<div class="tip" style:display={weekTip ? 'block' : 'none'}>
							{T.week(data.week.number)} · {T.closesIn}
							<b>{countdown ?? '—'}</b> · {formatNight(data.week.closesAt, data.lang)}
						</div>
					</div>

					{@render budget()}
				</div>

				{#if data.week.status === 'open'}
					<div class="wbar">
						<i style:width="{burnt}%" style:background-size="{ramp}% 100%"></i>
					</div>
				{/if}
			</header>
		{:else}
			<header>
				<div>
					<h1>{title}</h1>
					{#if data.week}
						<div class="sub">
							{T.week(data.week.number)} ·
							{#if data.week.status === 'open' && countdown}
								{T.closesIn} <b>{countdown}</b>
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

		{#if data.week?.status === 'runoff' && data.runoffCode && !path.startsWith('/host')}
			<p class="banner accent">
				<a href="/f/{data.runoffCode}">{T.openRoom}</a>
			</p>
		{/if}

		{@render children()}
	</div>

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

{#if menuOpen}
	<!-- a tap anywhere else dismisses the menu -->
	<button class="menu-backdrop" aria-label={T.close} onclick={() => (menuOpen = false)}></button>
{/if}

<svelte:window onkeydown={(event) => event.key === 'Escape' && (menuOpen = false)} />

<div class="toast" class:on={visible} class:bad={toast.bad}>{toast.text}</div>
