<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Avatar from '$lib/components/Avatar.svelte';
	import Poster from '$lib/components/Poster.svelte';
	import { dictFor } from '$lib/i18n';
	import { say } from '$lib/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const T = $derived(dictFor(data.lang));
	const best = $derived(Math.max(0, ...(data.runoff?.tally ?? []).map((row) => row.votes)));

	let castingFor = $state('');

	const submit: SubmitFunction = () => async ({ result, update }) => {
		if (result.type === 'failure') {
			const body = result.data as
				| { code?: string; params?: Record<string, string | number>; message?: string }
				| undefined;
			say(T.error(body?.code ?? '', body?.params ?? {}, body?.message ?? ''), true);
		}
		await update({ reset: false });
	};

	// the projector should show the room filling up without anyone touching it
	$effect(() => {
		if (!data.runoff) return;
		const timer = setInterval(() => invalidateAll(), 4000);
		return () => clearInterval(timer);
	});
</script>

{#if data.runoff}
	<div class="tk" style="padding-left:0;padding-right:0">
		<p class="lead">{T.shortlistNote(data.runoff.tally.length)}</p>

		<div style="text-align:center">
			<div class="tkqr">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html data.runoff.qr}
			</div>
			<div class="code">{data.runoff.code}</div>
			<div style="font-size:11.5px;color:var(--dimmer)">{data.runoff.link}</div>
		</div>

		<div class="tkfilms">
			{#each data.runoff.tally as row (row.film.id)}
				<div class="tkfilm" class:win={row.votes === best && row.votes > 0}>
					{#if row.film.poster_url}
						<img src={row.film.poster_url} alt="" />
					{:else}
						<div class="noimg"></div>
					{/if}
					<div class="n">{row.votes}</div>
					<div class="l">{row.film.title}</div>
				</div>
			{/each}
		</div>

		<div style="font-size:12px;color:var(--dimmer);margin-top:14px">
			{T.turnout(data.runoff.turnout)}
		</div>

		<div class="sec">{T.hostCastH}</div>
		<div class="namegrid">
			{#each data.people as person (person.id)}
				<button
					class="namebtn"
					class:on={castingFor === person.id}
					onclick={() => (castingFor = castingFor === person.id ? '' : person.id)}
				>
					<Avatar name={person.name} colour={person.colour} avatar={person.avatar} />
					{person.name}{person.voted ? ' ✓' : ''}
				</button>
			{/each}
		</div>

		{#if castingFor}
			<p class="hintline">{T.hostCastPick}</p>
			{#each data.runoff.tally as row (row.film.id)}
				<form method="POST" action="?/voteFor" use:enhance={submit}>
					<input type="hidden" name="personId" value={castingFor} />
					<input type="hidden" name="filmId" value={row.film.id} />
					<button class="pickbtn">
						<div class="th"><Poster title={row.film.title} url={row.film.poster_url} /></div>
						<div>
							<b>{row.film.title}</b>
							<span>{T.votes(row.votes)}</span>
						</div>
					</button>
				</form>
			{/each}
		{/if}

		<form method="POST" action="?/closeRunoff" use:enhance={submit}>
			<button class="bigbtn">{T.hostLock}</button>
		</form>
	</div>
{:else}
	<p class="banner">{T.hostIdle}</p>
	<form method="POST" action="?/close" use:enhance={submit}>
		<button class="bigbtn">{T.hostClose}</button>
	</form>
	<p class="hintline">{T.hostCloseNote}</p>
{/if}
