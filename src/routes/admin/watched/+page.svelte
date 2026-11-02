<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Avatar from '$lib/components/Avatar.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import FilmEditForm from '$lib/components/FilmEditForm.svelte';
	import Poster from '$lib/components/Poster.svelte';
	import FilmSearch, { type Picked } from '$lib/components/FilmSearch.svelte';
	import { formatDay, toLocalInput } from '$lib/datetime';
	import { adminDict } from '$lib/i18n.admin';
	import { dictFor } from '$lib/i18n';
	import { OUTINGS } from '$lib/outings';
	import { say } from '$lib/toast.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const A = $derived(adminDict(data.lang));
	const T = $derived(dictFor(data.lang));

	let picked = $state<Picked | null>(null);
	let editing = $state<number | null>(null);
	// an outing is written down by its day; a film night by its round's date and time
	let addWhere = $state('');
	let moveWhere = $state('');
	const today = $derived(data.now.slice(0, 10));
	/**
	 * The same film coming up twice is a warning, not a refusal. The warning
	 * belongs to the pick it was raised for: a different film is asked afresh.
	 */
	let duplicate = $state(false);

	function pick(film: Picked | null) {
		picked = film;
		duplicate = false;
	}

	const submit = (onOk?: () => void, onFail?: (code: string) => void): SubmitFunction => {
		return () =>
			async ({ result, update }) => {
				if (result.type === 'failure') {
					const body = result.data as
						| { code?: string; params?: Record<string, string | number>; message?: string }
						| undefined;
					say(A.error(body?.code ?? '', body?.params ?? {}, body?.message ?? ''), true);
					onFail?.(body?.code ?? '');
				}
				if (result.type === 'success') onOk?.();
				await update({ reset: false });
			};
	};

	/** picking the name is the whole action; there is no button to go and find */
	function saveOnPick(event: Event) {
		(event.currentTarget as HTMLSelectElement).form?.requestSubmit();
	}
</script>

<h2 class="ah">{A.watH}</h2>
<p class="ahint">{A.watIntro}</p>

<section class="anight">
	<header class="ahdr"><b>{A.watAddH}</b></header>

	{#if !picked}
		<FilmSearch
			placeholder={A.watSearchPh}
			byHandLabel={A.watByHand}
			noResultsLabel={A.watNoResults}
			onpick={pick}
		/>
	{:else}
		<form
			method="POST"
			action="?/add"
			use:enhance={submit(
				() => pick(null),
				(code) => (duplicate = code === 'dup_recorded')
			)}
		>
			<input type="hidden" name="title" value={picked.title} />
			<input type="hidden" name="tmdbId" value={picked.tmdbId ?? ''} />
			<input type="hidden" name="year" value={picked.year ?? ''} />
			<input type="hidden" name="poster" value={picked.poster ?? ''} />
			<input type="hidden" name="overview" value={picked.overview} />
			{#if duplicate}<input type="hidden" name="allowDuplicate" value="yes" />{/if}

			<div class="afilm">
				<div class="apost"><Poster title={picked.title} url={picked.thumb} /></div>
				<div class="abody">
					<div class="ahead">
						<b>{picked.title}{picked.year ? ` (${picked.year})` : ''}</b>
					</div>
					<div class="acts">
						<label class="bankin">
							{A.watWhen}
							{#if addWhere}
								<input type="date" name="day" value={today} max={today} required />
							{:else}
								<input type="datetime-local" name="at" value={data.now} max={data.now} required />
							{/if}
						</label>
						<label class="bankin">
							{A.watWhere}
							<select name="outing" bind:value={addWhere}>
								<option value="">{A.watFilmNight}</option>
								{#each OUTINGS as where (where)}
									<option value={where}>{T.outing(where)}</option>
								{/each}
							</select>
						</label>
						<label class="awho">
							{A.watWho}
							<select name="personId">
								{#each data.people as person (person.id)}
									<option value={person.id} selected={person.id === data.admin.id}>
										{person.name}
									</option>
								{/each}
							</select>
						</label>
					</div>
				</div>
			</div>

			<div class="acts">
				<button type="button" class="tap" onclick={() => pick(null)}>{A.watCancel}</button>
				<button class="tap go">{duplicate ? A.watAddAnyway : A.watAdd}</button>
			</div>
		</form>
	{/if}
</section>

{#each data.films as film (film.id)}
	<div class="afilm">
		<div class="apost"><Poster title={film.title} url={film.poster_url} /></div>

		<div class="abody">
			<div class="ahead">
				<b>{film.title}{film.year ? ` (${film.year})` : ''}</b>
				{#if film.outing}<span class="badge">{T.outing(film.outing)}</span>{/if}
				{#if film.specialNight}<span class="badge">{T.nightSpecial}</span>{/if}
			</div>
			<span class="adate">{T.evening(film.evening)} · {formatDay(film.at, data.lang)}</span>

			{#if editing === film.id}
				<FilmEditForm
					{film}
					{A}
					submit={submit(() => (editing = null))}
					oncancel={() => (editing = null)}
				/>
				<!-- §2: a written-down evening can be put right; a round's night is the round's -->
				{#if film.archival}
					<form class="acts" method="POST" action="?/move" use:enhance={submit(() => (editing = null))}>
						<input type="hidden" name="id" value={film.id} />
						<label class="bankin">
							{A.watWhen}
							{#if moveWhere}
								<input type="date" name="day" value={toLocalInput(film.at).slice(0, 10)} max={today} required />
							{:else}
								<input type="datetime-local" name="at" value={toLocalInput(film.at)} max={data.now} required />
							{/if}
						</label>
						<label class="bankin">
							{A.watWhere}
							<select name="outing" bind:value={moveWhere}>
								<option value="">{A.watFilmNight}</option>
								{#each OUTINGS as where (where)}
									<option value={where}>{T.outing(where)}</option>
								{/each}
							</select>
						</label>
						<button class="tap go">{A.watMove}</button>
					</form>
				{/if}
			{/if}

			<div class="acts">
				{#if editing !== film.id}
					<button
						class="tap"
						onclick={() => {
							editing = film.id;
							moveWhere = film.outing ?? '';
						}}>{A.filEdit}</button
					>
				{/if}
				<form method="POST" action="?/credit" use:enhance={submit()} class="awho">
					<input type="hidden" name="id" value={film.id} />
					<Avatar
						name={film.added_by_face.name}
						colour={film.added_by_face.colour}
						avatar={film.added_by_face.avatar}
					/>
					<select name="personId" onchange={saveOnPick}>
						{#each data.people as person (person.id)}
							<option value={person.id} selected={person.id === film.added_by}>
								{person.name}
							</option>
						{/each}
					</select>
				</form>

				<!-- a written record typed wrong has to be removable; a round's film never is -->
				{#if film.archival}
					<form method="POST" action="?/remove" use:enhance={submit()}>
						<input type="hidden" name="id" value={film.id} />
						<ConfirmButton label={A.filDelete} sure={A.sure} />
					</form>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<p class="ahint">{A.watEmpty}</p>
{/each}
