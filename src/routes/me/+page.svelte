<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<h1>{data.person?.name}</h1>

{#if form?.rotated}
	<p class="card">New link issued. Every other device of yours needs to scan again.</p>
{/if}

<h2>Device QR</h2>
<p class="danger">Never project this. Anyone who photographs it becomes you.</p>
<div class="qr">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html data.qr}
</div>
<p class="notice" style="word-break:break-all">{data.link}</p>
<p class="notice">Scan it with your phone and that phone is you, permanently.</p>

<h2>Your numbers</h2>
<table>
	<tbody>
		<tr><th>Points spent, all time</th><td>{data.stats.spent}</td></tr>
		<tr><th>Your nominations we watched</th><td>{data.stats.nominatedWatched}</td></tr>
		<tr><th>Longest campaign</th><td>{data.stats.longestCampaign} weeks</td></tr>
		{#if data.stats.bank !== null}
			<tr><th>Bank balance</th><td>{data.stats.bank}</td></tr>
		{/if}
	</tbody>
</table>

<h2>Lost the link?</h2>
<form method="POST" action="?/rotate" use:enhance>
	<button>rotate my token</button>
</form>
<p class="notice">
	Use this if your link leaked. The old link stops working immediately, and your other devices will
	need to scan the new QR.
</p>
