import type { DB } from './db.js';
import { immediate } from './db.js';
import type { Backer, Film, Standing } from './types.js';
import { RuleError } from './types.js';
import type { RuleSet } from './rules.js';
import { orderFilms, titleKey } from './rules.js';
import { iso } from './time.js';
import { avatarUrl, bankBalance, spentInWeek } from './people.js';
import { campaignWeeks, pointsInWindow, rescoreAll, totalPoints } from './scoring.js';
import { rexpAll } from './xp.js';
import { requireOpenWeek } from './weeks.js';

export function filmById(db: DB, id: number): Film | undefined {
	return db.prepare('SELECT * FROM film WHERE id = ?').get(id) as Film | undefined;
}

export function filmsByStatus(db: DB, status: Film['status']): Film[] {
	return db
		.prepare('SELECT * FROM film WHERE status = ? AND archival = 0')
		.all(status) as Film[];
}

/** the weeks whose ballots contribute to the current score under these rules */
function scoringWeeks(rules: RuleSet, currentWeek: number): number[] | null {
	// under 'total' and 'fade' every week counts (fade just discounts them);
	// only 'decay' has a hard two-week window
	return rules.scoring === 'decay' ? [currentWeek, currentWeek - 1] : null;
}

function backersOf(db: DB, rules: RuleSet, filmId: number, currentWeek: number): Backer[] {
	const weeks = scoringWeeks(rules, currentWeek);
	const clause = weeks ? `AND b.week_number IN (${weeks.map(() => '?').join(',')})` : '';
	const params: (number | string)[] = weeks ? [filmId, ...weeks] : [filmId];
	const rows = db
		.prepare(
			`SELECT b.person_id, p.name, p.colour, p.avatar_updated_at, p.xp, SUM(b.points) AS points
			 FROM ballot b JOIN person p ON p.id = b.person_id
			 WHERE b.film_id = ? ${clause}
			 GROUP BY b.person_id
			 HAVING points > 0
			 ORDER BY points DESC, p.name COLLATE NOCASE`
		)
		.all(...params) as (Omit<Backer, 'avatar'> & { avatar_updated_at: string | null })[];
	return rows.map(({ avatar_updated_at, ...backer }) => ({
		...backer,
		avatar: avatarUrl(backer.person_id, avatar_updated_at)
	}));
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
	const films = db
		.prepare('SELECT * FROM film WHERE status = ? AND archival = 0')
		.all(status) as (Film & {
		score: number;
	})[];
	const now = new Date();
	const mine = new Map<
		number,
		{ points: number; floor: number; graceUntil: string | null }
	>();
	if (viewerId) {
		const rows = db
			.prepare(
				'SELECT film_id, points, prev_points, updated_at FROM ballot WHERE person_id = ? AND week_number = ?'
			)
			.all(viewerId, currentWeek) as (BallotRow & { film_id: number })[];
		for (const row of rows) {
			const floor = pointsFloor(rules, row, now);
			const until = new Date(row.updated_at).getTime() + rules.voteGraceSeconds * 1000;
			mine.set(row.film_id, {
				points: row.points,
				floor,
				// when the undo affordance should dissolve; null once the vote has set
				graceUntil: floor < row.points && until > now.getTime() ? iso(new Date(until)) : null
			});
		}
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
		myPoints: mine.get(film.id)?.points ?? 0,
		myFloor: mine.get(film.id)?.floor ?? 0,
		myGraceUntil: mine.get(film.id)?.graceUntil ?? null,
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
	genre?: string | null;
	runtime?: number | null;
	tmdbId?: number | null;
	posterUrl?: string | null;
	overview?: string | null;
	note?: string | null;
};

export const NOTE_MAX = 160;

export function cleanNote(note: string | null | undefined): string | null {
	const trimmed = (note ?? '').trim().replace(/\s+/g, ' ');
	if (!trimmed) return null;
	if (trimmed.length > NOTE_MAX) throw new RuleError('note_too_long', `keep the note under ${NOTE_MAX} characters`, { max: NOTE_MAX });
	return trimmed;
}

function duplicate(clash: Film): RuleError {
	if (clash.status === 'watched') {
		return new RuleError('dup_watched', `we watched ${clash.title} in week ${clash.watched_week}`, {
			title: clash.title,
			week: clash.watched_week ?? 0
		});
	}
	if (clash.status === 'archived') {
		return new RuleError('dup_archived', `${clash.title} is archived; a vote brings it back`, {
			title: clash.title
		});
	}
	return new RuleError('dup_active', `${clash.title} is already on the list`, {
		title: clash.title
	});
}

/**
 * §4.1: a dropped film does not block, that is what Re-nominate is for. Nor does
 * an archival proposition: somebody having suggested it at a night two years ago
 * and the room never watching it is no reason it cannot go up now. An archival
 * film we did watch still blocks, which is the whole point of writing it down.
 */
function assertNotDuplicate(db: DB, input: NominationInput): void {
	const key = titleKey(input.title);
	if (!key) throw new RuleError('no_title', 'give the film a title');

	if (input.tmdbId) {
		const clash = db
			.prepare(
				`SELECT * FROM film WHERE tmdb_id = ? AND status IN ('active','archived','watched')
			   AND (archival = 0 OR status = 'watched') LIMIT 1`
			)
			.get(input.tmdbId) as Film | undefined;
		if (clash) throw duplicate(clash);
	}

	const byTitle = db
		.prepare(
			`SELECT * FROM film WHERE title_key = ? AND status IN ('active','archived','watched')
			   AND (archival = 0 OR status = 'watched') LIMIT 1`
		)
		.get(key) as Film | undefined;
	if (byTitle) throw duplicate(byTitle);
}

function assertNominationSlot(db: DB, rules: RuleSet, personId: string, week: number): void {
	// archival rows are a record of a past night, not a claim on this week's slot.
	// Deliberately stricter than the index, which also lets watched films go: a
	// film marked watched mid-round should not hand its nominator a second turn
	const row = db
		.prepare(
			'SELECT COUNT(*) AS n FROM film WHERE added_by = ? AND added_week = ? AND archival = 0'
		)
		.get(personId, week) as { n: number };
	if (row.n >= rules.nominationsPerWeek) {
		throw new RuleError('already_nominated', 'you have already nominated a film this week');
	}
}

function insertFilm(db: DB, input: NominationInput, personId: string, week: number): number {
	const result = db
		.prepare(
			`INSERT INTO film (title, title_key, year, director, genre, runtime, tmdb_id, poster_url,
			                   overview, note, added_by, added_week, status, score, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?)`
		)
		.run(
			input.title.trim(),
			titleKey(input.title),
			input.year ?? null,
			input.director ?? null,
			input.genre ?? null,
			input.runtime ?? null,
			input.tmdbId ?? null,
			input.posterUrl ?? null,
			input.overview ?? null,
			cleanNote(input.note),
			personId,
			week,
			iso()
		);
	return Number(result.lastInsertRowid);
}

/** §9: the pitch belongs to whoever nominated the film, and only to them */
export function setNote(db: DB, personId: string, filmId: number, note: string): void {
	immediate(db, () => {
		const film = filmById(db, filmId);
		if (!film) throw new RuleError('no_film', 'no such film');
		if (film.added_by !== personId) {
			throw new RuleError('not_your_note', 'only the person who nominated it can edit the note');
		}
		db.prepare('UPDATE film SET note = ? WHERE id = ?').run(cleanNote(note), filmId);
	});
}

export function nominate(db: DB, rules: RuleSet, personId: string, input: NominationInput): number {
	return immediate(db, () => {
		const week = requireOpenWeek(db);
		assertNominationSlot(db, rules, personId, week.number);
		assertNotDuplicate(db, input);
		const id = insertFilm(db, input, personId, week.number);
		rescoreAll(db, rules, week.number);
		rexpAll(db);
		return id;
	});
}

/** a dropped film comes back as a new row starting from zero, and costs a nomination slot */
export function renominate(db: DB, rules: RuleSet, personId: string, filmId: number): number {
	return immediate(db, () => {
		const week = requireOpenWeek(db);
		const old = filmById(db, filmId);
		if (!old) throw new RuleError('no_film', 'no such film');
		if (old.status !== 'dropped') throw new RuleError('not_dropped', 'that film has not been dropped');
		assertNominationSlot(db, rules, personId, week.number);
		const input: NominationInput = {
			title: old.title,
			year: old.year,
			director: old.director,
			genre: old.genre,
			runtime: old.runtime,
			tmdbId: old.tmdb_id,
			posterUrl: old.poster_url,
			overview: old.overview,
			note: old.note
		};
		assertNotDuplicate(db, input);
		const id = insertFilm(db, input, personId, week.number);
		rescoreAll(db, rules, week.number);
		rexpAll(db);
		return id;
	});
}

type BallotRow = { points: number; prev_points: number; updated_at: string };

function ballotRow(db: DB, personId: string, filmId: number, week: number): BallotRow | undefined {
	return db
		.prepare(
			'SELECT points, prev_points, updated_at FROM ballot WHERE week_number = ? AND person_id = ? AND film_id = ?'
		)
		.get(week, personId, filmId) as BallotRow | undefined;
}

/**
 * §8.3: the lowest value this vote may be set to right now. Inside the grace
 * window that is whatever it was before the last raise; outside it, the vote
 * itself. A row's absence means nothing is committed yet.
 */
export function pointsFloor(rules: RuleSet, row: BallotRow | undefined, now: Date): number {
	if (!row) return 0;
	const sinceRaise = now.getTime() - new Date(row.updated_at).getTime();
	return sinceRaise < rules.voteGraceSeconds * 1000 ? row.prev_points : row.points;
}

/**
 * §8.1. Takes an absolute point value, not a delta, because deltas are not idempotent
 * and double-taps on a phone are common.
 * §8.3. Points can always be added; going down is only allowed back to the floor,
 * and only while the grace window from the last raise is open.
 */
export function setPoints(
	db: DB,
	rules: RuleSet,
	personId: string,
	filmId: number,
	points: number,
	now: Date = new Date()
): void {
	immediate(db, () => {
		const week = requireOpenWeek(db, now);
		if (!Number.isInteger(points) || points < 0) {
			throw new RuleError('bad_points', 'points must be a whole number');
		}

		const film = filmById(db, filmId);
		if (!film) throw new RuleError('no_film', 'no such film');
		if (film.archival) {
			throw new RuleError('film_archival', `${film.title} is a record of a past night`, {
				title: film.title
			});
		}
		if (film.status === 'watched') {
			throw new RuleError('watched_already', `we already watched ${film.title}`, { title: film.title });
		}
		if (film.status === 'dropped') {
			throw new RuleError('film_dropped', `${film.title} was dropped; re-nominate it`, {
				title: film.title
			});
		}

		const row = ballotRow(db, personId, filmId, week.number);
		const current = row?.points ?? 0;
		const floor = pointsFloor(rules, row, now);
		if (points < floor) {
			throw new RuleError(
				'votes_final',
				`a vote is final ${rules.voteGraceSeconds} s after casting; only adding is allowed`,
				{ floor, seconds: rules.voteGraceSeconds }
			);
		}

		const spentElsewhere = spentInWeek(db, personId, week.number) - current;
		const allowance = rules.banking ? bankBalance(db, personId) : rules.pointsPerWeek;
		if (spentElsewhere + points > allowance) {
			const left = allowance - spentElsewhere;
			throw new RuleError(
				'not_enough_points',
				`you have ${left} of ${allowance} points left, so ${points} is too many`,
				{ left, allowance, points }
			);
		}

		if (points > current) {
			// a raise commits at the floor and opens a fresh grace window; raises
			// inside one window collapse so the undo goes back to before them all
			db.prepare(
				`INSERT INTO ballot (week_number, person_id, film_id, points, prev_points, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?)
				 ON CONFLICT(week_number, person_id, film_id)
				 DO UPDATE SET points = excluded.points, prev_points = excluded.prev_points,
				               updated_at = excluded.updated_at`
			).run(week.number, personId, filmId, points, floor, iso(now));
		} else if (points < current && points === 0) {
			db.prepare('DELETE FROM ballot WHERE week_number = ? AND person_id = ? AND film_id = ?').run(
				week.number,
				personId,
				filmId
			);
		} else if (points < current) {
			// an undo keeps the original raise time, so it cannot stretch the window
			db.prepare(
				'UPDATE ballot SET points = ? WHERE week_number = ? AND person_id = ? AND film_id = ?'
			).run(points, week.number, personId, filmId);
		}

		// §8.1: a single vote revives an archived film
		if (film.status === 'archived' && points > 0) {
			db.prepare(`UPDATE film SET status = 'active' WHERE id = ?`).run(filmId);
		}

		rescoreAll(db, rules, week.number);
		rexpAll(db);
	});
}
