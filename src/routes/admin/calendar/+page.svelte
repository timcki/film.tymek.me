<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import { daysUntil, formatNight, toLocalInput } from '$lib/datetime';
	import { adminDict } from '$lib/i18n.admin';
	import { dictFor } from '$lib/i18n';
	import { say } from '$lib/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const A = $derived(adminDict(data.lang));
	const T = $derived(dictFor(data.lang));
	const when = (at: string) => formatNight(at, data.lang);

	type Night = PageData['nights'][number];

	let editing = $state<number | null>(null);

	const submit = (onOk?: () => void): SubmitFunction => {
		return () =>
			async ({ result, update }) => {
				if (result.type === 'failure') {
					const body = result.data as
						| { code?: string; params?: Record<string, string | number>; message?: string }
						| undefined;
					say(A.error(body?.code ?? '', body?.params ?? {}, body?.message ?? ''), true);
				}
				if (result.type === 'success') onOk?.();
				await update({ reset: false });
			};
	};

	/** picking is the whole action; there is no button to go and find */
	function saveOnChange(event: Event) {
		(event.currentTarget as HTMLSelectElement).form?.requestSubmit();
	}

	// a skipped night that has gone by is history, not something still to come
	const gone = (night: Night) =>
		night.status === 'used' || (night.status === 'skipped' && Date.parse(night.at) < Date.now());
	const upcoming = $derived(data.nights.filter((n) => !gone(n)));
	const past = $derived([...data.nights].reverse().filter(gone));

	// the next date the round would run to if this one were skipped
	function nextAfter(night: Night): string | null {
		const later = data.nights.find((n) => n.status === 'planned' && n.at > night.at);
		return later ? when(later.at) : null;
	}

	$effect(() => {
		if (form && 'added' in form && form.added) editing = null;
		if (form && 'moved' in form && form.moved) editing = null;
	});
</script>

<h2 class="ah">{A.calH}</h2>
<p class="ahint">{A.calIntro}</p>

{#if data.week}
	<div class="nextcard">
		<span class="lbl">{A.calNextH}</span>
		<b>{when(data.week.closesAt)}</b>
		<span class="tag" class:soft={data.drivingId === null}>
			{data.drivingId === null ? A.calFromDefault : A.calFromCalendar}
		</span>
	</div>
	{#if data.drivingId === null && data.fallback}
		<p class="ahint">{A.calDefaultNote(when(data.fallback))}</p>
	{/if}

	<!-- §3.6: the round, not a date, is what goes special; the date is the row below.
	     How it votes and what the site wears are two separate choices -->
	{@const locked = data.week.status !== 'open' || data.specialPicks > 0}
	<div class="sec">{A.spcH}</div>
	<div class="acts">
		<form method="POST" action="?/special" use:enhance={submit()}>
			<label class="bankin">
				{A.spcVote}
				<select name="special" onchange={saveOnChange} disabled={locked}>
					<option value="" selected={!data.week.special}>{A.spcList}</option>
					{#each data.specials as id (id)}
						<option value={id} selected={data.week.special === id}>{T.spName(id)}</option>
					{/each}
				</select>
			</label>
		</form>
		<form method="POST" action="?/look" use:enhance={submit()}>
			<label class="bankin">
				{A.lookLabel}
				<select name="look" onchange={saveOnChange}>
					<option value="" selected={!data.look}>{A.lookDefault}</option>
					{#each data.looks as id (id)}
						<option value={id} selected={data.look === id}>{T.lookName(id)}</option>
					{/each}
				</select>
			</label>
		</form>
	</div>
	<p class="ahint">{data.week.special && data.specialPicks > 0 ? A.spcLocked : A.spcIntro}</p>
	<p class="ahint">{A.lookIntro}</p>

	<div class="sec">{A.noticeH}</div>
	<form class="acts" method="POST" action="?/notice" use:enhance={submit()}>
		<input
			class="nin"
			name="notice"
			value={data.notice ?? ''}
			maxlength={data.noticeMax}
			placeholder={A.noticePh}
		/>
		<button class="tap go">{A.noticeSave}</button>
	</form>
	<p class="ahint">{A.noticeIntro}</p>
{/if}

<div class="sec">{A.calAddH}</div>
<form class="addnight" method="POST" action="?/add" use:enhance={submit()}>
	<label>
		<span>{A.calWhen}</span>
		<input type="datetime-local" name="at" value={data.suggested} required />
	</label>
	<label>
		<span>{A.calNote}</span>
		<input type="text" name="note" placeholder={A.calNotePh} maxlength="60" />
	</label>
	<button class="tap go">{A.calAdd}</button>
</form>

<div class="sec">{A.calUpcomingH}</div>
{#each upcoming as night (night.id)}
	{@const skipped = night.status === 'skipped'}
	<div class="nrow" class:driving={night.id === data.drivingId} class:off={skipped}>
		{#if editing === night.id}
			<form class="edit" method="POST" action="?/move" use:enhance={submit()}>
				<input type="hidden" name="id" value={night.id} />
				<input type="datetime-local" name="at" value={toLocalInput(night.at)} required />
				<input
					type="text"
					name="note"
					value={night.note ?? ''}
					placeholder={A.calNotePh}
					maxlength="60"
				/>
				<div class="acts">
					<button type="button" class="tap" onclick={() => (editing = null)}>{A.calCancel}</button>
					<button class="tap go">{A.calSave}</button>
				</div>
			</form>
		{:else}
			<div class="nmain">
				<b>{when(night.at)}</b>
				<span class="nmeta">
					{#if night.id === data.drivingId}<span class="badge">{A.calClosesRound}</span>{/if}
					{#if skipped}<span class="badge off">{A.calSkipped}</span>{/if}
					{#if !skipped && daysUntil(night.at) < 0}<span class="badge warn">{A.calOverdue}</span>{/if}
					{#if night.note}<span class="nnote">{night.note}</span>{/if}
				</span>
				{#if skipped && nextAfter(night)}
					<span class="nconseq">{A.calRunsTo(nextAfter(night) ?? '')}</span>
				{/if}
			</div>
			<div class="acts">
				<button class="tap" onclick={() => (editing = night.id)}>{A.calEdit}</button>
				<form method="POST" action="?/skip" use:enhance={submit()}>
					<input type="hidden" name="id" value={night.id} />
					<input type="hidden" name="restore" value={skipped ? '1' : '0'} />
					<button class="tap">{skipped ? A.calUnskip : A.calSkip}</button>
				</form>
				<form method="POST" action="?/remove" use:enhance={submit()}>
					<input type="hidden" name="id" value={night.id} />
					<ConfirmButton label={A.calDelete} sure={A.sure} />
				</form>
			</div>
		{/if}
	</div>
{:else}
	<p class="ahint">{A.calEmpty}</p>
{/each}

<div class="sec">{A.calPastH}</div>
{#each past as night (night.id)}
	<div class="nrow done">
		<div class="nmain">
			<b>{when(night.at)}</b>
			<span class="nmeta">
				{#if night.status === 'skipped'}
					<span class="badge off">{A.calSkipped}</span>
				{:else}
					<span class="badge">{A.calUsed(data.evenings[night.week_number ?? 0])}</span>
				{/if}
				{#if night.note}<span class="nnote">{night.note}</span>{/if}
			</span>
		</div>
	</div>
{:else}
	<p class="ahint">{A.calPastEmpty}</p>
{/each}
