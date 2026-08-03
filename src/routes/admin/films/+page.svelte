<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Poster from '$lib/components/Poster.svelte';
	import { adminDict } from '$lib/i18n.admin';
	import { say } from '$lib/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

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

	const shown = $derived(
		data.films.filter((film) => film.title.toLowerCase().includes(filter.trim().toLowerCase()))
	);
</script>

<h2 class="ah">{A.filH}</h2>

<input class="sinput" placeholder={A.filH} bind:value={filter} autocomplete="off" />

{#each shown as film (film.id)}
	<div class="frow" class:off={film.status !== 'active'}>
		<div class="fth"><Poster title={film.title} url={film.poster_url} /></div>

		<div class="fbody">
			<div class="fhead">
				<b>{film.title}{film.year ? ` (${film.year})` : ''}</b>
				<span class="fscore">{film.score}</span>
			</div>
			<div class="fmeta">
				<span class="badge soft">{A.filStatus(film.status)}</span>
				{A.filBy(film.added_by_name, film.added_week)} · {A.filBallots(film.ballots)}
				{#if film.penalty > 0}<span class="badge cut">{A.filPenalty(film.penalty)}</span>{/if}
				{#if film.watched_week}<span class="badge">{A.filWeek} {film.watched_week}</span>{/if}
			</div>

			{#if editing === film.id}
				<form class="fedit" method="POST" action="?/edit" use:enhance={submit(() => (editing = null))}>
					<input type="hidden" name="id" value={film.id} />
					<label>{A.filTitle}<input type="text" name="title" value={film.title} required /></label>
					<label>{A.filYear}<input type="number" name="year" value={film.year ?? ''} /></label>
					<label
						>{A.filDirector}<input type="text" name="director" value={film.director ?? ''} /></label
					>
					<label>{A.filGenre}<input type="text" name="genre" value={film.genre ?? ''} /></label>
					<label
						>{A.filRuntime}<input type="number" name="runtime" value={film.runtime ?? ''} /></label
					>
					<label
						>{A.filPoster}<input type="text" name="poster" value={film.poster_url ?? ''} /></label
					>
					<label>{A.filNote}<input type="text" name="note" value={film.note ?? ''} maxlength="160" /></label>
					<div class="acts">
						<button type="button" class="tap" onclick={() => (editing = null)}>{A.filCancel}</button>
						<button class="tap go">{A.filSave}</button>
					</div>
				</form>
			{:else}
				<div class="acts">
					<button class="tap" onclick={() => (editing = film.id)}>{A.filEdit}</button>

					{#each ['active', 'archived', 'dropped'] as status (status)}
						{#if film.status !== status}
							<form method="POST" action="?/status" use:enhance={submit()}>
								<input type="hidden" name="id" value={film.id} />
								<input type="hidden" name="status" value={status} />
								<button class="tap">
									{status === 'active'
										? A.filActivate
										: status === 'archived'
											? A.filArchive
											: A.filDrop}
								</button>
							</form>
						{/if}
					{/each}

					{#if film.status !== 'watched'}
						<form method="POST" action="?/watched" use:enhance={submit()}>
							<input type="hidden" name="id" value={film.id} />
							<label class="bankin">
								{A.filWeek}
								<input type="number" name="week" value={data.weekNumber} min="1" />
							</label>
							<button class="tap">{A.filMarkWatched}</button>
						</form>
					{/if}

					<form method="POST" action="?/reassign" use:enhance={submit()}>
						<input type="hidden" name="id" value={film.id} />
						<select name="personId">
							{#each data.people as person (person.id)}
								<option value={person.id} selected={person.id === film.added_by}>
									{person.name}
								</option>
							{/each}
						</select>
						<button class="tap">{A.filReassign}</button>
					</form>

					{#if film.penalty > 0}
						<form method="POST" action="?/penalty" use:enhance={submit()}>
							<input type="hidden" name="id" value={film.id} />
							<button class="tap">{A.filClearPenalty}</button>
						</form>
					{/if}

					{#if film.ballots === 0 && film.status !== 'watched'}
						<form method="POST" action="?/remove" use:enhance={submit()}>
							<input type="hidden" name="id" value={film.id} />
							<button class="tap bad">{A.filDelete}</button>
						</form>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{:else}
	<p class="ahint">{A.filEmpty}</p>
{/each}

<p class="ahint">{A.filDeleteNote}</p>
