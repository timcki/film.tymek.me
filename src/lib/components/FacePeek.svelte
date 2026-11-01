<script module lang="ts">
	/**
	 * The portrait that opens off a face anywhere in the app: the picture at a
	 * size worth looking at, the name, the rank the ring is drawn from, and a
	 * line or a short table of whatever the face was standing for where it was
	 * tapped. Shared, so a face on the list and a face in a chart open the same
	 * thing rather than two near-identical ones.
	 */
	export type PeekFace = { name: string; colour: string; avatar: string | null; xp: number };
	/** the rows under the sub line; both halves already said in the reader's language */
	export type PeekRow = { label: string; value: string };

	export type Peek = {
		face: PeekFace;
		/** empty where the popup is only being asked who somebody is */
		sub: string;
		/** empty for a face that is not counting anything, like a nominator */
		rows: PeekRow[];
		x: number;
		y: number;
		below: boolean;
		/** a finger opened it, so it needs a backdrop to dismiss against */
		tap: boolean;
		/** the rows' values are points, drawn as the marks the app counts them in */
		marks?: 'banana' | 'ticket';
	};

	/** width of .fpeek; the clamp needs it before the popup has been laid out */
	export const PEEK_W = 216;
	/** roughly its height, only ever used to decide whether it still fits above */
	export const PEEK_H = 104;
	/** what each row under the sub line costs it */
	export const PEEK_ROW = 17;

	/** where a fixed popup of the given size lands, clamped to the viewport */
	export function anchorAt(el: HTMLElement, w: number, h: number) {
		const box = el.getBoundingClientRect();
		const half = w / 2;
		// the sticky bar takes the top of the screen: there is only room above
		// the face if there is room under the bar
		const bar = document.querySelector('header.lean')?.getBoundingClientRect().bottom ?? 0;
		const below = box.top - bar < h + 12;
		return {
			// clamped, or the pills at either end of the row get sliced by the viewport
			x: Math.min(Math.max(box.left + box.width / 2, half + 8), window.innerWidth - half - 8),
			y: below ? box.bottom : box.top,
			below
		};
	}

	/**
	 * The popup a face should open, or null when whatever was hovered is not an
	 * element. Each row costs it a line, and the guess at its height is what
	 * decides whether it can still open upwards.
	 */
	export function peekFor(
		el: EventTarget | null,
		face: PeekFace,
		sub: string,
		tap: boolean,
		rows: PeekRow[] = [],
		marks?: 'banana' | 'ticket'
	): Peek | null {
		if (!(el instanceof HTMLElement)) return null;
		return {
			face,
			sub,
			rows,
			tap,
			marks,
			...anchorAt(el, PEEK_W, PEEK_H + rows.length * PEEK_ROW)
		};
	}
</script>

<script lang="ts">
	import Avatar from './Avatar.svelte';
	import Banana from './Banana.svelte';
	import BananaBunch from './BananaBunch.svelte';
	import Ticket from './Ticket.svelte';
	import TicketStack from './TicketStack.svelte';
	import { dictFor } from '$lib/i18n';
	import type { Lang } from '$lib/i18n';
	import { levelOf } from '$lib/levels';
	import { grow } from '$lib/pop-grow';
	import { untrack } from 'svelte';

	let { peek, lang, onclose }: { peek: Peek; lang: Lang; onclose: () => void } = $props();

	const T = $derived(dictFor(lang));
	// what it shows, held: on the way out the page has already let go of the
	// peek, and the card still has to draw itself while it folds away
	let shown = $state(untrack(() => peek));
	$effect.pre(() => {
		if (peek) shown = peek;
	});
	const level = $derived(levelOf(shown.face.xp));

</script>

{#if shown.tap}
	<!-- only a tap needs one; on a hover pointer it would swallow the pointerleave -->
	<button class="menu-backdrop" aria-label={T.close} onclick={onclose}></button>
{/if}

<!-- the outer box only stands at the face; the card inside it is what moves -->
<div class="fpeek" class:below={shown.below} style="left:{shown.x}px;top:{shown.y}px" role="tooltip">
	<div class="bkpop fpcard" in:grow={{ below: shown.below }} out:grow={{ below: shown.below, out: true }}>
		<div class="fphead">
			<span class="fpface">
				<Avatar
					name={shown.face.name}
					colour={shown.face.colour}
					avatar={shown.face.avatar}
					size={56}
					font={20}
					titled={false}
					xp={shown.face.xp}
				/>
			</span>
			<div class="fpwho">
				<b>{shown.face.name}</b>
				<span class="bktitle lv{level}">{T.levels[level]}</span>
			</div>
		</div>
		{#if shown.sub}<span class="fpsub">{shown.sub}</span>{/if}
		<!-- the total above, and under it whatever it was actually made of -->
		{#if shown.rows.length}
			<div class="bkweeks">
				{#each shown.rows as row (row.label)}
					<div class="srow">
						<span>{row.label}</span>
						{#if shown.marks}
							{@const n = Number(row.value)}
							<!-- the week's points as points, every five one mark -->
							<i class="fpmarks" aria-label={row.value}>
								{#each Array(Math.floor(n / 5)) as _, k (k)}
									<i class="five"
										>{#if shown.marks === 'banana'}<BananaBunch />{:else}<TicketStack />{/if}</i
									>
								{/each}
								{#each Array(n % 5) as _, k (k)}
									<i>{#if shown.marks === 'banana'}<Banana />{:else}<Ticket />{/if}</i>
								{/each}
							</i>
						{:else}
							<b>{row.value}</b>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
