import type { DB } from './db.js';

/**
 * What a round is called on screen. A week is the engine's unit and a Thursday
 * whether or not anybody met, so its number says how long the app has existed
 * rather than how many times we watched something; the year before the app left
 * gaps all through it. An evening is a night we watched something, counted from
 * the first, and a round is called after the evening it ends in.
 *
 * Indexed by week number. A round that went by without a film shares its number
 * with the round after it, because the evening it was heading for has not
 * happened yet. Read off film.watched_week like the stats are, never off
 * week.winner_film_id.
 */
export function roundEvenings(db: DB): Record<number, number> {
	const rounds = db
		.prepare(
			`SELECT w.number,
			        (SELECT COUNT(*) FROM film f
			         WHERE f.status = 'watched' AND f.watched_week = w.number) AS watched
			 FROM week w ORDER BY w.number`
		)
		.all() as { number: number; watched: number }[];

	const evenings: Record<number, number> = {};
	let before = 0;
	for (const round of rounds) {
		evenings[round.number] = before + 1;
		before += round.watched;
	}
	return evenings;
}

/** the evening one round ends in, for a server message that has to name it */
export function eveningOf(db: DB, week: number): number {
	const row = db
		.prepare(`SELECT COUNT(*) AS n FROM film WHERE status = 'watched' AND watched_week < ?`)
		.get(week) as { n: number };
	return row.n + 1;
}
