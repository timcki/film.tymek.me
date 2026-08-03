import { openDatabase, type DB } from '../src/lib/server/db.js';
import { RULE_SETS, titleKey, type RuleSetId, type RuleSet } from '../src/lib/server/rules.js';
import { iso, nextDeadline } from '../src/lib/server/time.js';
import { newToken } from '../src/lib/server/tokens.js';
import { nominate, type NominationInput } from '../src/lib/server/films.js';
import { openWeek } from '../src/lib/server/weeks.js';

export const PEOPLE = ['ala', 'bartek', 'celina', 'darek', 'ewa', 'filip'];

export function freshDb(ruleSetId: RuleSetId = 'banked', now = new Date('2026-08-03T10:00:00Z')) {
	const db = openDatabase(':memory:');
	const rules = RULE_SETS[ruleSetId];
	for (const id of PEOPLE) {
		db.prepare(
			`INSERT INTO person (id, name, colour, token, active, created_at) VALUES (?, ?, '#fff', ?, 1, ?)`
		).run(id, id, newToken(), iso(now));
		db.prepare(`INSERT INTO bank (person_id, balance, updated_at) VALUES (?, ?, ?)`).run(
			id,
			rules.pointsPerWeek,
			iso(now)
		);
	}
	openWeek(db, 1, now);
	return { db, rules };
}

/** inserts a film directly, bypassing the nomination slot check, for scenario setup */
export function addFilm(
	db: DB,
	title: string,
	addedBy: string,
	addedWeek: number,
	extra: Partial<NominationInput> & { createdAt?: string } = {}
): number {
	const result = db
		.prepare(
			`INSERT INTO film (title, title_key, year, director, tmdb_id, poster_url, overview,
			                   added_by, added_week, status, score, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?)`
		)
		.run(
			title,
			titleKey(title),
			extra.year ?? null,
			extra.director ?? null,
			extra.tmdbId ?? null,
			extra.posterUrl ?? null,
			extra.overview ?? null,
			addedBy,
			addedWeek,
			extra.createdAt ?? iso(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)))
		);
	return Number(result.lastInsertRowid);
}

/** makes sure a week row exists, so ballots can be planted in past weeks */
export function ensureWeek(db: DB, number: number, status = 'closed'): void {
	const exists = db.prepare('SELECT 1 FROM week WHERE number = ?').get(number);
	if (exists) return;
	const opensAt = new Date(Date.UTC(2026, 0, 1) + number * 7 * 24 * 3600 * 1000);
	db.prepare('INSERT INTO week (number, opens_at, closes_at, status) VALUES (?, ?, ?, ?)').run(
		number,
		iso(opensAt),
		iso(nextDeadline(opensAt)),
		status
	);
}

/** writes a ballot straight into a (possibly past) week, for scenario setup */
export function castBallot(
	db: DB,
	week: number,
	personId: string,
	filmId: number,
	points: number
): void {
	ensureWeek(db, week);
	db.prepare(
		`INSERT INTO ballot (week_number, person_id, film_id, points, updated_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(week_number, person_id, film_id) DO UPDATE SET points = excluded.points`
	).run(week, personId, filmId, points, iso());
}

/** closes the current week and opens the next one without running the rules engine */
export function forceAdvanceTo(db: DB, target: number, now = new Date('2026-08-03T10:00:00Z')) {
	let week = db.prepare('SELECT * FROM week ORDER BY number DESC LIMIT 1').get() as {
		number: number;
	};
	while (week.number < target) {
		db.prepare(`UPDATE week SET status = 'closed' WHERE number = ?`).run(week.number);
		const opensAt = new Date(now.getTime() + week.number * 7 * 24 * 3600 * 1000);
		db.prepare(
			`INSERT INTO week (number, opens_at, closes_at, status) VALUES (?, ?, ?, 'open')`
		).run(week.number + 1, iso(opensAt), iso(nextDeadline(opensAt)));
		week = { number: week.number + 1 };
	}
}

export function nominateAs(
	db: DB,
	rules: RuleSet,
	personId: string,
	title: string,
	extra: Partial<NominationInput> = {}
): number {
	return nominate(db, rules, personId, { title, ...extra });
}
