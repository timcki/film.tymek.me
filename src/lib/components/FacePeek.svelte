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
	};

	/** width of .bkpop; the clamp needs it before the popup has been laid out */
	export const PEEK_W = 156;
	/** roughly its height, only ever used to decide whether it still fits above */
	export const PEEK_H = 190;
	/** what each row under the sub line costs it */
	export const PEEK_ROW = 17;

	/** where a fixed popup of the given size lands, clamped to the viewport */
	export function anchorAt(el: HTMLElement, w: number, h: number) {
		const box = el.getBoundingClientRect();
		const half = w / 2;
		const below = box.top < h;
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
		rows: PeekRow[] = []
	): Peek | null {
		if (!(el instanceof HTMLElement)) return null;
		return { face, sub, rows, tap, ...anchorAt(el, PEEK_W, PEEK_H + rows.length * PEEK_ROW) };
	}
</script>

<script lang="ts">
	import Avatar from './Avatar.svelte';
	import { dictFor } from '$lib/i18n';
	import type { Lang } from '$lib/i18n';
	import { levelOf } from '$lib/levels';

	let { peek, lang, onclose }: { peek: Peek; lang: Lang; onclose: () => void } = $props();

	const T = $derived(dictFor(lang));
	const level = $derived(levelOf(peek.face.xp));
</script>

{#if peek.tap}
	<!-- only a tap needs one; on a hover pointer it would swallow the pointerleave -->
	<button class="menu-backdrop" aria-label={T.close} onclick={onclose}></button>
{/if}

<div class="bkpop" class:below={peek.below} style="left:{peek.x}px;top:{peek.y}px" role="tooltip">
	<Avatar
		name={peek.face.name}
		colour={peek.face.colour}
		avatar={peek.face.avatar}
		size={116}
		font={40}
		titled={false}
		xp={peek.face.xp}
	/>
	<b>{peek.face.name}</b>
	<span class="bktitle lv{level}">{T.levels[level]}</span>
	{#if peek.sub}<span>{peek.sub}</span>{/if}
	<!-- the total above, and under it whatever it was actually made of -->
	{#if peek.rows.length}
		<div class="bkweeks">
			{#each peek.rows as row (row.label)}
				<div class="srow">
					<span>{row.label}</span>
					<b>{row.value}</b>
				</div>
			{/each}
		</div>
	{/if}
</div>
