<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { dictFor, isVotes, LANGS } from '$lib/i18n';
	import { toast } from '$lib/toast.svelte';
	import type { LayoutServerData } from './$types';

	let { data, children }: { data: LayoutServerData; children: import('svelte').Snippet } = $props();

	const T = $derived(dictFor(data.lang));
	const path = $derived(page.url.pathname);
	// the room vote is its own world: no tabs, no budget, possibly no account
	const bare = $derived(path.startsWith('/f/'));

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
						{:else if data.week.status === 'runoff'}
							{T.roomPicking(data.runoffCode ?? '')}
						{:else}
							{T.votingClosed}
						{/if}
					</div>
				{/if}
			</div>

			<div class="hr">
				<div class="lang">
					{#each LANGS as code (code)}
						<form method="POST" action="/lang?/set">
							<input type="hidden" name="lang" value={code} />
							<input type="hidden" name="to" value={path} />
							<button class:on={data.lang === code}>{code.toUpperCase()}</button>
						</form>
					{/each}
				</div>

				{#if showPill && data.person}
					<div class="budget">
						<button
							class="pill"
							aria-expanded={tipOpen}
							onclick={() => (tipOpen = !tipOpen)}
							onblur={() => (tipOpen = false)}
						>
							<b>{T.budgetPill(data.person.left, data.person.budget, isVotes(data.rules))}</b>
						</button>
						<div class="tip" style:display={tipOpen ? 'block' : 'none'}>
							{T.budgetHelp(data.rules)}
						</div>
					</div>
				{/if}
			</div>
		</header>

		{#if data.rulesJustChanged}
			<p class="banner mint">{T.rulesChanged(data.rules.label)}</p>
		{/if}

		{#if data.week?.status === 'runoff' && data.runoffCode && !path.startsWith('/host')}
			<p class="banner mint">
				<a href="/f/{data.runoffCode}">{T.openRoom}</a>
			</p>
		{/if}

		{@render children()}
	</div>

	{#if data.person}
		<nav class="tabs">
			<div class="inner">
				<a href="/" class:on={path === '/'}>
					<span class="ic">
						<svg
							width="19"
							height="19"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.9"
							stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg
						>
					</span>
					<span>{T.tabList}</span>
				</a>
				<a href="/history" class:on={path.startsWith('/history')}>
					<span class="ic">
						<svg
							width="19"
							height="19"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.9"
							stroke-linecap="round"
							stroke-linejoin="round"><path d="M20 6.5 9.5 17 4 11.5" /></svg
						>
					</span>
					<span>{T.tabSeen}</span>
				</a>
				<a href="/me" class:on={path.startsWith('/me')}>
					<span class="ic">
						<svg
							width="19"
							height="19"
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
					<span>{T.tabYou}</span>
				</a>
			</div>
		</nav>
	{/if}
{/if}

<div class="toast" class:on={visible} class:bad={toast.bad}>{toast.text}</div>
