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

<div class="bar">
	<span class="badge soft">{A.arcProgress(data.progress.done, data.progress.total)}</span>
	<button class="tap" class:go={!onlyUnattributed} onclick={() => (onlyUnattributed = false)}>
		{A.arcAllNights}
	</button>
	<button class="tap" class:go={onlyUnattributed} onclick={() => (onlyUnattributed = true)}>
		{A.arcOnlyUnattributed}
	</button>
</div>

{#snippet filmRow(film: PageData['weeks'][number]['winner'] & {}, week: number)}
	<div class="arow" class:unattributed={!film.attributed}>
		<div class="ath"><Poster title={film.title} url={film.poster_url} /></div>

		<div class="abody">
			<div class="ahead">
				<b>{film.title}{film.year ? ` (${film.year})` : ''}</b>
				{#if film.status === 'watched'}<span class="badge">{A.arcWinner}</span>{/if}
			</div>

			<div class="who">
				<span class="wholab">{A.arcWho}</span>
				{#each data.people as person (person.id)}
					<form method="POST" action="?/attribute" use:enhance={submit()}>
						<input type="hidden" name="id" value={film.id} />
						<input type="hidden" name="personId" value={person.id} />
						<input type="hidden" name="week" value={week} />
						<button
							class="chip"
							class:on={person.id === film.added_by}
							class:off={!person.active}
							title={person.name}
						>
							<Avatar
								name={person.name}
								colour={person.colour}
								avatar={person.avatar}
								titled={false}
							/>
						</button>
					</form>
				{/each}
			</div>

			<div class="acts">
				<form method="POST" action="?/attribute" use:enhance={submit()}>
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
	<section class="night">
		<header class="nhead">
			<b>{A.filWeek} {week.number}</b>
			<span class="ndate">{formatDay(week.closes_at, data.lang)}</span>
		</header>

		{#if week.winner}
			{@render filmRow(week.winner, week.number)}
		{/if}
		{#each week.proposed as film (film.id)}
			{@render filmRow(film, week.number)}
		{/each}
		{#if !week.winner && !week.proposed.length}
			<p class="ahint">{A.arcNothing}</p>
		{/if}

		{#if adding === week.number}
			<div class="addbox">
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
					<form
						method="POST"
						action="?/add"
						use:enhance={submit(() => closeAdd())}
						class="addform"
					>
						<input type="hidden" name="week" value={week.number} />
						<input type="hidden" name="title" value={picked.title} />
						<input type="hidden" name="tmdbId" value={picked.tmdbId ?? ''} />
						<input type="hidden" name="year" value={picked.year ?? ''} />
						<input type="hidden" name="poster" value={picked.poster ?? ''} />
						<input type="hidden" name="overview" value={picked.overview} />
						{#if duplicate}<input type="hidden" name="allowDuplicate" value="yes" />{/if}

						<div class="pickrow">
							<span class="ath"><Poster title={picked.title} url={picked.thumb} /></span>
							<b>{picked.title}{picked.year ? ` (${picked.year})` : ''}</b>
						</div>

						<label class="who">
							<span class="wholab">{A.arcWho}</span>
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

						<div class="acts">
							<button type="button" class="tap" onclick={closeAdd}>{A.arcCancel}</button>
							<button class="tap go">{duplicate ? A.arcAddAnyway : A.arcAdd}</button>
						</div>
					</form>
				{/if}
			</div>
		{:else}
			<button
				class="tap addopen"
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

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		margin: 0 0 12px;
	}
	.night {
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 8px 10px;
		margin: 0 0 10px;
		background: var(--card);
	}
	.nhead {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		margin: 0 0 6px;
	}
	.ndate {
		color: var(--dim);
		font-size: 12px;
	}
	.arow {
		display: flex;
		gap: 8px;
		padding: 6px 0;
		border-top: 1px solid var(--line);
	}
	/* the work queue: anything still sitting on a stand-in account */
	.arow.unattributed {
		border-left: 2px solid var(--accent);
		padding-left: 6px;
	}
	.ath {
		width: 34px;
		flex: 0 0 34px;
	}
	.abody {
		flex: 1 1 auto;
		min-width: 0;
	}
	.ahead {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 3px;
		flex-wrap: wrap;
		margin: 4px 0;
	}
	.wholab {
		color: var(--dim);
		font-size: 11px;
		margin-right: 3px;
	}
	.chip {
		border: 2px solid transparent;
		border-radius: 99px;
		padding: 0;
		background: none;
		cursor: pointer;
		line-height: 0;
		opacity: 0.45;
	}
	.chip:hover {
		opacity: 0.8;
	}
	.chip.on {
		border-color: var(--accent);
		opacity: 1;
	}
	/* somebody off the roster, kept pickable only so the backlog can leave them */
	.chip.off {
		opacity: 0.25;
	}
	.chip.off.on {
		opacity: 0.7;
	}
	.acts {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.addopen {
		margin-top: 6px;
	}
	.addbox {
		border-top: 1px solid var(--line);
		margin-top: 6px;
		padding-top: 6px;
	}
	.addform {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 6px;
	}
	.pickrow {
		display: flex;
		align-items: center;
		gap: 8px;
	}
</style>
