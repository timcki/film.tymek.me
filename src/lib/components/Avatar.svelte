<script lang="ts">
	/** a face: the uploaded picture if there is one, initials on their colour if not */
	let {
		name,
		colour,
		avatar = null,
		size = 19,
		font = 9
	}: {
		name: string;
		colour: string;
		avatar?: string | null;
		size?: number;
		font?: number;
	} = $props();

	const initials = $derived(
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0])
			.join('')
			.toUpperCase()
	);
</script>

<span
	class="av"
	style="background:{colour};width:{size}px;height:{size}px;flex-basis:{size}px;font-size:{font}px"
	title={name}
>
	{#if avatar}
		<img src={avatar} alt="" loading="lazy" />
	{:else}
		{initials}
	{/if}
</span>
