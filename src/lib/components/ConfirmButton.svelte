<script lang="ts">
	/**
	 * A submit button for what cannot be taken back: the first tap only arms it
	 * and says so, the second submits. Left armed, it relaxes on its own.
	 */
	let { label, sure, small = false }: { label: string; sure: string; small?: boolean } = $props();

	let armed = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function tap(event: MouseEvent) {
		if (armed) return;
		event.preventDefault();
		armed = true;
		clearTimeout(timer);
		timer = setTimeout(() => (armed = false), 3000);
	}

	$effect(() => () => clearTimeout(timer));
</script>

<button class={small ? 'cdel' : 'tap bad'} class:armed onclick={tap}>{armed ? sure : label}</button>
