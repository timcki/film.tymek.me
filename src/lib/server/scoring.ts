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
 * §3.6: the list's own clock, as a round number to the rounds the list was awake
 * for. A special round is one the list slept through, so it ages nothing: the
 * round after it shares its place on this clock, and points cast in a special
 * round's week before it began are still this round's points once the list
 * wakes. With no special rounds on record it is the identity.
 */
export type ListClock = (week: number) => number;

export function listClock(db: DB): ListClock {
	const specials = (
		db.prepare('SELECT number FROM week WHERE special IS NOT NULL ORDER BY number').all() as {
			number: number;
		}[]
	).map((row) => row.number);
	if (!specials.length) return (week) => week;
	return (week) => week - specials.filter((number) => number < week).length;
}

/**
 * §3.6: the weeks that are one round of the list's: `week` and any special
 * round that shares its place on the list's clock, whose week a list round was
 * put to sleep in. What anyone spent, nominated or held back in those still
 * counts against the round's budget, slot and hold, as though the night had
 * not happened.
 */
export function listRound(db: DB, week: number): number[] {
	const clock = listClock(db);
	return (
		db.prepare('SELECT number FROM week ORDER BY number').all() as {
			number: number;
		}[]
	)
		.map((row) => row.number)
		.filter((number) => clock(number) === clock(week));
}

/** a film's points re-keyed from round numbers to the list's clock */
function onClock(clock: ListClock, points: Map<number, number>): Map<number, number> {
	const out = new Map<number, number>();
	for (const [week, p] of points) {
		const at = clock(week);
		out.set(at, (out.get(at) ?? 0) + p);
	}
	return out;
}

/** §3.6: how many people would happily watch each special pick, which is its whole score */
function approvalsByFilm(db: DB): Map<number, number> {
	const rows = db
		.prepare('SELECT film_id, COUNT(*) AS n FROM approval GROUP BY film_id')
		.all() as { film_id: number; n: number }[];
	return new Map(rows.map((row) => [row.film_id, row.n]));
}

/**
 * Recomputes every film's score from the ballot table and writes the cache.
 * The only writer of film.score, always run inside the mutating transaction, so
 * the cache is rebuilt wholesale and can never partially drift.
 */
export function rescoreAll(db: DB, rules: RuleSet, currentWeek: number): Map<number, number> {
	const points = pointsByFilm(db);
	const approvals = approvalsByFilm(db);
	const clock = listClock(db);
	const now = clock(currentWeek);
	const films = db.prepare('SELECT id, special FROM film').all() as {
		id: number;
		special: string | null;
	}[];
	// a score that already holds its value is left alone, so a rescore that moved
	// nothing changes no rows and immediate() tells no phone to reload
	const update = db.prepare('UPDATE film SET score = ? WHERE id = ? AND score IS NOT ?');
	const scores = new Map<number, number>();
	for (const film of films) {
		// §3.6: a special pick never takes points; its score is its approvals
		const value = film.special
			? (approvals.get(film.id) ?? 0)
			: scoreOf(rules, onClock(clock, points.get(film.id) ?? new Map()), now);
		scores.set(film.id, value);
		update.run(value, film.id, value);
	}
	return scores;
}

/**
 * The rounds a window of `weeks` rounds ending at `week` covers, inclusive, on
 * the list's clock (§3.6): a special round inside it widens it by one, because
 * the list was asleep for that one.
 */
export function windowWeeks(db: DB, week: number, weeks: number): number[] {
	const clock = listClock(db);
	const end = clock(week);
	return (
		db.prepare('SELECT number FROM week WHERE number <= ? ORDER BY number').all(week) as {
			number: number;
		}[]
	)
		.map((row) => row.number)
		.filter((number) => clock(number) > end - weeks);
}

/** points a film received across a window of `weeks` weeks ending at `week`, inclusive */
export function pointsInWindow(db: DB, filmId: number, week: number, weeks: number): number {
	const span = windowWeeks(db, week, weeks);
	if (!span.length) return 0;
	const row = db
		.prepare(
			`SELECT COALESCE(SUM(points), 0) AS total FROM ballot
			 WHERE film_id = ? AND week_number IN (${span.map(() => '?').join(',')})`
		)
		.get(filmId, ...span) as { total: number };
	return row.total;
}

export function totalPoints(db: DB, filmId: number): number {
	const row = db
		.prepare('SELECT COALESCE(SUM(points), 0) AS total FROM ballot WHERE film_id = ?')
		.get(filmId) as { total: number };
	return row.total;
}
