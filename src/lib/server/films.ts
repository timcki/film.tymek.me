import type { DB } from './db.js';
import { immediate } from './db.js';
import type { Backer, Film, Standing } from './types.js';
import { RuleError } from './types.js';
import type { RuleSet } from './rules.js';
import { orderFilms, titleKey } from './rules.js';
import { iso } from './time.js';
import { bankBalance, spentInWeek } from './people.js';
import { campaignWeeks, pointsInWindow, rescoreAll, totalPoints } from './scoring.js';
import { requireOpenWeek } from './weeks.js';

export function filmById(db: DB, id: number): Film | undefined {
	return db.prepare('SELECT * FROM film WHERE id = ?').get(id) as Film | undefined;
}

export function filmsByStatus(db: DB, status: Film['status']): Film[] {
	return db.prepare('SELECT * FROM film WHERE status = ?').all(status) as Film[];
}

/** the weeks whose ballots contribute to the current score under these rules */
function scoringWeeks(rules: RuleSet, currentWeek: number): number[] | null {
	return rules.scoring === 'total' ? null : [currentWeek, currentWeek - 1];
}

function backersOf(db: DB, rules: RuleSet, filmId: number, currentWeek: number): Backer[] {
	const weeks = scoringWeeks(rules, currentWeek);
	const clause = weeks ? `AND b.week_number IN (${weeks.map(() => '?').join(',')})` : '';
	const params: (number | string)[] = weeks ? [filmId, ...weeks] : [filmId];
	return db
		.prepare(
			`SELECT b.person_id, p.name, p.colour, SUM(b.points) AS points
			 FROM ballot b JOIN person p ON p.id = b.person_id
			 WHERE b.film_id = ? ${clause}
			 GROUP BY b.person_id
			 HAVING points > 0
			 ORDER BY points DESC, p.name COLLATE NOCASE`
		)
		.all(...params) as Backer[];
}

/** would this film disappear if the current week closed right now? */
function isAtRisk(db: DB, rules: RuleSet, film: Film, currentWeek: number): boolean {
	if (rules.attrition.kind === 'drop') {
		return pointsInWindow(db, film.id, currentWeek, rules.attrition.afterWeeksWithoutPoints) === 0;
	}
	const age = currentWeek - film.added_week;
	return totalPoints(db, film.id) === 0 && age >= rules.attrition.afterWeeksAtZero - 1;
}

export function standings(
	db: DB,
	rules: RuleSet,
	currentWeek: number,
	viewerId: string | null,
	status: Film['status'] = 'active'
): Standing[] {
	const films = db.prepare('SELECT * FROM film WHERE status = ?').all(status) as (Film & {
		score: number;
	})[];
	const mine = new Map<number, number>();
	if (viewerId) {
		const rows = db
			.prepare('SELECT film_id, points FROM ballot WHERE person_id = ? AND week_number = ?')
			.all(viewerId, currentWeek) as { film_id: number; points: number }[];
		for (const row of rows) mine.set(row.film_id, row.points);
	}
	const names = new Map(
		(db.prepare('SELECT id, name FROM person').all() as { id: string; name: string }[]).map((p) => [
			p.id,
			p.name
		])
	);
	const enriched = films.map((film) => ({
		...film,
		backers: backersOf(db, rules, film.id, currentWeek),
		myPoints: mine.get(film.id) ?? 0,
		addedByName: names.get(film.added_by) ?? film.added_by,
		campaignWeeks: campaignWeeks(db, film.id, currentWeek),
		atRisk: isAtRisk(db, rules, film, currentWeek)
	}));
	return orderFilms(enriched);
}

export type NominationInput = {
	title: string;
	year?: number | null;
	director?: string | null;
	tmdbId?: number | null;
	posterUrl?: string | null;
	overview?: string | null;
};

function duplicateMessage(clash: Film): string {
	if (clash.status === 'watched') return `we watched ${clash.title} in week ${clash.watched_week}`;
	if (clash.status === 'archived') return `${clash.title} is archived; a vote brings it back`;
	return `${clash.title} is already on the list`;
}

/** §4.1: a dropped film does not block, that is what Re-nominate is for */
function assertNotDuplicate(db: DB, input: NominationInput): void {
	const key = titleKey(input.title);
	if (!key) throw new RuleError('give the film a title');

	if (input.tmdbId) {
		const clash = db
			.prepare(
				`SELECT * FROM film WHERE tmdb_id = ? AND status IN ('active','archived','watched') LIMIT 1`
			)
			.get(input.tmdbId) as Film | undefined;
		if (clash) throw new RuleError(duplicateMessage(clash));
	}

	const byTitle = db
		.prepare(
			`SELECT * FROM film WHERE title_key = ? AND status IN ('active','archived','watched') LIMIT 1`
		)
		.get(key) as Film | undefined;
	if (byTitle) throw new RuleError(duplicateMessage(byTitle));
}

function assertNominationSlot(db: DB, rules: RuleSet, personId: string, week: number): void {
	const row = db
		.prepare('SELECT COUNT(*) AS n FROM film WHERE added_by = ? AND added_week = ?')
		.get(personId, week) as { n: number };
	if (row.n >= rules.nominationsPerWeek) {
		throw new RuleError('you have already nominated a film this week');
	}
}

function insertFilm(db: DB, input: NominationInput, personId: string, week: number): number {
	const result = db
		.prepare(
			`INSERT INTO film (title, title_key, year, director, tmdb_id, poster_url, overview,
			                   added_by, added_week, status, score, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?)`
		)
		.run(
			input.title.trim(),
			titleKey(input.title),
			input.year ?? null,
			input.director ?? null,
			input.tmdbId ?? null,
			input.posterUrl ?? null,
			input.overview ?? null,
			personId,
			week,
			iso()
		);
	return Number(result.lastInsertRowid);
}

export function nominate(db: DB, rules: RuleSet, personId: string, input: NominationInput): number {
	return immediate(db, () => {
		const week = requireOpenWeek(db);
		assertNominationSlot(db, rules, personId, week.number);
		assertNotDuplicate(db, input);
		const id = insertFilm(db, input, personId, week.number);
		rescoreAll(db, rules, week.number);
		return id;
	});
}

/** a dropped film comes back as a new row starting from zero, and costs a nomination slot */
export function renominate(db: DB, rules: RuleSet, personId: string, filmId: number): number {
	return immediate(db, () => {
		const week = requireOpenWeek(db);
		const old = filmById(db, filmId);
		if (!old) throw new RuleError('no such film');
		if (old.status !== 'dropped') throw new RuleError('that film has not been dropped');
		assertNominationSlot(db, rules, personId, week.number);
		const input: NominationInput = {
			title: old.title,
			year: old.year,
			director: old.director,
			tmdbId: old.tmdb_id,
			posterUrl: old.poster_url,
			overview: old.overview
		};
		assertNotDuplicate(db, input);
		const id = insertFilm(db, input, personId, week.number);
		rescoreAll(db, rules, week.number);
		return id;
	});
}

function currentPoints(db: DB, personId: string, filmId: number, week: number): number {
	const row = db
		.prepare('SELECT points FROM ballot WHERE week_number = ? AND person_id = ? AND film_id = ?')
		.get(week, personId, filmId) as { points: number } | undefined;
	return row?.points ?? 0;
}

/**
 * §8.1. Takes an absolute point value, not a delta, because deltas are not idempotent
 * and double-taps on a phone are common.
 */
export function setPoints(
	db: DB,
	rules: RuleSet,
	personId: string,
	filmId: number,
	points: number
): void {
	immediate(db, () => {
		const week = requireOpenWeek(db);
		if (!Number.isInteger(points) || points < 0) {
			throw new RuleError('points must be a whole number');
		}

		const film = filmById(db, filmId);
		if (!film) throw new RuleError('no such film');
		if (film.status === 'watched') throw new RuleError(`we already watched ${film.title}`);
		if (film.status === 'dropped') throw new RuleError(`${film.title} was dropped; re-nominate it`);

		const spentElsewhere =
			spentInWeek(db, personId, week.number) - currentPoints(db, personId, filmId, week.number);
		const allowance = rules.banking ? bankBalance(db, personId) : rules.pointsPerWeek;
		if (spentElsewhere + points > allowance) {
			const left = allowance - spentElsewhere;
			throw new RuleError(
				`you have ${left} of ${allowance} points left, so ${points} is too many`
			);
		}

		if (points === 0) {
			db.prepare('DELETE FROM ballot WHERE week_number = ? AND person_id = ? AND film_id = ?').run(
				week.number,
				personId,
				filmId
			);
		} else {
			db.prepare(
				`INSERT INTO ballot (week_number, person_id, film_id, points, updated_at)
				 VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT(week_number, person_id, film_id)
				 DO UPDATE SET points = excluded.points, updated_at = excluded.updated_at`
			).run(week.number, personId, filmId, points, iso());
		}

		// §8.1: a single vote revives an archived film
		if (film.status === 'archived' && points > 0) {
			db.prepare(`UPDATE film SET status = 'active' WHERE id = ?`).run(filmId);
		}

		rescoreAll(db, rules, week.number);
	});
}
