<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { fade, fly } from 'svelte/transition';
	import { cubicIn, cubicOut } from 'svelte/easing';
	import Poster from '$lib/components/Poster.svelte';
	import { dictFor, type Lang } from '$lib/i18n';
	import { nomSheet } from '$lib/special-sheet.svelte';
	import { portal } from '$lib/portal';
	import { fitViewport } from '$lib/fit-viewport';

	/**
	 * The modal films are put up in, the list's and §3.6's special round's alike,
	 * opened from the + in the bar. A panel high on the screen rather than a sheet
	 * from the bottom: on a phone the keyboard leaves the search box and the first
	 * results in view, where a bottom sheet was shoved about by Safari scrolling
	 * the page to make room. The page says what it is for and how a nomination is
	 * sent; the search, the pick and the pitch are the same either way.
	 */
	let {
		lang,
		heading,
		hint,
		known,
		submit
	}: {
		lang: Lang;
		heading: string;
		hint: string;
		/** titles already up, lower-cased, which cannot be put up twice */
		known: Set<string>;
		/** the page's own form handling, told how to close the modal on success */
		submit: (close: () => void) => SubmitFunction;
	} = $props();

	const T = $derived(dictFor(lang));

	/* ------------------------------------------------------------- motion -- */

	// asked for less motion, every transition below takes no time at all
	const still =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const ms = (n: number) => (still ? 0 : n);

	/** the modal appears where it stands: a short rise, a touch of scale, a fade */
	function grow(node: HTMLElement, { out = false }: { out?: boolean } = {}) {
		return {
			duration: ms(out ? 140 : 200),
			easing: out ? cubicIn : cubicOut,
			css: (t: number, u: number) =>
				`transform: translateY(${u * 10}px) scale(${0.97 + 0.03 * t}); opacity: ${t};`
		};
	}

	/** the modal's contents arriving one after another, once it has room for them */
	const rise = (node: Element, i: number) =>
		fly(node, { y: 6, duration: ms(200), delay: ms(50 + i * 30), easing: cubicOut });

	/** focuses the search box as soon as the modal has grown into place */
	function focusSoon(node: HTMLInputElement) {
		const timer = setTimeout(() => node.focus({ preventScroll: true }), ms(120));
		return { destroy: () => clearTimeout(timer) };
	}

	/* -------------------------------------------------------------- search -- */

	type Result = {
		tmdbId: number | null;
		title: string;
		year: number | null;
		thumb: string | null;
		poster: string | null;
		overview: string;
	};

	let picked = $state<Result | null>(null);
	let query = $state('');
	let results = $state<Result[]>([]);
	let degraded = $state(false);
	let searching = $state(false);
	let timer: ReturnType<typeof setTimeout>;

	// every opening starts from an empty box
	$effect(() => {
		if (!nomSheet.open) return;
		picked = null;
		query = '';
		results = [];
	});

	function close() {
		nomSheet.open = false;
		picked = null;
	}

	// §8.2: one proxy, debounced, so typing is not a request per key
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
				degraded = Boolean(body.degraded);
			} catch {
				degraded = true;
				results = [];
			} finally {
				searching = false;
			}
		}, 250);
	}

	const byHand = (): Result => ({
		tmdbId: null,
		title: query.trim(),
		year: null,
		thumb: null,
		poster: null,
		overview: ''
	});
</script>

{#if nomSheet.open}
	<!-- under the bar (47) and over the page, so the + that opened the modal
	     stays sharp above the blur and is how it closes -->
	<button
		class="spveil"
		aria-label={T.close}
		onclick={close}
		in:fade={{ duration: ms(180) }}
		out:fade={{ duration: ms(140) }}
	></button>

	<!-- stays where Svelte expects it, while the modal moves above the look -->
	<div class="phost">
		<div
			class="spmodal"
			role="dialog"
			aria-modal="true"
			use:portal
			use:fitViewport
			aria-label={heading}
			in:grow
			out:grow={{ out: true }}
		>
			<h2 in:rise={0}>{heading}</h2>

			{#if picked}
				<form
					method="POST"
					action="?/nominate"
					use:enhance={submit(close)}
					in:fly={{ x: 24, duration: ms(200), easing: cubicOut }}
				>
					<input type="hidden" name="title" value={picked.title} />
					<input type="hidden" name="tmdbId" value={picked.tmdbId ?? ''} />
					<input type="hidden" name="year" value={picked.year ?? ''} />
					<input type="hidden" name="poster" value={picked.poster ?? ''} />
					<input type="hidden" name="overview" value={picked.overview} />
					<div class="crow">
						<div class="th"><Poster title={picked.title} url={picked.thumb} /></div>
						<div>
							<b>{picked.title}</b>
							<span>{picked.year ?? T.dEmpty}</span>
						</div>
					</div>
					<div class="nlabel">{T.noteQ}</div>
					<textarea class="nin" name="note" rows="3" maxlength="160" placeholder={T.notePh}
					></textarea>
					<div class="cbtns">
						<button type="button" onclick={() => (picked = null)}>{T.noteBack}</button>
						<button class="go">{T.noteConfirm}</button>
					</div>
				</form>
			{:else}
				<div in:fly={{ x: -24, duration: ms(200), easing: cubicOut }}>
					<div class="hintline" in:rise={1}>{degraded ? T.nomOffline : hint}</div>
					<input
						class="sinput"
						bind:value={query}
						oninput={onQuery}
						placeholder={T.nomPh}
						autocomplete="off"
						spellcheck="false"
						use:focusSoon
						in:rise={2}
					/>
					<div class="sres">
						{#if searching}
							<div class="hintline">{T.nomSearching}</div>
						{:else}
							{#each results as result, i (result.tmdbId)}
								{@const dup = known.has(result.title.toLowerCase())}
								<button
									class="r"
									disabled={dup}
									onclick={() => (picked = result)}
									in:fly={{ y: 8, duration: ms(240), delay: ms(i * 35) }}
								>
									<div class="th"><Poster title={result.title} url={result.thumb} /></div>
									<div class="m">
										<b>{result.title}</b>
										<span>{result.year ?? T.dEmpty}{dup ? ` · ${T.nomDup}` : ''}</span>
									</div>
								</button>
							{/each}
							{#if query.trim().length >= 2 && !results.length}
								<div class="hintline">{T.nomNone(query.trim())}</div>
							{/if}
							{#if query.trim().length >= 2}
								<button class="ghostbtn" onclick={() => (picked = byHand())}>
									{T.nomByHand(query.trim())}
								</button>
							{/if}
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
