import type { DB } from './db.js';
import { iso } from './time.js';

/**
 * §3.5. A hold is one row saying a film sits this round out. The table is all
 * this module knows about; who may place one and when is a films.ts concern,
 * and closeWeek only ever asks it which films are standing aside.
 */
export type Hold = {
	film_id: number;
	person_id: string;
	reason: string | null;
};

/** the films sitting this round out, by film id */
export function heldIn(db: DB, week: number): Map<number, Hold> {
	const rows = db
		.prepare('SELECT film_id, person_id, reason FROM film_hold WHERE week_number = ?')
		.all(week) as Hold[];
	return new Map(rows.map((row) => [row.film_id, row]));
}

/** the one hold this person is spending on this round, if they have spent it */
export function holdOf(db: DB, week: number, personId: string): Hold | undefined {
	return db
		.prepare('SELECT film_id, person_id, reason FROM film_hold WHERE week_number = ? AND person_id = ?')
		.get(week, personId) as Hold | undefined;
}

/** placing the same hold again only rewrites the reason, so a repeat tap is safe */
export function placeHold(
	db: DB,
	week: number,
	filmId: number,
	personId: string,
	reason: string | null,
	now: Date = new Date()
): void {
	db.prepare(
		`INSERT INTO film_hold (week_number, film_id, person_id, reason, created_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(week_number, film_id) DO UPDATE SET reason = excluded.reason`
	).run(week, filmId, personId, reason, iso(now));
}

export function liftHold(db: DB, week: number, filmId: number): void {
	db.prepare('DELETE FROM film_hold WHERE week_number = ? AND film_id = ?').run(week, filmId);
}

/**
 * §6.1: a round where every candidate stepped aside honours none of them. The
 * rows stay as a record of what was asked for, marked as not having counted.
 */
export function ignoreHolds(db: DB, week: number): void {
	db.prepare('UPDATE film_hold SET applied = 0 WHERE week_number = ?').run(week);
}
