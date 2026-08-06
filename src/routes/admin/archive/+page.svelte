<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Avatar from '$lib/components/Avatar.svelte';
	import Poster from '$lib/components/Poster.svelte';
	import FilmSearch, { type Picked } from '$lib/components/FilmSearch.svelte';
	import { formatDay } from '$lib/datetime';
	import { adminDict } from '$lib/i18n.admin';
	import { say } from '$lib/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const A = $derived(adminDict(data.lang));

	/** the week whose add-a-film box is open, if any */
	let adding = $state<number | null>(null);
	let picked = $state<Picked | null>(null);
	let pickedFor = $state<number | null>(null);
	let onlyUnattributed = $state(false);

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

	function closeAdd() {
		adding = null;
		picked = null;
		pickedFor = null;
	}

	/** picking the name is the whole action; there is no button to go and find */
	function saveOnPick(event: Event) {
		(event.currentTarget as HTMLSelectElement).form?.requestSubmit();
	}

	/** the same film going up twice is a warning, not a refusal */
	const duplicate = $derived((form as { code?: string } | null)?.code === 'dup_archival');

	const shown = $derived(
		onlyUnattributed
			? data.weeks.filter((week) =>
					[week.winner, ...week.proposed].some((film) => film && !film.attributed)
				)
			: data.weeks
	);
</script>

<h2 class="ah">{A.arcH}</h2>
<p class="ahint">{A.arcIntro}</p>

<div class="abar">
	<span class="badge soft">{A.arcProgress(data.progress.done, data.progress.total)}</span>
	<button class="tap" class:go={!onlyUnattributed} onclick={() => (onlyUnattributed = false)}>
		{A.arcAllNights}
	</button>
	<button class="tap" class:go={onlyUnattributed} onclick={() => (onlyUnattributed = true)}>
		{A.arcOnlyUnattributed}
	</button>
</div>

{#snippet filmRow(film: NonNullable<PageData['weeks'][number]['winner']>, week: number)}
	<div class="afilm" class:unattributed={!film.attributed}>
		<div class="apost"><Poster title={film.title} url={film.poster_url} /></div>

		<div class="abody">
			<div class="ahead">
				<b>{film.title}{film.year ? ` (${film.year})` : ''}</b>
				{#if film.status === 'watched'}<span class="badge">{A.arcWinner}</span>{/if}
			</div>

			<div class="acts">
				<form method="POST" action="?/attribute" use:enhance={submit()} class="awho">
					<input type="hidden" name="id" value={film.id} />
					<input type="hidden" name="week" value={week} />
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

				<form method="POST" action="?/attribute" use:enhance={submit()} class="awho">
					<input type="hidden" name="id" value={film.id} />
					<input type="hidden" name="personId" value={film.added_by} />
					<label class="bankin">
						{A.arcMoveH}
						<input type="number" name="week" value={week} min="1" />
					</label>
					<button class="tap">{A.arcMove}</button>
				</form>

				{#if film.archival}
					<form method="POST" action="?/remove" use:enhance={submit()}>
						<input type="hidden" name="id" value={film.id} />
						<button class="tap bad">{A.filDelete}</button>
					</form>
				{/if}
			</div>
		</div>
	</div>
{/snippet}

{#each shown as week (week.number)}
	<section class="anight">
		<header class="ahdr">
			<b>{A.filWeek} {week.number}</b>
			<span class="adate">{formatDay(week.closes_at, data.lang)}</span>
		</header>

		{#if week.winner}
			{@render filmRow(week.winner, week.number)}
		{/if}
		{#each week.proposed as film (film.id)}
			{@render filmRow(film, week.number)}
		{/each}
		{#if !week.winner && !week.proposed.length}
			<p class="ahint aempty">{A.arcNothing}</p>
		{/if}

		{#if adding === week.number}
			<div class="aadd">
				<b>{A.arcAddH(week.number)}</b>

				{#if !picked || pickedFor !== week.number}
					<FilmSearch
						placeholder={A.arcSearchPh}
						byHandLabel={A.arcByHand}
						noResultsLabel={A.arcNoResults}
						onpick={(film) => {
							picked = film;
							pickedFor = week.number;
						}}
					/>
				{:else}
					<form method="POST" action="?/add" use:enhance={submit(() => closeAdd())}>
						<input type="hidden" name="week" value={week.number} />
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
									<label class="awho">
										{A.arcWho}
										<select name="personId">
											{#each data.people as person (person.id)}
												<option value={person.id}>{person.name}</option>
											{/each}
										</select>
									</label>
									<label class="bankin">
										<input type="checkbox" name="watched" />
										{A.arcWasWatched}
									</label>
								</div>
							</div>
						</div>

						<div class="acts">
							<button type="button" class="tap" onclick={closeAdd}>{A.arcCancel}</button>
							<button class="tap go">{duplicate ? A.arcAddAnyway : A.arcAdd}</button>
						</div>
					</form>
				{/if}
			</div>
		{:else}
			<button
				class="tap aopen"
				onclick={() => {
					adding = week.number;
					picked = null;
				}}
			>
				{A.arcAddOpen}
			</button>
		{/if}
	</section>
{:else}
	<p class="ahint">{A.arcEmpty}</p>
{/each}
