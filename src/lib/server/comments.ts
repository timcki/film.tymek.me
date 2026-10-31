import type { DB } from './db.js';
import { immediate } from './db.js';
import { RuleError } from './types.js';
import { iso } from './time.js';
import { avatarUrl } from './people.js';
import { filmById } from './films.js';
import { REACTIONS } from '../reactions.js';

export const COMMENT_MAX = 280;

/** one emoji on one comment, with everyone wearing it */
export type CommentReact = {
	emoji: string;
	/** in the order the feelings arrived, so the chip's faces are stable */
	people: { id: string; name: string; colour: string; avatar: string | null }[];
	/** whether the viewer is among them, for lighting the chip up */
	mine: boolean;
};

/** a comment with its author's face and the room's reactions */
export type FilmComment = {
	id: number;
	film_id: number;
	person_id: string;
	body: string;
	created_at: string;
	name: string;
	colour: string;
	avatar: string | null;
	xp: number;
	reacts: CommentReact[];
};

/**
 * Like cleanNote, but a blank comment is a mistake rather than a deletion:
 * an author cannot take a comment back, so there is nothing a blank one could clear.
 */
export function cleanComment(body: string | null | undefined): string {
	const trimmed = (body ?? '').trim().replace(/\s+/g, ' ');
	if (!trimmed) throw new RuleError('empty_comment', 'write something first');
	if (trimmed.length > COMMENT_MAX) {
		throw new RuleError('comment_too_long', `keep the comment under ${COMMENT_MAX} characters`, {
			max: COMMENT_MAX
		});
	}
	return trimmed;
}

/** anyone with an account may comment on any suggestion; there is no editing, and only an admin deletes */
export function addComment(
	db: DB,
	personId: string,
	filmId: number,
	body: string,
	now: Date = new Date()
): number {
	const cleaned = cleanComment(body);
	return immediate(db, () => {
		if (!filmById(db, filmId)) throw new RuleError('no_film', 'no such film');
		const result = db
			.prepare(
				'INSERT INTO film_comment (film_id, person_id, body, created_at) VALUES (?, ?, ?, ?)'
			)
			.run(filmId, personId, cleaned, iso(now));
		return Number(result.lastInsertRowid);
	});
}

/** an admin taking a comment down, the reactions to it with it; the caller checks who is asking */
export function deleteComment(db: DB, commentId: number): string {
	return immediate(db, () => {
		const comment = db.prepare('SELECT body FROM film_comment WHERE id = ?').get(commentId) as
			| { body: string }
			| undefined;
		if (!comment) throw new RuleError('no_comment', 'no such comment');
		db.prepare('DELETE FROM comment_react WHERE comment_id = ?').run(commentId);
		db.prepare('DELETE FROM film_comment WHERE id = ?').run(commentId);
		return comment.body;
	});
}

/**
 * Reacting to a comment is a toggle: the same emoji again takes it back.
 * Several feelings at once are allowed; feelings off the menu are not.
 */
export function reactComment(
	db: DB,
	personId: string,
	commentId: number,
	emoji: string,
	now: Date = new Date()
): void {
	if (!(REACTIONS as readonly string[]).includes(emoji)) {
		throw new RuleError('bad_react', 'that feeling is not on the menu');
	}
	immediate(db, () => {
		const comment = db.prepare('SELECT id FROM film_comment WHERE id = ?').get(commentId);
		if (!comment) throw new RuleError('no_comment', 'no such comment');
		const existing = db
			.prepare('SELECT 1 FROM comment_react WHERE comment_id = ? AND person_id = ? AND emoji = ?')
			.get(commentId, personId, emoji);
		if (existing) {
			db.prepare(
				'DELETE FROM comment_react WHERE comment_id = ? AND person_id = ? AND emoji = ?'
			).run(commentId, personId, emoji);
		} else {
			db.prepare(
				'INSERT INTO comment_react (comment_id, person_id, emoji, created_at) VALUES (?, ?, ?, ?)'
			).run(commentId, personId, emoji, iso(now));
		}
	});
}

/**
 * All comments for a set of films, oldest first, with author faces and the
 * reactions on each, palette-ordered, every reactor's face attached. The
 * viewer's id lights up the chips they are on; the host screen passes none.
 */
export function commentsOf(
	db: DB,
	filmIds: number[],
	viewerId?: string
): Map<number, FilmComment[]> {
	const grouped = new Map<number, FilmComment[]>();
	if (!filmIds.length) return grouped;
	const marks = filmIds.map(() => '?').join(',');
	const rows = db
		.prepare(
			`SELECT c.id, c.film_id, c.person_id, c.body, c.created_at,
			        p.name, p.colour, p.avatar_updated_at, p.xp
			 FROM film_comment c JOIN person p ON p.id = c.person_id
			 WHERE c.film_id IN (${marks})
			 ORDER BY c.created_at, c.id`
		)
		.all(...filmIds) as (Omit<FilmComment, 'avatar' | 'reacts'> & {
		avatar_updated_at: string | null;
	})[];

	const reactRows = db
		.prepare(
			`SELECT r.comment_id, r.emoji, r.person_id, p.name, p.colour, p.avatar_updated_at
			 FROM comment_react r
			 JOIN film_comment c ON c.id = r.comment_id
			 JOIN person p ON p.id = r.person_id
			 WHERE c.film_id IN (${marks})
			 ORDER BY r.created_at, r.person_id`
		)
		.all(...filmIds) as {
		comment_id: number;
		emoji: string;
		person_id: string;
		name: string;
		colour: string;
		avatar_updated_at: string | null;
	}[];

	const reactsByComment = new Map<number, Map<string, CommentReact>>();
	for (const row of reactRows) {
		let byEmoji = reactsByComment.get(row.comment_id);
		if (!byEmoji) reactsByComment.set(row.comment_id, (byEmoji = new Map()));
		let react = byEmoji.get(row.emoji);
		if (!react) byEmoji.set(row.emoji, (react = { emoji: row.emoji, people: [], mine: false }));
		react.people.push({
			id: row.person_id,
			name: row.name,
			colour: row.colour,
			avatar: avatarUrl(row.person_id, row.avatar_updated_at)
		});
		if (row.person_id === viewerId) react.mine = true;
	}

	for (const { avatar_updated_at, ...row } of rows) {
		const byEmoji = reactsByComment.get(row.id);
		const comment = {
			...row,
			avatar: avatarUrl(row.person_id, avatar_updated_at),
			// palette order keeps the chips from dancing as counts change
			reacts: byEmoji
				? REACTIONS.map((emoji) => byEmoji.get(emoji)).filter((r): r is CommentReact => Boolean(r))
				: []
		};
		const list = grouped.get(comment.film_id);
		if (list) list.push(comment);
		else grouped.set(comment.film_id, [comment]);
	}
	return grouped;
}
