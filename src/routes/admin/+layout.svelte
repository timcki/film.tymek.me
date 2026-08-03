<script lang="ts">
	import { page } from '$app/state';
	import { adminDict } from '$lib/i18n.admin';
	import { toast } from '$lib/toast.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	const A = $derived(adminDict(data.lang));
	const path = $derived(page.url.pathname);

	let visible = $state(false);
	$effect(() => {
		if (!toast.seq) return;
		visible = true;
		const timer = setTimeout(() => (visible = false), 3200);
		return () => clearTimeout(timer);
	});

	const tabs = $derived([
		{ href: '/admin/calendar', label: A.navCalendar },
		{ href: '/admin/people', label: A.navPeople },
		{ href: '/admin/films', label: A.navFilms },
		{ href: '/host', label: A.navHost }
	]);
</script>

<svelte:head><title>{A.adminH}</title></svelte:head>

<div class="wrap">
	<header>
		<div>
			<h1>{A.adminH}</h1>
			<div class="sub">{data.admin.name}</div>
		</div>
		<a class="back" href="/">{A.navBack}</a>
	</header>

	<nav class="atabs">
		{#each tabs as tab (tab.href)}
			<a href={tab.href} class:on={path.startsWith(tab.href)}>{tab.label}</a>
		{/each}
	</nav>

	{@render children()}
</div>

<div class="toast" class:on={visible} class:bad={toast.bad}>{toast.text}</div>

<style>
	.back {
		font-size: 12px;
		color: var(--dim);
		text-decoration: none;
		white-space: nowrap;
	}
	.atabs {
		display: flex;
		gap: 6px;
		margin: 0 0 14px;
		flex-wrap: wrap;
	}
	.atabs a {
		flex: 1 1 auto;
		text-align: center;
		padding: 8px 12px;
		border-radius: 99px;
		border: 1px solid var(--line);
		background: var(--card);
		color: var(--dim);
		font-size: 13px;
		font-weight: 600;
		text-decoration: none;
	}
	.atabs a.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}
</style>
