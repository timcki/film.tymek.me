import type { DB } from './db.js';
import { immediate } from './db.js';
import type { Film, Week } from './types.js';
import { RuleError } from './types.js';
import type { RuleSet } from './rules.js';
import { accrue, orderFilms } from './rules.js';
import { iso, nextDeadline } from './time.js';
import { pointsInWindow, rescoreAll, totalPoints } from './scoring.js';
import { newCode } from './tokens.js';

export function currentWeek(db: DB): Week | undefined {
	return db.prepare('SELECT * FROM week ORDER BY number DESC LIMIT 1').get() as Week | undefined;
}

export function weekByNumber(db: DB, number: number): Week | undefined {
	return db.prepare('SELECT * FROM week WHERE number = ?').get(number) as Week | undefined;
}

/**
 * §6.2: every mutation checks this inside its transaction. The server decides
 * what time it is; the client's clock is never consulted.
 */
export function requireOpenWeek(db: DB, now: Date = new Date()): Week {
	const week = currentWeek(db);
	if (!week) throw new RuleError('no_week', 'no week is open yet');
	if (week.status === 'runoff') throw new RuleError('room_picking', 'voting is closed; the room is picking');
	if (week.status !== 'open') throw new RuleError('week_closed', 'voting for this week is closed');
	if (now.getTime() >= new Date(week.closes_at).getTime()) {
		throw new RuleError('deadline_passed', 'voting closed at 20:00, the film is starting');
	}
	return week;
}

export function openWeek(db: DB, number: number, now: Date = new Date()): Week {
	const existing = weekByNumber(db, number);
	if (existing) return existing;
	db.prepare(
		`INSERT INTO week (number, opens_at, closes_at, status) VALUES (?, ?, ?, 'open')`
	).run(number, iso(now), iso(nextDeadline(now)));
	return weekByNumber(db, number) as Week;
}

/** ordered active films, per §3.2, with their scores as of `week` */
export function standingsFor(db: DB, rules: RuleSet, week: number): (Film & { score: number })[] {
	rescoreAll(db, rules, week);
	const films = db.prepare(`SELECT * FROM film WHERE status = 'active'`).all() as (Film & {
		score: number;
	})[];
	return orderFilms(films);
}

/** §3.4, evaluated once during week close, after the winner has been removed */
export function applyAttrition(db: DB, rules: RuleSet, week: number): void {
	const films = db.prepare(`SELECT * FROM film WHERE status = 'active'`).all() as Film[];
	for (const film of films) {
		if (rules.attrition.kind === 'archive') {
			const age = week - film.added_week;
			if (totalPoints(db, film.id) === 0 && age >= rules.attrition.afterWeeksAtZero) {
				db.prepare(`UPDATE film SET status = 'archived' WHERE id = ?`).run(film.id);
			}
		} else {
			const window = rules.attrition.afterWeeksWithoutPoints;
			if (pointsInWindow(db, film.id, week, window) === 0) {
				db.prepare(`UPDATE film SET status = 'dropped' WHERE id = ?`).run(film.id);
			}
		}
	}
}

/** §3.3, only when rules.banking */
export function accrueBanks(db: DB, rules: RuleSet, week: number): void {
	if (!rules.banking) return;
	const people = db.prepare('SELECT id FROM person WHERE active = 1').all() as { id: string }[];
	const spentStmt = db.prepare(
		'SELECT COALESCE(SUM(points), 0) AS total FROM ballot WHERE person_id = ? AND week_number = ?'
	);
	for (const person of people) {
		const row = db.prepare('SELECT balance FROM bank WHERE person_id = ?').get(person.id) as
			| { balance: number }
			| undefined;
		const balance = row?.balance ?? rules.pointsPerWeek;
		const spent = (spentStmt.get(person.id, week) as { total: number }).total;
		const next = Math.max(0, accrue(rules, balance, spent));
		db.prepare(
			`INSERT INTO bank (person_id, balance, updated_at) VALUES (?, ?, ?)
			 ON CONFLICT(person_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at`
		).run(person.id, next, iso());
	}
}

/** the winner is watched, the week resolves, attrition and banks run, the next week opens */
export function finish(
	db: DB,
	rules: RuleSet,
	week: Week,
	winner: Film & { score: number },
	now: Date = new Date()
): void {
	db.prepare(
		`UPDATE film SET status = 'watched', watched_week = ?, final_score = ? WHERE id = ?`
	).run(week.number, winner.score, winner.id);
	db.prepare(`UPDATE week SET status = 'closed', winner_film_id = ?, resolved_at = ? WHERE number = ?`).run(
		winner.id,
		iso(now),
		week.number
	);
	applyAttrition(db, rules, week.number);
	accrueBanks(db, rules, week.number);
	const next = openWeek(db, week.number + 1, now);
	rescoreAll(db, rules, next.number);
}

function closeWithoutWinner(db: DB, rules: RuleSet, week: Week, now: Date): void {
	db.prepare(`UPDATE week SET status = 'closed', winner_film_id = NULL, resolved_at = ? WHERE number = ?`).run(
		iso(now),
		week.number
	);
	applyAttrition(db, rules, week.number);
	accrueBanks(db, rules, week.number);
	const next = openWeek(db, week.number + 1, now);
	rescoreAll(db, rules, next.number);
}

export type CloseResult =
	| { kind: 'noop' }
	| { kind: 'no-winner' }
	| { kind: 'winner'; film: Film }
	| { kind: 'runoff'; code: string; films: Film[] };

/**
 * §6.1. Idempotent: guarded on status and run in one BEGIN IMMEDIATE transaction,
 * so two concurrent callers produce exactly one winner.
 */
export function closeWeek(db: DB, rules: RuleSet, now: Date = new Date()): CloseResult {
	return immediate(db, () => {
		const week = currentWeek(db);
		if (!week || week.status !== 'open') return { kind: 'noop' } as CloseResult;

		const ranked = standingsFor(db, rules, week.number);
		if (ranked.length === 0 || ranked[0].score <= 0) {
			closeWithoutWinner(db, rules, week, now);
			return { kind: 'no-winner' } as CloseResult;
		}

		// points decide who the candidates are; the room decides which one we watch
		const shortlist = ranked.filter((f) => f.score > 0).slice(0, rules.shortlistSize);
		if (shortlist.length > 1) {
			const code = uniqueCode(db);
			const result = db
				.prepare(
					`INSERT INTO runoff (week_number, code, created_at, expires_at) VALUES (?, ?, ?, ?)`
				)
				.run(week.number, code, iso(now), iso(new Date(now.getTime() + 3 * 60 * 60 * 1000)));
			const runoffId = Number(result.lastInsertRowid);
			const link = db.prepare('INSERT INTO runoff_film (runoff_id, film_id) VALUES (?, ?)');
			for (const film of shortlist) link.run(runoffId, film.id);
			db.prepare(`UPDATE week SET status = 'runoff' WHERE number = ?`).run(week.number);
			// the week stays unresolved until the room vote closes, or until it expires
			return { kind: 'runoff', code, films: shortlist } as CloseResult;
		}

		finish(db, rules, week, ranked[0], now);
		return { kind: 'winner', film: ranked[0] } as CloseResult;
	});
}

function uniqueCode(db: DB): string {
	const taken = db.prepare('SELECT code FROM runoff WHERE closed_at IS NULL');
	for (let i = 0; i < 50; i++) {
		const code = newCode();
		const clash = taken.all().some((row) => (row as { code: string }).code === code);
		if (!clash) return code;
	}
	throw new Error('could not allocate a unique runoff code');
}
