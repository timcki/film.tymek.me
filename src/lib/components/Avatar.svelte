<script lang="ts">
	import { levelOf } from '$lib/levels';

	/** a face: the uploaded picture if there is one, initials on their colour if not */
	let {
		name,
		colour,
		avatar = null,
		size = 19,
		font = 9,
		titled = true,
		xp = null,
		slim = false
	}: {
		name: string;
		colour: string;
		avatar?: string | null;
		size?: number;
		font?: number;
		/** off where something else already names the face, so the two do not stack up */
		titled?: boolean;
		/**
		 * when given, the face wears its rank as a ring. Pass it where a face has
		 * room to be looked at; the 16px pills stay bare so the backer row stays
		 * a row and not a jewellery box
		 */
		xp?: number | null;
		/** a quieter ring for faces resting on artwork: thinner band, less glow */
		slim?: boolean;
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

	const ring = $derived(xp === null ? null : levelOf(xp));
</script>

<span
	class="av {ring !== null ? `lv${ring}` : ''}"
	class:slim
	style="background:{colour};width:{size}px;height:{size}px;flex-basis:{size}px;font-size:{font}px;--ringw:{slim ? 1.5 : size >= 60 ? 3.5 : 2.5}px;--gapw:{slim ? 1 : size >= 60 ? 2 : 1.5}px"
	title={titled ? name : undefined}
>
	{#if avatar}
		<img src={avatar} alt="" loading="lazy" />
	{:else}
		{initials}
	{/if}
</span>
