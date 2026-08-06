<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import Avatar from '$lib/components/Avatar.svelte';
	import { formatNight } from '$lib/datetime';
	import { dictFor, isVotes, LANGS } from '$lib/i18n';
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

	let tipOpen = $state(false);
	let menuOpen = $state(false);

	// a menu that survived navigation would hang over the page you just opened
	$effect(() => {
		path;
		menuOpen = false;
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

{#if bare}
	<div class="wrap">{@render children()}</div>
{:else}
	<div class="wrap">
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
					<div class="lang">
						{#each LANGS as code (code)}
							<form method="POST" action="/lang?/set">
								<input type="hidden" name="lang" value={code} />
								<input type="hidden" name="to" value={path} />
								<button class:on={data.lang === code}>{code.toUpperCase()}</button>
							</form>
						{/each}
					</div>

					{#if data.person}
						<!-- details, not a button, so the only navigation still works without JS -->
						<details class="menuwrap" bind:open={menuOpen}>
							<summary class="iconbtn" aria-label={T.menu}>
								<Avatar
									name={data.person.name}
									colour={data.person.colour}
									avatar={data.person.avatar}
									size={28}
									font={11}
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
							</div>
						</details>
					{/if}
				</div>

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
			</div>
		</header>

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
