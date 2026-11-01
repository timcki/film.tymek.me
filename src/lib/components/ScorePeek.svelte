<script module lang="ts">
	/**
	 * A film's score, opened up: what it is now and where it lands next week if
	 * nobody votes, then the weeks it was made of, newest first, each as the
	 * points put in that week, what they are still worth and what that adds.
	 * Everything already said in the reader's language by the page.
	 */
	export type ScoreRow = {
		/** "this week", "last week", "3 weeks ago" */
		label: string;
		points: number;
		/** what a point from then is still worth, "50%" */
		worth: string;
		/** what the week adds to the score, formatted */
		adds: string;
	};
	export type ScorePop = {
		score: string;
		unit: string;
		next: string;
		rows: ScoreRow[];
		/** what the weeks too old to matter still add together, or null */
		older: string | null;
		note: string;
		x: number;
		y: number;
		below: boolean;
		tap: boolean;
	};
	/** its width; the clamp needs it before the popup has been laid out */
	export const SCORE_W = 292;
</script>

<script lang="ts">
	import Banana from './Banana.svelte';
	import BananaBunch from './BananaBunch.svelte';
	import Ticket from './Ticket.svelte';
	import TicketStack from './TicketStack.svelte';
	import { dictFor, type Lang } from '$lib/i18n';
	import { grow } from '$lib/pop-grow';
	import { untrack } from 'svelte';

	let {
		pop,
		lang,
		marks,
		onclose
	}: { pop: ScorePop; lang: Lang; marks: 'banana' | 'ticket'; onclose: () => void } = $props();

	const T = $derived(dictFor(lang));
	// what it shows, held: on the way out the page has already let go of it,
	// and the card still has to draw itself while it folds away
	let shown = $state(untrack(() => pop));
	$effect.pre(() => {
		if (pop) shown = pop;
	});
</script>

{#if shown.tap}
	<button class="menu-backdrop" aria-label={T.close} onclick={onclose}></button>
{/if}

<div
	class="fpeek"
	class:below={shown.below}
	style="left:{shown.x}px;top:{shown.y}px;--pw:{SCORE_W}px"
	role="tooltip"
>
	<div
		class="bkpop fpcard scard"
		in:grow={{ below: shown.below }}
		out:grow={{ below: shown.below, out: true }}
	>
		<!-- the two numbers that matter: now, and next week if nothing changes -->
		<div class="schead">
			<b>{shown.score}<small>{shown.unit}</small></b>
			<span class="snext">→ ≈ {shown.next} <i>{T.scoreNext.toLowerCase()}</i></span>
		</div>
		<div class="sweeks">
			{#each shown.rows as row (row.label)}
				<div class="sweek">
					<span class="swhen">{row.label}</span>
					<i class="fpmarks" aria-label={String(row.points)}>
						{#each Array(Math.floor(row.points / 5)) as _, k (k)}
							<i class="five"
								>{#if marks === 'banana'}<BananaBunch />{:else}<TicketStack />{/if}</i
							>
						{/each}
						{#each Array(row.points % 5) as _, k (k)}
							<i>{#if marks === 'banana'}<Banana />{:else}<Ticket />{/if}</i>
						{/each}
					</i>
					<span class="sworth">{row.worth}</span>
					<b class="sadds">{row.adds}</b>
				</div>
			{/each}
			{#if shown.older}
				<div class="sweek older">
					<span class="swhen">{T.scoreOlder}</span>
					<span class="sworth"></span>
					<b class="sadds">{shown.older}</b>
				</div>
			{/if}
		</div>
		<span class="snote">{shown.note}</span>
	</div>
</div>
