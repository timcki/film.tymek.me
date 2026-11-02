<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { AdminDict } from '$lib/i18n.admin';
	import FilmSearch, { type Picked } from './FilmSearch.svelte';

	type Editable = {
		id: number;
		title: string;
		year: number | null;
		director: string | null;
		genre: string | null;
		runtime: number | null;
		poster_url: string | null;
		note: string | null;
	};

	let {
		film,
		A,
		submit,
		oncancel
	}: { film: Editable; A: AdminDict; submit: SubmitFunction; oncancel: () => void } = $props();

	// another film picked in this one's place; the server fills in what TMDB knows
	let replaced = $state<Picked | null>(null);
</script>

<form class="fedit" method="POST" action="?/edit" use:enhance={submit}>
	<input type="hidden" name="id" value={film.id} />
	<div class="swap">
		<FilmSearch
			placeholder={A.filReplace}
			noResultsLabel={A.watNoResults}
			onpick={(picked) => (replaced = picked)}
		/>
		{#if replaced}
			<input type="hidden" name="tmdbId" value={replaced.tmdbId ?? ''} />
			<input type="hidden" name="overview" value={replaced.overview} />
			<p class="ahint">{A.filReplaced(replaced.title)}</p>
		{/if}
	</div>
	{#key replaced}
		<label>{A.filTitle}<input type="text" name="title" value={replaced?.title ?? film.title} required /></label>
		<label>{A.filYear}<input type="number" name="year" value={(replaced ? replaced.year : film.year) ?? ''} /></label>
		{#if !replaced}
			<label>{A.filDirector}<input type="text" name="director" value={film.director ?? ''} /></label>
			<label>{A.filGenre}<input type="text" name="genre" value={film.genre ?? ''} /></label>
			<label>{A.filRuntime}<input type="number" name="runtime" value={film.runtime ?? ''} /></label>
		{/if}
		<label
			>{A.filPoster}<input type="text" name="poster" value={(replaced ? replaced.poster : film.poster_url) ?? ''} /></label
		>
	{/key}
	<label>{A.filNote}<input type="text" name="note" value={film.note ?? ''} maxlength="160" /></label>
	<div class="acts">
		<button type="button" class="tap" onclick={oncancel}>{A.filCancel}</button>
		<button class="tap go">{A.filSave}</button>
	</div>
</form>

<style>
	.swap {
		flex: 1 1 100%;
	}
</style>
