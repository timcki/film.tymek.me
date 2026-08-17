import type { DB } from './db.js';
import { immediate } from './db.js';
import { RuleError } from './types.js';
import { iso } from './time.js';
import { avatarUrl } from './people.js';
import { filmById } from './films.js';

/** someone who has already seen a film, face attached */
export type SeenFace = { id: string; name: string; colour: string; avatar: string | null };

/**
 * Marking a film as already seen is a toggle, so a slip of the finger is
 * undoable. Returns whether the person counts as having seen it afterwards.
 */
export function toggleSeen(
	db: DB,
	personId: string,
	filmId: number,
	now: Date = new Date()
): boolean {
	return immediate(db, () => {
		if (!filmById(db, filmId)) throw new RuleError('no_film', 'no such film');
		const existing = db
			.prepare('SELECT 1 FROM film_seen WHERE film_id = ? AND person_id = ?')
			.get(filmId, personId);
		if (existing) {
			db.prepare('DELETE FROM film_seen WHERE film_id = ? AND person_id = ?').run(filmId, personId);
			return false;
		}
		db.prepare('INSERT INTO film_seen (film_id, person_id, created_at) VALUES (?, ?, ?)').run(
			filmId,
			personId,
			iso(now)
		);
		return true;
	});
}

/** who has seen each of the given films, in the order they owned up */
export function seenOf(db: DB, filmIds: number[]): Map<number, SeenFace[]> {
	const grouped = new Map<number, SeenFace[]>();
	if (!filmIds.length) return grouped;
	const rows = db
		.prepare(
			`SELECT s.film_id, s.person_id, p.name, p.colour, p.avatar_updated_at
			 FROM film_seen s JOIN person p ON p.id = s.person_id
			 WHERE s.film_id IN (${filmIds.map(() => '?').join(',')})
			 ORDER BY s.created_at, s.person_id`
		)
		.all(...filmIds) as {
		film_id: number;
		person_id: string;
		name: string;
		colour: string;
		avatar_updated_at: string | null;
	}[];
	for (const row of rows) {
		const face: SeenFace = {
			id: row.person_id,
			name: row.name,
			colour: row.colour,
			avatar: avatarUrl(row.person_id, row.avatar_updated_at)
		};
		const list = grouped.get(row.film_id);
		if (list) list.push(face);
		else grouped.set(row.film_id, [face]);
	}
	return grouped;
}

/** just the headcounts, for the room screens that only need a number */
export function seenCounts(db: DB, filmIds: number[]): Record<number, number> {
	const counts: Record<number, number> = {};
	for (const [filmId, faces] of seenOf(db, filmIds)) counts[filmId] = faces.length;
	return counts;
}
