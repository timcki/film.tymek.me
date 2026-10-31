<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';

	/**
	 * Several of a long list, as tick boxes under a search box, with what is ticked
	 * kept in view above it. A box the search hides still submits, so narrowing the
	 * list never loses a choice.
	 */
	let {
		name,
		options,
		selected = [],
		placeholder,
		disabled = false
	}: {
		name: string;
		options: { value: string; label: string }[];
		selected?: string[];
		placeholder: string;
		disabled?: boolean;
	} = $props();

	// svelte-ignore state_referenced_locally
	const chosen = new SvelteSet(selected);
	let query = $state('');

	/** "chinski" finds chiński and "wlochy" Włochy; ł has no decomposition of its own */
	const fold = (text: string) =>
		text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ł/g, 'l');
	const found = $derived(fold(query.trim()));
	const picked = $derived(options.filter((o) => chosen.has(o.value)));

	function toggle(value: string, on: boolean) {
		if (on) chosen.add(value);
		else chosen.delete(value);
	}
</script>

<div class="choices">
	{#if picked.length}
		<div class="chosen">
			{#each picked as option (option.value)}
				<button type="button" class="chip" {disabled} onclick={() => toggle(option.value, false)}>
					{option.label} <span aria-hidden="true">×</span>
				</button>
			{/each}
		</div>
	{/if}
	<input class="cfind" type="search" {placeholder} bind:value={query} {disabled} autocomplete="off" />
	<div class="clist">
		{#each options as option (option.value)}
			<label hidden={!!found && !fold(option.label).includes(found)}>
				<input
					type="checkbox"
					{name}
					value={option.value}
					checked={chosen.has(option.value)}
					onchange={(e) => toggle(option.value, e.currentTarget.checked)}
					{disabled}
				/>
				{option.label}
			</label>
		{/each}
	</div>
</div>

<style>
	.choices {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.chosen {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.chip {
		border: 0;
		border-radius: 99px;
		padding: 4px 10px;
		font: inherit;
		font-size: 12px;
		color: var(--accent-ink);
		background: var(--accent);
		cursor: pointer;
	}
	.chip:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.cfind {
		background: var(--card2);
		border: 1px solid var(--line2);
		color: var(--ink);
		border-radius: 9px;
		padding: 8px 10px;
		font: inherit;
		font-size: 13px;
	}
	.clist {
		display: flex;
		flex-direction: column;
		max-height: 150px;
		overflow-y: auto;
		border: 1px solid var(--line2);
		border-radius: 9px;
		padding: 4px 0;
		font-size: 12.5px;
		color: var(--ink);
	}
	.clist label {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 3px 10px;
	}
	.clist label[hidden] {
		display: none;
	}
</style>
