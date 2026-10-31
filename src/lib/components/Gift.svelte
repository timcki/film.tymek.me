<script lang="ts">
	/** §3.6: a present under the tree, in whatever paper and ribbon it was given */
	let {
		size = 30,
		paper = '#c8283a',
		ribbon = '#f2c14e'
	}: { size?: number; paper?: string; ribbon?: string } = $props();
</script>

<svg class="gift" width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
	<rect x="3" y="11" width="24" height="18" rx="1.4" fill={paper} />
	<rect class="shade" x="19" y="11" width="8" height="18" />
	<rect x="1.6" y="7.6" width="26.8" height="5" rx="1.2" fill={paper} />
	<rect class="lid" x="1.6" y="7.6" width="26.8" height="5" rx="1.2" />
	<rect x="13.2" y="7.6" width="3.6" height="21.4" fill={ribbon} />
	<path
		d="M15 7.6C12 3 7 2.9 7.6 6.1c.4 2 4.3 1.9 7.4 1.5zM15 7.6c3-4.6 8-4.7 7.4-1.5-.4 2-4.3 1.9-7.4 1.5z"
		fill={ribbon}
	/>
</svg>

<style>
	.gift {
		display: inline-block;
		overflow: visible;
		filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35));
	}
	.shade {
		fill: rgba(0, 0, 0, 0.14);
	}
	.lid {
		fill: rgba(0, 0, 0, 0.1);
	}
</style>
