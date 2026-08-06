<script module lang="ts">
	export type Picked = {
		tmdbId: number | null;
		title: string;
		year: number | null;
		poster: string | null;
		thumb: string | null;
		overview: string;
	};
</script>

<script lang="ts">
	import Poster from './Poster.svelte';

	/**
	 * §8.2: the same TMDB proxy the nomination box uses, with none of the rules
	 * around it. Picking hands the whole result back and clears the box.
	 */
	let {
		placeholder,
		byHandLabel,
		noResultsLabel,
		onpick
	}: {
		placeholder: string;
		byHandLabel: string;
		noResultsLabel: string;
		onpick: (film: Picked) => void;
	} = $props();

	let query = $state('');
	let results = $state<Picked[]>([]);
	let searching = $state(false);
	let timer: ReturnType<typeof setTimeout>;

	function onQuery() {
		clearTimeout(timer);
		const q = query.trim();
		if (q.length < 2) {
			results = [];
			searching = false;
			return;
		}
		searching = true;
		timer = setTimeout(async () => {
			try {
				const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
				const body = await response.json();
				results = body.results ?? [];
			} catch {
				results = [];
			} finally {
				searching = false;
			}
		}, 250);
	}

	function take(film: Picked) {
		onpick(film);
		query = '';
		results = [];
	}

	/** a title TMDB does not have is still a title worth writing down */
	const byHand = (): Picked => ({
		tmdbId: null,
		title: query.trim(),
		year: null,
		poster: null,
		thumb: null,
		overview: ''
	});
</script>

<input class="sinput" {placeholder} bind:value={query} oninput={onQuery} autocomplete="off" />

{#if results.length}
	<div class="hits">
		{#each results as result (result.tmdbId)}
			<button type="button" class="hit" onclick={() => take(result)}>
				<span class="hth"><Poster title={result.title} url={result.thumb} /></span>
				<span class="hname">
					<b>{result.title}</b>
					<small>{result.year ?? ''}</small>
				</span>
			</button>
		{/each}
	</div>
{:else if query.trim().length >= 2 && !searching}
	<p class="ahint">
		{noResultsLabel}
		<button type="button" class="linky" onclick={() => take(byHand())}>{byHandLabel}</button>
	</p>
{/if}

<style>
	.hits {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 6px 0;
	}
	.hit {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 7px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--card);
		text-align: left;
		cursor: pointer;
		color: inherit;
		font: inherit;
	}
	.hit:hover {
		border-color: var(--accent);
	}
	.hth {
		width: 26px;
		flex: 0 0 26px;
	}
	.hname {
		display: flex;
		flex-direction: column;
		line-height: 1.25;
	}
	.hname small {
		color: var(--dim);
		font-size: 11px;
	}
	.linky {
		background: none;
		border: 0;
		padding: 0;
		color: var(--accent);
		cursor: pointer;
		font: inherit;
		text-decoration: underline;
	}
</style>
