<script lang="ts">
	/**
	 * A submit button for what cannot be taken back: the first tap only arms it
	 * and says so, the second submits. Left armed, it relaxes on its own.
	 */
	let { label, sure }: { label: string; sure: string } = $props();

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

<button class="tap bad" class:armed onclick={tap}>{armed ? sure : label}</button>
