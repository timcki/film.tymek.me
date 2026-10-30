<!-- five points as one glyph: a hand of five of the very banana Banana.svelte
     draws, fanned out of one shared crown, the ones further back a shade
     darker so the hand has depth rather than a tangle of outlines. Same paint,
     same rules as the single banana: attributes, not a style block, and sized
     by font-size -->
<script lang="ts">
	// back to front: the outer fruit first, the middle one last and in front
	const hand = [
		{ turn: 40, depth: 2 },
		{ turn: -34, depth: 2 },
		{ turn: 20, depth: 1 },
		{ turn: -16, depth: 1 },
		{ turn: 2, depth: 0 }
	];
	const body =
		'M4.7 7.4C2.8 14.6 7.6 21 15 20.4 18.6 20.1 20.8 17.6 21.5 14.8L20.7 13.6C17 14.6 12.8 13.6 10.6 11 9.4 9.6 9 8.4 9 7.2Z';
</script>

<svg
	class="bunch"
	viewBox="-1 -1 27 27"
	width="1.25em"
	height="1.25em"
	stroke="#5a2a10"
	stroke-linejoin="round"
	stroke-linecap="round"
	aria-hidden="true"
	style="display: block"
>
	{#each hand as { turn, depth } (turn)}
		<g transform="rotate({turn} 7 5)">
			<path fill="#ffd43b" stroke-width="0.9" d={body} />
			<path
				fill="#f5a524"
				stroke="none"
				d="M5.1 8.4C3.9 14.6 8.4 20.1 15 19.7 18.2 19.4 20.1 17.5 20.9 15.6 17.6 17.8 12 17.8 8.8 15 6.6 13 5.8 10.6 6 8.4Z"
			/>
			{#if depth === 0}
				<path fill="none" stroke="#fff6cf" stroke-width="1.2" d="M10.2 10.4Q11.6 12.6 14.4 13.6" />
			{:else}
				<path fill="#5a2a10" stroke="none" opacity={depth * 0.13} d={body} />
			{/if}
			<path fill="#86a321" stroke-width="0.8" d="M20.7 13.6 22.3 13.1 22.7 14.6 21.5 14.8Z" />
		</g>
	{/each}
	<!-- the one crown they all grow from -->
	<path fill="#86a321" stroke-width="0.9" d="M4.6 7.6 5.6 3 9.4 3.2 9.4 7.6Z" />
	<path fill="#5a2a10" stroke="none" d="M5.4 2.1Q7.4 1 9.6 2.1L9.3 3.6 5.7 3.4Z" />
</svg>
