<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import Avatar from '$lib/components/Avatar.svelte';
	import Poster from '$lib/components/Poster.svelte';
	import { formatDay } from '$lib/datetime';
	import { fitViewport } from '$lib/fit-viewport';
	import { dictFor, fmtScore, isVotes } from '$lib/i18n';
	import { portal } from '$lib/portal';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const T = $derived(dictFor(data.lang));
	const votes = $derived(isVotes(data.rules));

	let openId = $state<number | null>(null);
	const detail = $derived(data.watched.find((film) => film.id === openId) ?? null);
	const still =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
</script>

{#snippet facePill(face: { name: string; colour: string; avatar: string | null })}
	<span class="bk face">
		<Avatar name={face.name} colour={face.colour} avatar={face.avatar} size={16} font={8} titled={false} />
		<b>{face.name}</b>
	</span>
{/snippet}

<div class="wgrid">
	{#each data.watched as film (film.id)}
		<button class="wcard" type="button" onclick={() => (openId = film.id)}>
			{#if film.poster_url}
				<img src={film.poster_url} alt="" loading="lazy" />
			{:else}
				<div class="noimg"></div>
			{/if}
			<div class="lb">
				<b>{film.title}</b>
				{T.evening(film.evening)}
				{#if film.outing}· {T.outing(film.outing)}{/if}
				{#if film.final_score !== null}
					· {fmtScore(film.final_score)}
					{T.unit(film.final_score, votes)}
				{/if}
			</div>
		</button>
	{:else}
		<div class="empty" style="grid-column:1/-1">{T.seenEmpty}</div>
	{/each}
</div>

<!-- the same modal the list opens a film in, with what there is to say once it is watched -->
{#if detail}
	<button
		class="dveil"
		aria-label={T.close}
		onclick={() => (openId = null)}
		transition:fade={{ duration: still ? 0 : 160 }}
	></button>
	<div class="phost">
		<div
			class="dsheet dmodal"
			role="dialog"
			aria-modal="true"
			aria-label={detail.title}
			use:portal
			use:fitViewport
			transition:scale={{ start: 0.96, duration: still ? 0 : 180 }}
		>
			<div class="dxrow">
				<button class="dx" type="button" aria-label={T.close} onclick={() => (openId = null)}>
					<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" /></svg>
				</button>
			</div>
			<div class="inner">
				<div class="dblock dtop">
					<div class="dhero">
						<div class="p"><Poster title={detail.title} url={detail.poster_url} /></div>
						<div class="dh">
							<h2>{detail.title}</h2>
							<div class="yr">{[detail.year, detail.director].filter(Boolean).join(' · ')}</div>
						</div>
					</div>
					<div class="dmeta">
						<span class="mchip">{T.evening(detail.evening)} · {formatDay(detail.at, data.lang)}</span>
						{#if detail.outing}<span class="mchip">{T.outing(detail.outing)}</span>{/if}
						{#if detail.genre}<span class="mchip">{detail.genre}</span>{/if}
						{#if detail.runtime}<span class="mchip">{T.minutes(detail.runtime)}</span>{/if}
						{#if detail.final_score !== null}
							<span class="mchip">{fmtScore(detail.final_score)} {T.unit(detail.final_score, votes)}</span>
						{/if}
					</div>
				</div>

				{#if detail.note}
					<div class="dblock pitch">
						<div class="dnote">“{detail.note}”<span class="sig">{T.noteSig(detail.added_by_name)}</span></div>
					</div>
				{/if}

				{#if detail.overview}
					<div class="dblock"><p class="over">{detail.overview}</p></div>
				{/if}

				<div class="dblock">
					<div class="dsec">
						<div class="drow"><span class="dlab">{T.dAdded}</span></div>
						<div class="dpeople">{@render facePill(detail.added_by_face)}</div>
					</div>
					<!-- an outing or a night from before the app had no ballots, so nobody to name -->
					{#if detail.backers.length}
						<div class="dsec">
							<div class="drow"><span class="dlab">{T.dBacked}</span></div>
							<div class="dpeople">
								{#each detail.backers as backer (backer.id)}
									{@render facePill(backer)}
								{/each}
							</div>
						</div>
					{/if}
				</div>

				{#if detail.tmdb_id}
					<p class="dlink">
						<a href="https://www.themoviedb.org/movie/{detail.tmdb_id}" target="_blank" rel="noopener noreferrer"
							>{T.tmdbLink} ↗</a
						>
					</p>
				{/if}
			</div>
		</div>
	</div>
{/if}

<svelte:window onkeydown={(event) => event.key === 'Escape' && (openId = null)} />
