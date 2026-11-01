<!-- five points as one glyph, off bananas: a hand of five of the very ticket
     Ticket.svelte draws, fanned from the one corner they are held by, the
     way a bunch is five bananas off one crown. The ones further back a shade
     darker so the hand has depth, and only the front one shows its face.
     Same paint, same rules as the single ticket -->
<script lang="ts">
	// back to front, the front one last and on top
	const hand = [-40, -30, -20, -10, 0];
	const body =
		'M3.5 6.5h17a1 1 0 0 1 1 1v2.4a2.1 2.1 0 0 0 0 4.2v2.4a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-2.4a2.1 2.1 0 0 0 0-4.2V7.5a1 1 0 0 1 1-1z';
</script>

<svg
	class="tickets"
	viewBox="-2 -5 26 24"
	width="1.35em"
	height="1.25em"
	style="display: block; stroke: var(--ticket-edge)"
	stroke-linejoin="round"
	stroke-linecap="round"
	aria-hidden="true"
>
	{#each hand as turn, i (turn)}
		<g transform="rotate({turn} 3 17)">
			<path style="fill: var(--ticket-paper)" stroke-width="1" d={body} />
			{#if turn === 0}
				<path fill="none" style="stroke: var(--ticket-mark)" stroke-width="1" stroke-dasharray="1.1 1.2" d="M16.6 8v8" />
				<path
					style="fill: var(--ticket-mark)"
					stroke="none"
					d="M9.2 9.1l.9 1.9 2 .2-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.2z"
				/>
			{:else}
				<path fill="#5a4046" stroke="none" opacity={Math.min(0.4, (hand.length - 1 - i) * 0.1)} d={body} />
			{/if}
		</g>
	{/each}
</svg>
