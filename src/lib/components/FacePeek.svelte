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
	import { cubicIn } from 'svelte/easing';
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

	// the card grows out of the face it was opened from, with a little give at
	// the end, and folds back into it on the way out. A transition rather than
	// a keyframe so the way out can play before it is gone
	const still = () =>
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	function grow(_: Element, { out = false }: { out?: boolean } = {}) {
		if (still()) return { duration: 0 };
		return out
			? {
					duration: 130,
					easing: cubicIn,
					css: (t: number) =>
						`opacity:${t};transform:translateY(${(1 - t) * (shown.below ? -4 : 4)}px) scale(${0.92 + 0.08 * t})`
				}
			: {
					duration: 240,
					// overshoots a touch, then settles
					easing: (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
					css: (t: number) =>
						`opacity:${Math.min(1, t * 1.6)};transform:translateY(${(1 - t) * (shown.below ? -8 : 8)}px) scale(${0.82 + 0.18 * t})`
				};
	}
</script>

{#if shown.tap}
	<!-- only a tap needs one; on a hover pointer it would swallow the pointerleave -->
	<button class="menu-backdrop" aria-label={T.close} onclick={onclose}></button>
{/if}

<!-- the outer box only stands at the face; the card inside it is what moves -->
<div class="fpeek" class:below={shown.below} style="left:{shown.x}px;top:{shown.y}px" role="tooltip">
	<div class="bkpop fpcard" in:grow out:grow={{ out: true }}>
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
						<b>{row.value}</b>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
