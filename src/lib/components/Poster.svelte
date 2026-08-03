<script lang="ts">
	/** a poster, or the film's initials when TMDB had nothing */
	let { title, url = null }: { title: string; url?: string | null } = $props();

	const initials = $derived(
		title
			.replace(/^(the|a|an|le|la)\s+/i, '')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((word) => word[0])
			.join('')
			.toUpperCase()
	);
</script>

{#if url}
	<img src={url} alt="" loading="lazy" />
{:else}
	<span class="ph">{initials}</span>
{/if}
