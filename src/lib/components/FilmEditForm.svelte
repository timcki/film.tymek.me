<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { AdminDict } from '$lib/i18n.admin';

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
</script>

<form class="fedit" method="POST" action="?/edit" use:enhance={submit}>
	<input type="hidden" name="id" value={film.id} />
	<label>{A.filTitle}<input type="text" name="title" value={film.title} required /></label>
	<label>{A.filYear}<input type="number" name="year" value={film.year ?? ''} /></label>
	<label>{A.filDirector}<input type="text" name="director" value={film.director ?? ''} /></label>
	<label>{A.filGenre}<input type="text" name="genre" value={film.genre ?? ''} /></label>
	<label>{A.filRuntime}<input type="number" name="runtime" value={film.runtime ?? ''} /></label>
	<label>{A.filPoster}<input type="text" name="poster" value={film.poster_url ?? ''} /></label>
	<label>{A.filNote}<input type="text" name="note" value={film.note ?? ''} maxlength="160" /></label>
	<div class="acts">
		<button type="button" class="tap" onclick={oncancel}>{A.filCancel}</button>
		<button class="tap go">{A.filSave}</button>
	</div>
</form>
