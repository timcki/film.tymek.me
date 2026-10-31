<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Avatar from './Avatar.svelte';
	import ConfirmButton from './ConfirmButton.svelte';
	import { dictFor, type Lang } from '$lib/i18n';
	import { REACTIONS } from '$lib/reactions';

	/**
	 * A film's comment thread: every comment with its reactions, the emoji menu
	 * for adding one, and the box to write a new comment. Shared by the list's
	 * film modal and the special round's, which hand in their own form handling
	 * so a write waits for the live poll the way every other write on the page
	 * does.
	 */
	type Face = { id: string; name: string; colour: string; avatar: string | null };
	type Comment = {
		id: number;
		name: string;
		colour: string;
		avatar: string | null;
		xp: number;
		body: string;
		created_at: string;
		reacts: { emoji: string; mine: boolean; people: Face[] }[];
	};
	let {
		film,
		lang,
		submit,
		admin = false
	}: {
		film: { id: number; comments: Comment[] };
		lang: Lang;
		/** the page's form handler; `onOk` runs once the write has gone through */
		submit: (onOk?: () => void) => SubmitFunction;
		/** an admin can take a comment down */
		admin?: boolean;
	} = $props();

	const T = $derived(dictFor(lang));
	let commentDraft = $state('');
	// which comment's emoji picker is unfolded; one at a time is plenty
	let pickerFor = $state<number | null>(null);

	function commentDay(at: string): string {
		return new Date(at).toLocaleDateString(lang === 'pl' ? 'pl-PL' : 'en-GB', {
			day: 'numeric',
			month: 'short'
		});
	}
</script>

<div class="cmts">
	<div class="sec">{film.comments.length ? T.commentsH(film.comments.length) : T.commentNone}</div>
	{#each film.comments as comment (comment.id)}
		<div class="cmt">
			<Avatar
				name={comment.name}
				colour={comment.colour}
				avatar={comment.avatar}
				size={22}
				font={9}
				titled={false}
				xp={comment.xp}
				slim
			/>
			<div class="cbody">
				<div class="who">
					<b>{comment.name}</b>
					<time>{commentDay(comment.created_at)}</time>
					{#if admin}
						<form method="POST" action="?/uncomment" use:enhance={submit()}>
							<input type="hidden" name="commentId" value={comment.id} />
							<ConfirmButton label={T.commentDelete} sure={T.commentDeleteSure} small />
						</form>
					{/if}
				</div>
				<p>{comment.body}</p>
				<div class="rrow">
					{#each comment.reacts as react (react.emoji)}
						<form method="POST" action="?/react" use:enhance={submit()}>
							<input type="hidden" name="commentId" value={comment.id} />
							<button
								class="rchip"
								class:mine={react.mine}
								name="emoji"
								value={react.emoji}
								title={react.people.map((p) => p.name).join(', ')}
							>
								<span class="remoji">{react.emoji}</span>
								<span class="rfaces">
									{#each react.people.slice(0, 3) as person (person.id)}
										<Avatar
											name={person.name}
											colour={person.colour}
											avatar={person.avatar}
											size={14}
											font={7}
											titled={false}
										/>
									{/each}
								</span>
								{#if react.people.length > 3}<b>+{react.people.length - 3}</b>{/if}
							</button>
						</form>
					{/each}
					<button
						class="rchip radd"
						type="button"
						aria-label={T.reactAdd}
						onclick={() => (pickerFor = pickerFor === comment.id ? null : comment.id)}
					>
						🍿<span class="plus">+</span>
					</button>
				</div>
				{#if pickerFor === comment.id}
					<form
						class="rpick"
						method="POST"
						action="?/react"
						use:enhance={submit(() => (pickerFor = null))}
					>
						<input type="hidden" name="commentId" value={comment.id} />
						{#each REACTIONS as emoji (emoji)}
							<button name="emoji" value={emoji}>{emoji}</button>
						{/each}
					</form>
				{/if}
			</div>
		</div>
	{/each}
	<form
		class="cwrite"
		method="POST"
		action="?/comment"
		use:enhance={submit(() => (commentDraft = ''))}
	>
		<input type="hidden" name="filmId" value={film.id} />
		<textarea
			class="nin"
			name="body"
			rows="2"
			maxlength="280"
			placeholder={T.commentPh}
			bind:value={commentDraft}
		></textarea>
		<button class="csend" aria-label={T.commentSend} disabled={!commentDraft.trim()}>
			<svg
				viewBox="0 0 24 24"
				width="14"
				height="14"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M12 19V5M5 12l7-7 7 7" />
			</svg>
		</button>
	</form>
</div>
