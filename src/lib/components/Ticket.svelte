<!-- a point, off bananas: a paper cinema ticket, admit one, with a star on its
     face and a torn-off line to its stub. Paper, with its star and tear line
     in the accent's rose; its colours are the --ticket-* tokens, one set
     per palette, so it stays crisp on the dark as well as on paper.
     Tilted, so a row of them reads as handed out rather than filed, and sized
     by font-size like the banana it stands in for. The paint is inline rather
     than in a style block, so no rule written for a dot's own svg reaches it -->
<svg
	class="ticket"
	viewBox="0.6 3.2 22.8 17.6"
	width="1.3em"
	height="1em"
	style="display: block; stroke: var(--ticket-edge)"
	stroke-linejoin="round"
	stroke-linecap="round"
	aria-hidden="true"
>
	<g transform="rotate(-18 12 12)">
		<path
			style="fill: var(--ticket-paper)"
			stroke-width="1"
			d="M3.5 6.5h17a1 1 0 0 1 1 1v2.4a2.1 2.1 0 0 0 0 4.2v2.4a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-2.4a2.1 2.1 0 0 0 0-4.2V7.5a1 1 0 0 1 1-1z"
		/>
		<!-- its lower edge in shade, so it has a thickness -->
		<path style="fill: var(--ticket-shade)" stroke="none" d="M3 15.4h18v1.1a.6.6 0 0 1-.6.6H3.6a.6.6 0 0 1-.6-.6z" />
		<path fill="none" style="stroke: var(--ticket-mark)" stroke-width="1" stroke-dasharray="1.1 1.2" d="M16.6 8v8" />
		<path
			style="fill: var(--ticket-mark)"
			stroke="none"
			d="M9.2 9.1l.9 1.9 2 .2-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.2z"
		/>
	</g>
</svg>
