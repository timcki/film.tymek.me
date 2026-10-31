<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import { daysUntil, formatNight, toLocalInput } from '$lib/datetime';
	import { adminDict } from '$lib/i18n.admin';
	import { dictFor } from '$lib/i18n';
	import { say } from '$lib/toast.svelte';
	import { ABOUT_MAX, CODED, GENRES, LANGUAGES, NAME_MAX, PICKS_MAX, REGIONS, rulesOf } from '$lib/custom-weeks';
	import { SPECIALS } from '$lib/specials';
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

	// §3.7: a special round is set up before it starts; going back to the list is one pick
	let vote = $state('');
	let setup = $state(false);
	$effect.pre(() => {
		vote = data.week?.special ?? '';
		setup = false;
	});
	function pickVote(event: Event) {
		if (vote) setup = true;
		else if (data.week?.special) saveOnChange(event);
		else setup = false;
	}
	function cancelSetup() {
		vote = '';
		setup = false;
	}

	/** a menu of codes, by the name the reader knows them by */
	function named(codes: readonly string[], type: 'region' | 'language') {
		const names = new Intl.DisplayNames([data.lang], { type });
		return codes
			.map((code) => ({ code, name: names.of(code) ?? code }))
			.sort((a, b) => a.name.localeCompare(b.name, data.lang));
	}
	const countries = $derived(named(REGIONS, 'region'));
	const languages = $derived(named(LANGUAGES, 'language'));
	const running = $derived(data.week?.custom ?? null);

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
				<select name="special" bind:value={vote} onchange={pickVote} disabled={locked}>
					<option value="">{A.spcList}</option>
					{#each data.specials as id (id)}
						<option value={id}>{T.spName(id)}</option>
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
	{#if setup && !data.week.special}
		<form class="cwform" method="POST" action="?/special" use:enhance={submit()}>
			<input type="hidden" name="special" value={vote} />
			<p class="ahint">{A.cwIntro}</p>
			<div class="fedit">
				<label>
					<span>{A.cwName}</span>
					<input name="name" maxlength={NAME_MAX} placeholder={T.spName(vote)} />
				</label>
				<label class="cwnum">
					<span>{A.cwPicks}</span>
					<input
						type="number"
						name="picks"
						min="1"
						max={PICKS_MAX}
						value={SPECIALS.approval.picksPerPerson}
						required
					/>
				</label>
			</div>
			<label class="cwwide">
				<span>{A.cwAbout}</span>
				<textarea name="about" rows="2" maxlength={ABOUT_MAX} placeholder={A.cwAboutPh}></textarea>
			</label>

			<div class="sec">{A.cwRulesH}</div>
			<p class="ahint">{A.cwRulesIntro}</p>
			<div class="fedit">
				<label>
					<span>{A.cwCountries}</span>
					<select name="countries" multiple size="6">
						{#each countries as c (c.code)}<option value={c.code}>{c.name}</option>{/each}
					</select>
				</label>
				<label>
					<span>{A.cwLanguages}</span>
					<select name="languages" multiple size="6">
						{#each languages as l (l.code)}<option value={l.code}>{l.name}</option>{/each}
					</select>
				</label>
			</div>
			<p class="ahint">{A.cwMulti}</p>

			<fieldset class="cwticks">
				<legend>{A.cwGenres}</legend>
				{#each GENRES as id (id)}
					<label><input type="checkbox" name="genres" value={id} />{T.genreName(id)}</label>
				{/each}
			</fieldset>

			<div class="fedit">
				<label class="cwnum">
					<span>{A.cwYears} {A.cwFrom}</span>
					<input type="number" name="yearFrom" min="1870" max="2100" />
				</label>
				<label class="cwnum">
					<span>{A.cwTo}</span>
					<input type="number" name="yearTo" min="1870" max="2100" />
				</label>
				<label class="cwnum">
					<span>{A.cwRuntime} {A.cwFrom}</span>
					<input type="number" name="runtimeMin" min="1" max="1000" />
				</label>
				<label class="cwnum">
					<span>{A.cwTo}</span>
					<input type="number" name="runtimeMax" min="1" max="1000" />
				</label>
			</div>
			<label class="cwwide">
				<span>{A.cwDirectors}</span>
				<input name="directors" placeholder={A.cwDirectorsPh} />
			</label>

			<fieldset class="cwticks">
				<legend>{A.cwCoded}</legend>
				{#each CODED as id (id)}
					<label><input type="checkbox" name="coded" value={id} />{T.weekRule({ kind: 'coded', id })}</label>
				{/each}
			</fieldset>

			<div class="acts">
				<button class="tap go">{A.cwStart}</button>
				<button type="button" class="tap" onclick={cancelSetup}>{A.cwCancel}</button>
			</div>
		</form>
	{/if}
	{#if running}
		{@const rules = rulesOf(running.rules)}
		<div class="nextcard cwrunning">
			<b>{running.name ?? T.spName(data.week.special ?? '')}</b>
			{#if running.about}<span>{running.about}</span>{/if}
			<ul>
				{#each rules as rule (rule.kind + T.weekRule(rule))}<li>{T.weekRule(rule)}</li>{:else}<li>{A.cwNoRules}</li>{/each}
			</ul>
		</div>
	{/if}
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

<style>
	/* §3.7: the custom week's setup, laid out like the rest of the calendar's forms */
	.cwform {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--r);
		padding: 12px 14px;
		margin-top: 10px;
	}
	.cwform .fedit {
		margin-top: 8px;
	}
	.cwform .cwnum {
		flex: 0 1 110px;
	}
	.cwwide {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 8px;
		font-size: 11px;
		color: var(--dim);
	}
	.cwwide input,
	.cwwide textarea,
	.cwform select[multiple] {
		background: var(--card2);
		border: 1px solid var(--line2);
		color: var(--ink);
		border-radius: 9px;
		padding: 8px 10px;
		font: inherit;
		font-size: 13px;
		resize: vertical;
	}
	.cwticks {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		border: 0;
		padding: 0;
		margin: 10px 0 0;
		font-size: 12.5px;
	}
	.cwticks legend {
		font-size: 11px;
		color: var(--dim);
		margin-bottom: 6px;
	}
	.cwticks label {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.cwrunning {
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		font-size: 12.5px;
		color: var(--ink2);
	}
	.cwrunning ul {
		margin: 0;
		padding-left: 18px;
	}
</style>
