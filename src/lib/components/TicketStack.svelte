<script lang="ts">
	/**
	 * Five points as one glyph, off bananas: a little fan of tickets, the way a
	 * bunch is five bananas. Sized by font-size and painted in currentColor,
	 * the ones behind a shade quieter so the fan has depth
	 */
	const ticket =
		'M3 1h18a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V3a2 2 0 0 1 2-2zM16.4 3.2h1.2v1.6h-1.2zM16.4 6.2h1.2v1.6h-1.2zM16.4 9.2h1.2v1.6h-1.2zM16.4 12.2h1.2v1.6h-1.2z';
</script>

<svg
	class="tickets"
	viewBox="-4 -6 32 26"
	width="1.6em"
	height="1.3em"
	aria-hidden="true"
	style="display: block"
>
	{#each [[-16, 0.45], [-8, 0.7], [0, 1]] as [turn, shade] (turn)}
		<path
			fill="currentColor"
			fill-rule="evenodd"
			opacity={shade}
			transform="rotate({turn} 12 16)"
			d={ticket}
		/>
	{/each}
	<text x="7.5" y="11.6" font-size="8" font-weight="800" fill="var(--accent-ink, #000)">5</text>
</svg>
