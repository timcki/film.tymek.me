<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import { formatNight } from '$lib/datetime';
	import { adminDict } from '$lib/i18n.admin';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const A = $derived(adminDict(data.lang));
	const when = (at: string) => formatNight(at, data.lang);
	const share = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

	const left = $derived(data.people.reduce((sum, p) => sum + Math.max(0, p.budget - p.spent), 0));
	const total = $derived(data.people.reduce((sum, p) => sum + p.budget, 0));
</script>

<h2 class="ah">{A.ptsH}</h2>
<p class="ahint">{A.ptsIntro}</p>

{#if data.week}
	<p class="ahint">{A.ptsClosing(when(data.week.closesAt))} {A.ptsLeft(left, total)}</p>
	{#if data.week.special}<p class="ahint">{A.ptsSleeps}</p>{/if}
{/if}

{#each data.people as person (person.id)}
	<div class="prow" class:off={person.spent === 0}>
		<div class="pwho">
			<Avatar name={person.name} colour={person.colour} avatar={person.avatar} size={34} font={13} />
			<div class="pnames">
				<b>{person.name}</b>
				<span class="pmeta">
					{person.nominated ? A.ptsNominated(person.nominated) : A.ptsNoNomination} ·
					{person.last ? A.ptsLast(when(person.last)) : A.ptsNeverVoted}
				</span>
			</div>
			<span class="pspend">{person.spent}/{person.budget} {A.ptsUnit}</span>
		</div>
		<div class="spmeter"><i style:width="{share(Math.min(person.spent, person.budget), person.budget)}%"></i></div>
		{#if person.films.length}
			<p class="spfilms">
				{#each person.films as film, i}{i ? ' · ' : ''}{film.title} <b>{film.points}</b>{/each}
			</p>
		{/if}
	</div>
{/each}
