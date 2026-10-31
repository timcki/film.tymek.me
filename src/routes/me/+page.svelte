<script lang="ts">
	import { applyAction, deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Avatar from '$lib/components/Avatar.svelte';
	import { dictFor, LANGS } from '$lib/i18n';
	import { LEVELS, levelOf, nextLevelAt } from '$lib/levels';
	import { say } from '$lib/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const T = $derived(dictFor(data.lang));
	const person = $derived(data.person!);
	const level = $derived(levelOf(data.xp.total));
	const nextAt = $derived(nextLevelAt(data.xp.total));
	const xpRows = $derived([
		{ label: T.xpRowAttend, count: data.xp.nightsAttended, per: data.xpRates.attend },
		{ label: T.xpRowVote, count: data.xp.weeksVoted, per: data.xpRates.vote },
		{ label: T.xpRowNominate, count: data.xp.nominations, per: data.xpRates.nominate },
		{ label: T.xpRowWatched, count: data.xp.nominationsWatched, per: data.xpRates.nominationWatched }
	]);

	let fileInput = $state<HTMLInputElement | null>(null);
	let uploading = $state(false);

	function fail(body: unknown) {
		const detail = body as
			| { code?: string; params?: Record<string, string | number>; message?: string }
			| undefined;
		say(T.error(detail?.code ?? '', detail?.params ?? {}, detail?.message ?? ''), true);
	}

	const submit: SubmitFunction = () => async ({ result, update }) => {
		if (result.type === 'failure') fail(result.data);
		await update({ reset: false });
	};

	/**
	 * Squares and shrinks the picture in the browser, so a 4 MB photo straight off
	 * a phone becomes a ~40 kB thumbnail. If anything here fails we post the file
	 * as it came and let the server judge it.
	 */
	async function shrink(file: File): Promise<Blob> {
		const bitmap = await createImageBitmap(file);
		const side = Math.min(bitmap.width, bitmap.height);
		const size = Math.min(512, side);
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('no 2d context');
		// centre crop: faces are nearly always in the middle of the frame
		context.drawImage(
			bitmap,
			(bitmap.width - side) / 2,
			(bitmap.height - side) / 2,
			side,
			side,
			0,
			0,
			size,
			size
		);
		return await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error('toBlob gave nothing'))),
				'image/jpeg',
				0.85
			);
		});
	}

	async function onPicked(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploading = true;
		try {
			let body: Blob = file;
			try {
				body = await shrink(file);
			} catch {
				// keep the original; the server still checks type and size
			}
			const payload = new FormData();
			payload.set('picture', body, 'avatar.jpg');
			const response = await fetch('?/avatar', {
				method: 'POST',
				body: payload,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await response.text());
			if (result.type === 'failure') fail(result.data);
			if (result.type === 'success') {
				say(T.tAvatarSaved);
				await invalidateAll();
			}
			await applyAction(result);
		} finally {
			uploading = false;
			input.value = '';
		}
	}

	$effect(() => {
		if (!form) return;
		if ('avatarRemoved' in form && form.avatarRemoved) say(T.tAvatarRemoved);
	});
</script>

<!-- each block is a panel: nothing at all on a phone, a card on a desktop,
     where they pair up beside the tall experience ladder (app.css) -->
<div class="sboard me">
	<section class="spanel me-id">
		<div class="sec">{T.youPhoto}</div>
		<div class="photo">
			<!-- .av gives the wrapper the rank ring; --ringw 3px because it is a big face -->
			<span class="big av lv{level}" style="background:{person.colour};--ringw:3.5px;--gapw:2px">
				{#if person.avatar}
					<img src={person.avatar} alt="" />
				{:else}
					<Avatar name={person.name} colour={person.colour} size={76} font={26} />
				{/if}
			</span>
			<div>
				<div class="acts">
					<!-- no-JS path: the same input inside a plain multipart form -->
					<form method="POST" action="?/avatar" enctype="multipart/form-data" use:enhance={submit}>
						<input
							bind:this={fileInput}
							type="file"
							name="picture"
							accept="image/jpeg,image/png,image/webp"
							onchange={onPicked}
						/>
						<button type="button" class="tap" disabled={uploading} onclick={() => fileInput?.click()}>
							{person.avatar ? T.avatarChange : T.avatarPick}
						</button>
						<noscript><button class="tap">{T.avatarPick}</button></noscript>
					</form>
					{#if person.avatar}
						<form method="POST" action="?/removeAvatar" use:enhance={submit}>
							<button class="tap">{T.avatarRemove}</button>
						</form>
					{/if}
				</div>
				<p class="hintline">{T.avatarHint}</p>
			</div>
		</div>

		<div class="sec">{T.youLang}</div>
		<div class="lang" style="display:inline-flex">
			{#each LANGS as code (code)}
				<form method="POST" action="/lang?/set">
					<input type="hidden" name="lang" value={code} />
					<input type="hidden" name="to" value="/me" />
					<button class:on={data.lang === code} style="padding:7px 14px">
						{code === 'pl' ? 'POLSKI' : 'ENGLISH'}
					</button>
				</form>
			{/each}
		</div>
	</section>

	<section class="spanel me-phone">
		<div class="sec">{T.youPhone}</div>
		<div class="qrcard">
			<div class="q">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html data.qr}
			</div>
			<div class="tx">{T.qrBody}</div>
		</div>
		<div class="linkbox">{data.link}</div>
	</section>

	<section class="spanel me-xp">
		<div class="sec">{T.youXp}</div>
		<div class="xpcard">
			<div class="xphead">
				<b class="xptitle">{T.levels[level]}</b>
				<span class="xptotal">{data.xp.total} XP</span>
			</div>
			{#if nextAt !== null}
				<div class="xpbar">
					<i style="width:{Math.round(((data.xp.total - LEVELS[level]) / (nextAt - LEVELS[level])) * 100)}%"
					></i>
				</div>
				<div class="xpnext">{T.xpNext(nextAt - data.xp.total)}</div>
			{:else}
				<div class="xpnext">{T.xpTop}</div>
			{/if}
			{#each xpRows as row (row.label)}
				{#if row.count > 0}
					<div class="stat">
						<span>{row.label} · {row.count} × {row.per}</span><b>{row.count * row.per}</b>
					</div>
				{/if}
			{/each}

			<div class="lheader">{T.xpLadder}</div>
			<div class="ladder">
				{#each T.levels as name, i (name)}
					<div class="lrow" class:now={i === level} class:todo={i > level}>
						{#if i === level}
							<!-- your own face sits on your rung, wearing the ring it earned -->
							<Avatar
								name={person.name}
								colour={person.colour}
								avatar={person.avatar}
								size={26}
								font={10}
								titled={false}
								xp={data.xp.total}
							/>
						{:else}
							<span class="av swatch lv{i}"></span>
						{/if}
						<b class="lname lv{i}">{name}</b>
						<span class="lxp">{LEVELS[i]} XP</span>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<section class="spanel me-stats">
		<div class="sec">{T.youStats}</div>
		<div class="stat"><span>{T.statPoints}</span><b>{data.stats.spent}</b></div>
		<div class="stat"><span>{T.statWatched}</span><b>{data.stats.nominatedWatched}</b></div>
		<div class="stat"><span>{T.statCampaign}</span><b>{data.stats.longestCampaign}</b></div>
		<div class="stat">
			<span>{T.statNom}</span><b>{data.stats.nominatedThisWeek ? T.vUsed : T.vOpen}</b>
		</div>
		{#if data.stats.bank !== null}
			<div class="stat"><span>{T.statBank}</span><b>{data.stats.bank}</b></div>
		{/if}
		<div class="stat"><span>{T.statRules}</span><b>{data.rules.label}</b></div>
	</section>

	<section class="spanel me-rules">
		<div class="sec">{T.youRules}</div>
		<ol style="padding-left:18px;margin:0;font-size:13.5px;color:var(--dim);line-height:1.6">
			{#each T.rules(data.rules, data.week?.closesAt) as rule (rule.head)}
				<li style="margin-bottom:9px">
					<b style="color:var(--ink)">{rule.head}</b>
					{rule.body}
				</li>
			{/each}
		</ol>
	</section>

	<section class="spanel me-rotate">
		<div class="sec">{T.rotateH}</div>
		{#if form && 'rotated' in form && form.rotated}
			<p class="banner accent">{T.rotated}</p>
		{/if}
		<form method="POST" action="?/rotate" use:enhance={submit}>
			<button class="tap">{T.rotateBtn}</button>
		</form>
		<p class="danger">{T.rotateNote}</p>
	</section>
</div>
