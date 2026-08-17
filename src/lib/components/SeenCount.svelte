<script lang="ts">
	/** the rewatch factor: the same eye as the card footer, with a headcount */
	let { n, size = 13 }: { n: number; size?: number } = $props();
</script>

<span class="seencount">
	<svg
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
		<circle cx="12" cy="12" r="3" />
	</svg>
	{n}
</span>

<style>
	.seencount {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	svg {
		flex: 0 0 auto;
	}
</style>
