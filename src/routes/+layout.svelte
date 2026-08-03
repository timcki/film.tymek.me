<script lang="ts">
	import '../app.css';
	import type { LayoutServerData } from './$types';

	let { data, children }: { data: LayoutServerData; children: import('svelte').Snippet } = $props();

	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});

	const countdown = $derived.by(() => {
		if (!data.week) return '';
		const left = new Date(data.week.closesAt).getTime() - now;
		if (left <= 0) return 'voting is closed';
		const days = Math.floor(left / 86400000);
		const hours = Math.floor(left / 3600000) % 24;
		const minutes = Math.floor(left / 60000) % 60;
		const seconds = Math.floor(left / 1000) % 60;
		if (days > 0) return `${days}d ${hours}h ${minutes}m`;
		return `${hours}h ${minutes}m ${seconds}s`;
	});
</script>

<svelte:head><title>Film Night</title></svelte:head>

<div class="wrap">
	{#if data.person}
		<nav>
			<a href="/">list</a>
			<a href="/history">history</a>
			<a href="/host">host</a>
			<a href="/me">{data.person.name.split(' ')[0]}</a>
		</nav>
	{/if}

	{#if data.week}
		<p class="notice" style="margin-top:10px">
			week {data.week.number} · {data.rules.label} rules ·
			{#if data.week.status === 'open'}
				closes in <strong>{countdown}</strong>
			{:else if data.week.status === 'runoff'}
				the room is picking, code <strong>{data.runoffCode}</strong>
			{:else}
				closed
			{/if}
		</p>
	{/if}

	{#if data.rulesJustChanged}
		<p class="card">
			The rules changed to <strong>{data.rules.label}</strong> this week. Every score was recomputed
			from the ballots; nothing was lost.
		</p>
	{/if}

	{@render children()}

	<p class="notice" style="margin-top:2.5rem">
		This product uses the TMDB API but is not endorsed or certified by TMDB.
	</p>
</div>
