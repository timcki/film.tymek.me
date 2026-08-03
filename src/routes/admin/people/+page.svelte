<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Avatar from '$lib/components/Avatar.svelte';
	import { formatDay } from '$lib/datetime';
	import { adminDict } from '$lib/i18n.admin';
	import { say } from '$lib/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const A = $derived(adminDict(data.lang));
	const me = $derived(data.admin.id);

	let editing = $state<string | null>(null);

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

	const active = $derived(data.people.filter((p) => p.active));
	const inactive = $derived(data.people.filter((p) => !p.active));
</script>

{#if form && 'created' in form && form.created}
	<div class="linkcard">
		<b>{A.peoNewLink(form.created.name)}</b>
		<div class="linkbox">{form.created.link}</div>
	</div>
{/if}

<h2 class="ah">{A.peoH}</h2>

<div class="sec">{A.peoAddH}</div>
<form class="addnight" method="POST" action="?/add" use:enhance={submit()}>
	<label>
		<span>{A.peoName}</span>
		<input type="text" name="name" maxlength="60" required />
	</label>
	<label>
		<span>{A.peoColour}</span>
		<select name="colour">
			{#each data.colours as colour (colour)}
				<option value={colour}>{colour}</option>
			{/each}
		</select>
	</label>
	<button class="tap go">{A.peoAdd}</button>
</form>

{#snippet personRow(person: PageData['people'][number])}
	<div class="prow" class:off={!person.active}>
		{#if editing === person.id}
			<form class="edit" method="POST" action="?/rename" use:enhance={submit(() => (editing = null))}>
				<input type="hidden" name="id" value={person.id} />
				<input type="text" name="name" value={person.name} maxlength="60" required />
				<select name="colour">
					{#each data.colours as colour (colour)}
						<option value={colour} selected={colour === person.colour}>{colour}</option>
					{/each}
				</select>
				<div class="acts">
					<button type="button" class="tap" onclick={() => (editing = null)}>{A.peoCancel}</button>
					<button class="tap go">{A.peoSave}</button>
				</div>
			</form>
		{:else}
			<div class="pwho">
				<Avatar
					name={person.name}
					colour={person.colour}
					avatar={person.avatar}
					size={34}
					font={13}
				/>
				<div class="pnames">
					<b>
						{person.name}
						{#if person.is_admin}<span class="badge">{A.peoAdminBadge}</span>{/if}
						{#if person.id === me}<span class="badge soft">{A.peoYou}</span>{/if}
					</b>
					<span class="pmeta">
						{A.peoStats(person.nominated, person.watched)} · {formatDay(
							person.created_at,
							data.lang
						)}
					</span>
				</div>
			</div>

			<div class="acts">
				<button class="tap" onclick={() => (editing = person.id)}>{A.peoEdit}</button>

				<form method="POST" action="?/bank" use:enhance={submit()}>
					<input type="hidden" name="id" value={person.id} />
					<label class="bankin">
						{A.peoBank}
						<input
							type="number"
							name="balance"
							value={person.balance}
							min="0"
							max={data.bankCap}
						/>
					</label>
					<button class="tap">{A.peoSave}</button>
				</form>

				<form method="POST" action="?/admin" use:enhance={submit()}>
					<input type="hidden" name="id" value={person.id} />
					<input type="hidden" name="on" value={person.is_admin ? '0' : '1'} />
					<button class="tap">{person.is_admin ? A.peoDropAdmin : A.peoMakeAdmin}</button>
				</form>

				<form method="POST" action="?/rotate" use:enhance={submit()}>
					<input type="hidden" name="id" value={person.id} />
					<button class="tap">{A.peoRotate}</button>
				</form>

				<form method="POST" action="?/active" use:enhance={submit()}>
					<input type="hidden" name="id" value={person.id} />
					<input type="hidden" name="on" value={person.active ? '0' : '1'} />
					<button class="tap" class:bad={person.active}>
						{person.active ? A.peoDeactivate : A.peoActivate}
					</button>
				</form>
			</div>
		{/if}
	</div>
{/snippet}

{#each active as person (person.id)}
	{@render personRow(person)}
{/each}

{#if inactive.length}
	<div class="sec">{A.peoInactiveH}</div>
	{#each inactive as person (person.id)}
		{@render personRow(person)}
	{/each}
{/if}

<p class="ahint">{A.peoRotateNote}</p>

<div class="sec">{A.audH}</div>
{#each data.audit as row (row.id)}
	<div class="arow">
		<span>{A.audLine(row.person_name, row.action, row.target ?? '')}</span>
		<i>{formatDay(row.created_at, data.lang)}</i>
	</div>
{:else}
	<p class="ahint">{A.audEmpty}</p>
{/each}
