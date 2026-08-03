<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const rules = $derived(data.rules);
	const single = $derived(rules.pointsPerWeek === 1 && !rules.banking);
	const left = $derived(data.me ? data.me.budget - data.me.spent : 0);

	type Result = {
		tmdbId: number;
		title: string;
		year: number | null;
		thumb: string | null;
		poster: string | null;
		overview: string;
	};

	let query = $state('');
	let results = $state<Result[]>([]);
	let degraded = $state(false);
	let searching = $state(false);
	let picked = $state<Result | null>(null);

	let timer: ReturnType<typeof setTimeout>;
	function onQuery() {
		clearTimeout(timer);
		picked = null;
		const q = query.trim();
		if (q.length < 2) {
			results = [];
			return;
		}
		timer = setTimeout(async () => {
			searching = true;
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

	function initials(name: string) {
		return name
			.split(' ')
			.map((part) => part[0])
			.join('')
			.slice(0, 2);
	}
</script>

<h1>The list</h1>

{#if form?.message}
	<p class="toast">{form.message}</p>
{/if}

{#if data.me}
	<div class="card">
		<div>
			<strong>{left}</strong> of {data.me.budget} points left
			{#if rules.banking}<span class="notice">(bank, cap {rules.bankCap})</span>{/if}
		</div>
		<div class="meta">
			{#if data.me.nominatedThisWeek}
				nomination used on <strong>{data.me.nominatedThisWeek.title}</strong>
			{:else}
				you still have a nomination this week
			{/if}
		</div>
	</div>
{/if}

{#if data.week?.status === 'runoff'}
	<p class="card">
		The week ended in a tie. Open <a href="/f/{data.runoffCode}">the runoff</a> to break it.
	</p>
{/if}

{#each data.films as film (film.id)}
	<div class="card film">
		{#if film.poster_url}<img src={film.poster_url} alt="" />{/if}
		<div class="body">
			<div class="title">
				{film.title}{#if film.year}<span class="meta"> ({film.year})</span>{/if}
			</div>
			<div class="meta">
				{#if film.director}{film.director} · {/if}added by {film.addedByName} in week {film.added_week}
			</div>

			{#if film.campaignWeeks >= 3}
				<span class="badge">{film.campaignWeeks}-week campaign</span>
			{/if}
			{#if film.atRisk}
				<span class="badge warn">
					{rules.attrition.kind === 'archive' ? 'fades soon' : 'drops on Thursday'}
				</span>
			{/if}

			{#if film.backers.length}
				<div class="avatars">
					{#each film.backers as backer (backer.person_id)}
						<span
							class="avatar"
							style="background:{backer.colour}"
							title="{backer.name}: {backer.points}">{initials(backer.name)}</span
						>
					{/each}
				</div>
			{/if}

			<form method="POST" action="?/setPoints" use:enhance class="stepper">
				<input type="hidden" name="filmId" value={film.id} />
				{#if single}
					<button
						class:primary={!film.myPoints}
						name="points"
						value={film.myPoints ? 0 : 1}
						disabled={data.week?.status !== 'open' || (!film.myPoints && left < 1)}
					>
						{film.myPoints ? 'take my vote back' : 'vote'}
					</button>
				{:else}
					<button name="points" value={Math.max(0, film.myPoints - 1)} disabled={!film.myPoints}
						>−</button
					>
					<strong style="min-width:1.5rem;text-align:center">{film.myPoints}</strong>
					<button
						name="points"
						value={film.myPoints + 1}
						disabled={data.week?.status !== 'open' || left < 1}>+</button
					>
				{/if}
			</form>
		</div>
		<div class="score">{film.score}</div>
	</div>
{:else}
	<p class="notice">Nothing on the list yet. Nominate something.</p>
{/each}

<h2>Nominate</h2>
{#if data.me?.nominatedThisWeek}
	<p class="notice">You have used your nomination this week.</p>
{:else}
	<div class="card">
		<input
			placeholder="search TMDB, or just type a title"
			bind:value={query}
			oninput={onQuery}
			autocomplete="off"
		/>
		{#if searching}<p class="notice">searching…</p>{/if}
		{#if degraded}
			<p class="notice">couldn't reach TMDB, but you can still type a title by hand</p>
		{/if}

		{#each results as result (result.tmdbId)}
			<button
				class="big-choice"
				style="margin-top:8px"
				onclick={() => {
					picked = result;
					query = result.title;
					results = [];
				}}
			>
				{result.title}{#if result.year} ({result.year}){/if}
			</button>
		{/each}

		<form method="POST" action="?/nominate" use:enhance style="margin-top:10px">
			<input type="hidden" name="title" value={picked?.title ?? query} />
			<input type="hidden" name="tmdbId" value={picked?.tmdbId ?? ''} />
			<input type="hidden" name="year" value={picked?.year ?? ''} />
			<input type="hidden" name="poster" value={picked?.poster ?? ''} />
			<input type="hidden" name="overview" value={picked?.overview ?? ''} />
			<button class="primary" disabled={!query.trim() || data.week?.status !== 'open'}>
				nominate {picked ? picked.title : query.trim()}
			</button>
		</form>
	</div>
{/if}

{#if data.archived.length || data.dropped.length}
	<details>
		<summary>Archived and dropped ({data.archived.length + data.dropped.length})</summary>
		{#each data.archived as film (film.id)}
			<div class="card film">
				<div class="body">
					<div class="title">{film.title}</div>
					<div class="meta">archived; a single vote brings it back</div>
					<form method="POST" action="?/setPoints" use:enhance class="stepper">
						<input type="hidden" name="filmId" value={film.id} />
						<button name="points" value="1" disabled={left < 1}>revive with a point</button>
					</form>
				</div>
			</div>
		{/each}
		{#each data.dropped as film (film.id)}
			<div class="card film">
				<div class="body">
					<div class="title">{film.title}</div>
					<div class="meta">dropped after week {film.added_week}</div>
					<form method="POST" action="?/renominate" use:enhance class="stepper">
						<input type="hidden" name="filmId" value={film.id} />
						<button disabled={Boolean(data.me?.nominatedThisWeek)}>re-nominate</button>
					</form>
				</div>
			</div>
		{/each}
	</details>
{/if}

{#if data.watched.length}
	<details>
		<summary>Recently watched</summary>
		{#each data.watched as film}
			<div class="card">
				<strong>{film.title}</strong>
				<span class="meta">week {film.watched_week} · final score {film.final_score}</span>
			</div>
		{/each}
		<p><a href="/history">full history</a></p>
	</details>
{/if}

<details>
	<summary>How this works ({rules.label})</summary>
	<ul class="notice">
		<li>Everyone gets {rules.pointsPerWeek} point{rules.pointsPerWeek === 1 ? '' : 's'} a week.</li>
		{#if rules.banking}
			<li>Unspent points bank, up to {rules.bankCap}.</li>
		{:else}
			<li>Points do not carry over.</li>
		{/if}
		{#if rules.scoring === 'total'}
			<li>A film's score is every point ever placed on it.</li>
		{:else}
			<li>
				A film's score is this week's points plus {rules.decayFactor} of last week's. Older points count
				for nothing, so the list keeps moving. Point supply shrinks when fewer people vote, which lets
				last week's leader win by inertia. Known, and accepted.
			</li>
		{/if}
		{#if rules.attrition.kind === 'archive'}
			<li>
				A film with no points for {rules.attrition.afterWeeksAtZero} weeks is archived. One vote brings
				it back.
			</li>
		{:else}
			<li>
				A film with no points for {rules.attrition.afterWeeksWithoutPoints}
				week{rules.attrition.afterWeeksWithoutPoints === 1 ? '' : 's'} is dropped, including a brand-new
				nomination nobody voted for. Re-nominating costs your nomination for that week.
			</li>
		{/if}
		<li>One nomination each per week. The highest score on Thursday at 20:00 is what we watch.</li>
		<li>A tie is broken in the room, by whoever turned up.</li>
	</ul>
</details>
