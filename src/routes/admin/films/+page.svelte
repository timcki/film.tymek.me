<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Avatar from '$lib/components/Avatar.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import FilmEditForm from '$lib/components/FilmEditForm.svelte';
	import Poster from '$lib/components/Poster.svelte';
	import { adminDict } from '$lib/i18n.admin';
	import { dictFor, fmtScore } from '$lib/i18n';
	import { say } from '$lib/toast.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const A = $derived(adminDict(data.lang));

	let editing = $state<number | null>(null);
	let filter = $state('');

	const submit = (onOk?: () => void): SubmitFunction => {
		return () =>
			async ({ result, update }) => {
				if (result.type === 'failure') {
					const body = result.data as
						| { code?: string; params?: Record<string, string | number>; message?: string }
						| undefined;
					say(A.error(body?.code ?? '', body?.params ?? {}, body?.message ?? ''), true);
				}
				if (result.type === 'success') onOk?.();
				await update({ reset: false });
			};
	};

	function saveOnChange(event: Event) {
		(event.currentTarget as HTMLSelectElement).form?.requestSubmit();
	}

	const STATUSES = ['active', 'archived', 'dropped'] as const;
	const statusLabel = (status: (typeof STATUSES)[number]) =>
		status === 'active' ? A.filActivate : status === 'archived' ? A.filArchive : A.filDrop;

	type Film = PageData['films'][number];
	const matches = (film: Film) => film.title.toLowerCase().includes(filter.trim().toLowerCase());
	const shown = $derived(data.films.filter(matches));
	const picks = $derived(data.picks.filter(matches));
	const roundName = $derived(
		data.special ? (data.special.name ?? dictFor(data.lang).spName(data.special.id)) : ''
	);
</script>

<h2 class="ah">{A.rndH}</h2>
<p class="ahint">{A.rndIntro}</p>

<input class="sinput" placeholder={A.filSearchPh} bind:value={filter} autocomplete="off" />

{#if data.picks.length}
	<div class="sec" id="picks">{A.filPicksH(roundName)}</div>
	<p class="ahint">{A.filPicksIntro}</p>
	{#each picks as film (film.id)}
		{@render row(film, true)}
	{:else}
		<p class="ahint">{A.filEmpty}</p>
	{/each}
	<div class="sec">{A.rndH}</div>
{/if}

{#each shown as film (film.id)}
	{@render row(film, false)}
{:else}
	<p class="ahint">{A.filEmpty}</p>
{/each}

<!-- §3.6: a pick's tick count stays hidden until the round closes, here as anywhere -->
{#snippet row(film: Film, pick: boolean)}
	{@const held = data.held.includes(film.id)}
	<div class="frow" class:off={film.status !== 'active'} class:open={editing === film.id}>
		<div class="fth"><Poster title={film.title} url={film.poster_url} /></div>

		<div class="fbody">
			<div class="fhead">
				<b>{film.title}{film.year ? ` (${film.year})` : ''}</b>
				{#if !pick}<span class="fscore">{fmtScore(film.score)}</span>{/if}
			</div>
			<div class="fmeta">
				<span class="badge soft">{A.filStatus(film.status)}</span>
				{#if held}<span class="badge warn">{A.filHeld}</span>{/if}
				{A.filBy(film.added_by_name, data.evenings[film.added_week])} ·
				{pick ? A.filTicked(film.approvals > 0) : A.filBallots(film.ballots)}
			</div>
			{#if film.backers.length}
				<div class="backers">
					{#each film.backers as backer (backer.id)}
						<Avatar name={backer.name} colour={backer.colour} avatar={backer.avatar} />
					{/each}
				</div>
			{/if}

			{#if editing === film.id}
				<FilmEditForm
					{film}
					{A}
					submit={submit(() => (editing = null))}
					oncancel={() => (editing = null)}
				/>

				<div class="fmore">
					<form method="POST" action="?/reassign" use:enhance={submit()}>
						<input type="hidden" name="id" value={film.id} />
						<label class="bankin">
							{A.filReassignH}
							<select name="personId" onchange={saveOnChange}>
								{#each data.people as person (person.id)}
									<option value={person.id} selected={person.id === film.added_by}>
										{person.name}
									</option>
								{/each}
							</select>
						</label>
					</form>

					<div class="acts">
						{#each STATUSES as status (status)}
							{#if film.status !== status}
								<form method="POST" action="?/status" use:enhance={submit()}>
									<input type="hidden" name="id" value={film.id} />
									<input type="hidden" name="status" value={status} />
									<button class="tap">{statusLabel(status)}</button>
								</form>
							{/if}
						{/each}
					</div>

					<!-- the group-chat ask, pressed on the absentee's behalf -->
					{#if film.status === 'active' && !pick}
						<form class="acts" method="POST" action="?/hold" use:enhance={submit()}>
							<input type="hidden" name="id" value={film.id} />
							{#if held}
								<button class="tap on">{A.filRelease}</button>
							{:else}
								<input type="text" name="reason" placeholder={A.filHoldWhy} maxlength="160" />
								<input type="hidden" name="on" value="1" />
								<button class="tap">{A.filHold}</button>
							{/if}
						</form>
					{/if}

					<div class="acts">
						{#if film.ballots === 0 && film.approvals === 0}
							<form method="POST" action="?/remove" use:enhance={submit()}>
								<input type="hidden" name="id" value={film.id} />
								<ConfirmButton label={A.filDelete} sure={A.sure} />
							</form>
						{:else}
							<span class="ahint">{film.ballots ? A.filDeleteNote : A.filTickedNote}</span>
						{/if}
					</div>
				</div>
			{:else}
				<div class="acts">
					<button class="tap" onclick={() => (editing = film.id)}>{A.filEdit}</button>
				</div>
			{/if}
		</div>
	</div>
{/snippet}
