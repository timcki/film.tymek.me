import type { DB } from './db.js';

/**
 * What a round is called on screen. A week is the engine's unit and a Thursday
 * whether or not anybody met, so its number says how long the app has existed
 * rather than how many times we watched something; the year before the app left
 * gaps all through it. An evening is a night we watched something, counted from
 * the first, and a round is called after the evening it ends in.
 *
 * A film a round decided happened on its round's night. Anything written down
 * afterwards, a film night or an outing (src/lib/outings.ts), happened when it
 * was written down as happening, which puts a Saturday at the cinema, or a
 * second night in one week, between the nights either side of it. Read off film.watched_week
 * like the stats are, never off week.winner_film_id.
 */
const EVENING_AT = `COALESCE(f.watched_at, fw.closes_at)`;
const WATCHED = `film f JOIN week fw ON fw.number = f.watched_week WHERE f.status = 'watched'`;

/**
 * Indexed by week number. A round that went by without a film shares its number
 * with the round after it, because the evening it was heading for has not
 * happened yet.
 */
export function roundEvenings(db: DB): Record<number, number> {
	const rows = db
		.prepare(
			`SELECT w.number,
			        (SELECT COUNT(*) FROM ${WATCHED} AND ${EVENING_AT} < w.closes_at) + 1 AS evening
			 FROM week w`
		)
		.all() as { number: number; evening: number }[];
	return Object.fromEntries(rows.map((row) => [row.number, row.evening]));
}

/** which evening every watched film was, by film id */
export function filmEvenings(db: DB): Map<number, number> {
	const rows = db
		.prepare(
			`SELECT f.id, ROW_NUMBER() OVER (ORDER BY ${EVENING_AT}, f.id) AS evening FROM ${WATCHED}`
		)
		.all() as { id: number; evening: number }[];
	return new Map(rows.map((row) => [row.id, row.evening]));
}
