import type { DB } from './db.js';
import type { RuleSet } from './rules.js';
import { score as scoreOf } from './rules.js';

/** filmId -> weekNumber -> points */
export function pointsByFilm(db: DB): Map<number, Map<number, number>> {
	const rows = db
		.prepare(
			'SELECT film_id, week_number, SUM(points) AS points FROM ballot GROUP BY film_id, week_number'
		)
		.all() as { film_id: number; week_number: number; points: number }[];
	const out = new Map<number, Map<number, number>>();
	for (const row of rows) {
		let weeks = out.get(row.film_id);
		if (!weeks) out.set(row.film_id, (weeks = new Map()));
		weeks.set(row.week_number, row.points);
	}
	return out;
}

/**
 * Recomputes every film's score from the ballot table and writes the cache.
 * The only writer of film.score, always run inside the mutating transaction, so
 * the cache is rebuilt wholesale and can never partially drift.
 */
export function rescoreAll(db: DB, rules: RuleSet, currentWeek: number): Map<number, number> {
	const points = pointsByFilm(db);
	const ids = (db.prepare('SELECT id FROM film').all() as { id: number }[]).map((r) => r.id);
	const update = db.prepare('UPDATE film SET score = ? WHERE id = ?');
	const scores = new Map<number, number>();
	for (const id of ids) {
		const value = scoreOf(rules, points.get(id) ?? new Map(), currentWeek);
		scores.set(id, value);
		update.run(value, id);
	}
	return scores;
}

export function scoreFor(db: DB, rules: RuleSet, filmId: number, currentWeek: number): number {
	return scoreOf(rules, pointsByFilm(db).get(filmId) ?? new Map(), currentWeek);
}

/** points a film received across a window of `weeks` weeks ending at `week`, inclusive */
export function pointsInWindow(db: DB, filmId: number, week: number, weeks: number): number {
	const row = db
		.prepare(
			`SELECT COALESCE(SUM(points), 0) AS total FROM ballot
			 WHERE film_id = ? AND week_number <= ? AND week_number > ?`
		)
		.get(filmId, week, week - weeks) as { total: number };
	return row.total;
}

export function totalPoints(db: DB, filmId: number): number {
	const row = db
		.prepare('SELECT COALESCE(SUM(points), 0) AS total FROM ballot WHERE film_id = ?')
		.get(filmId) as { total: number };
	return row.total;
}

/**
 * The longest run of consecutive weeks, ending at `week`, over which a single
 * person has kept points on this film. Drives the "N-week campaign" badge.
 */
export function campaignWeeks(db: DB, filmId: number, week: number): number {
	const rows = db
		.prepare('SELECT person_id, week_number FROM ballot WHERE film_id = ?')
		.all(filmId) as { person_id: string; week_number: number }[];
	const byPerson = new Map<string, Set<number>>();
	for (const row of rows) {
		let weeks = byPerson.get(row.person_id);
		if (!weeks) byPerson.set(row.person_id, (weeks = new Set()));
		weeks.add(row.week_number);
	}
	let best = 0;
	for (const weeks of byPerson.values()) {
		let run = 0;
		while (weeks.has(week - run)) run++;
		if (run > best) best = run;
	}
	return best;
}
