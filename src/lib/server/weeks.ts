import type { DB } from './db.js';
import { immediate } from './db.js';
import type { Film, Week } from './types.js';
import { RuleError } from './types.js';
import type { RuleSet } from './rules.js';
import { accrue, orderFilms } from './rules.js';
import { iso, nextDeadline, sameWeek } from './time.js';
import { heldIn, ignoreHolds } from './holds.js';
import { markNightUsed, plannedAfter } from './schedule.js';
import { listClock, pointsInWindow, rescoreAll, totalPoints } from './scoring.js';
import { specialOf } from '../specials.js';
import { rexpAll } from './xp.js';
import { newCode } from './tokens.js';
import { spentInRound } from './people.js';

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
	if (week.status !== 'open') throw new RuleError('week_closed', 'voting for this round is closed');
	if (now.getTime() >= new Date(week.closes_at).getTime()) {
		throw new RuleError('deadline_passed', 'voting has closed, the film is starting');
	}
	return week;
}

/**
 * §3.6: the list's own mutations, which a special round puts to sleep. Checked
 * after requireOpenWeek's own refusals, so a closed round still says it is closed.
 */
export function requireListWeek(db: DB, now: Date = new Date()): Week {
	const week = requireOpenWeek(db, now);
	if (week.special) {
		throw new RuleError('list_asleep', 'the list is asleep for the special round', {
			special: week.special
		});
	}
	return week;
}

/** §3.6: the special round's own mutations, which only make sense inside one */
export function requireSpecialWeek(db: DB, now: Date = new Date()): Week & { special: string } {
	const week = requireOpenWeek(db, now);
	if (!week.special) throw new RuleError('no_special', 'this round is not a special one');
	return week as Week & { special: string };
}

/**
 * The Thursday 20:00 a round closes on when the calendar has nothing for it.
 * When the list's last round ended in the same Monday to Sunday week as that
 * Thursday, it is the next week's: a night on Wednesday is not followed by a
 * count on the Thursday after it, and a round decided at 19:50 on the night
 * itself is not followed by one at 20:00. A special round in between left the
 * list asleep, so it is looked past rather than at.
 */
export function fallbackDeadline(db: DB, number: number, opensAt: Date): Date {
	const thursday = nextDeadline(opensAt);
	const list = db
		.prepare('SELECT closes_at FROM week WHERE number < ? AND special IS NULL ORDER BY number DESC LIMIT 1')
		.get(number) as { closes_at: string } | undefined;
	return list && sameWeek(new Date(list.closes_at), thursday) ? nextDeadline(thursday) : thursday;
}

/**
 * When a round that opened at `opensAt` closes: the nearest date in the calendar
 * after it opened, whichever date that is, and only with none planned the
 * Thursday fallback.
 */
export function roundDeadline(db: DB, number: number, opensAt: Date): Date {
	const planned = plannedAfter(db, opensAt)[0];
	return planned ? new Date(planned.at) : fallbackDeadline(db, number, opensAt);
}

export function openWeek(db: DB, number: number, now: Date = new Date()): Week {
	const existing = weekByNumber(db, number);
	if (existing) return existing;
	db.prepare(
		`INSERT INTO week (number, opens_at, closes_at, status) VALUES (?, ?, ?, 'open')`
	).run(number, iso(now), iso(roundDeadline(db, number, now)));
	return weekByNumber(db, number) as Week;
}

/**
 * Points the open round at whatever the calendar now says. Called after every
 * calendar edit and on every scheduler tick, so moving a night moves everybody's
 * countdown at once and the calendar stays the single source of truth.
 */
export function syncOpenWeek(db: DB): Week | undefined {
	const week = currentWeek(db);
	if (!week || week.status !== 'open') return week;
	const closesAt = iso(roundDeadline(db, week.number, new Date(week.opens_at)));
	if (closesAt === week.closes_at) return week;
	db.prepare('UPDATE week SET closes_at = ? WHERE number = ?').run(closesAt, week.number);
	return weekByNumber(db, week.number);
}

/** ordered active films, per §3.2, with their scores as of `week` */
export function standingsFor(db: DB, rules: RuleSet, week: number): (Film & { score: number })[] {
	rescoreAll(db, rules, week);
	const films = db
		.prepare(`SELECT * FROM film WHERE status = 'active' AND archival = 0 AND special IS NULL`)
		.all() as (Film & { score: number })[];
	return orderFilms(films);
}

/**
 * §3.6: a special round's picks, most approved first. The rest of the order is
 * §3.2's, so a tie goes to the pick that was put up first, and never to a coin.
 */
export function specialStandings(db: DB, rules: RuleSet, week: Week): (Film & { score: number })[] {
	rescoreAll(db, rules, week.number);
	const films = db
		.prepare(`SELECT * FROM film WHERE status = 'active' AND special = ? AND added_week = ?`)
		.all(week.special, week.number) as (Film & { score: number })[];
	return orderFilms(films);
}

/** §3.4, evaluated once during week close, after the winner has been removed */
export function applyAttrition(db: DB, rules: RuleSet, week: number): void {
	const films = db
		.prepare(`SELECT * FROM film WHERE status = 'active' AND archival = 0 AND special IS NULL`)
		.all() as Film[];
	// §3.6: age on the list's clock, which a special round does not move
	const clock = listClock(db);
	for (const film of films) {
		if (rules.attrition.kind === 'archive') {
			const age = clock(week) - clock(film.added_week);
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
	for (const person of people) {
		const row = db.prepare('SELECT balance FROM bank WHERE person_id = ?').get(person.id) as
			| { balance: number }
			| undefined;
		const balance = row?.balance ?? rules.pointsPerWeek;
		// §3.6: what was spent before a special round slept counts here, once
		const spent = spentInRound(db, person.id, week);
		const next = Math.max(0, accrue(rules, balance, spent));
		db.prepare(
			`INSERT INTO bank (person_id, balance, updated_at) VALUES (?, ?, ?)
			 ON CONFLICT(person_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at`
		).run(person.id, next, iso());
	}
}

/**
 * What a round leaves behind once it is decided. A list round runs attrition and
 * banks; a special one (§3.6) touches neither, because the list slept through
 * it, and its picks that did not get watched go with it: they were put up for
 * that night, not for the list.
 */
function settle(db: DB, rules: RuleSet, week: Week): void {
	if (week.special) {
		db.prepare(
			`UPDATE film SET status = 'dropped' WHERE status = 'active' AND special = ? AND added_week = ?`
		).run(week.special, week.number);
		return;
	}
	applyAttrition(db, rules, week.number);
	accrueBanks(db, rules, week.number);
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
	// §3.6: a pick brought over from its nominator's list film has now been
	// watched, so the list film goes; what was spent on it stays spent
	if (winner.from_list) {
		db.prepare(`UPDATE film SET status = 'dropped' WHERE id = ? AND status = 'active'`).run(winner.from_list);
	}
	db.prepare(`UPDATE week SET status = 'closed', winner_film_id = ?, resolved_at = ? WHERE number = ?`).run(
		winner.id,
		iso(now),
		week.number
	);
	settle(db, rules, week);
	markNightUsed(db, week.number, week.closes_at);
	endNight(db, week, now);
	const next = openWeek(db, week.number + 1, now);
	rescoreAll(db, rules, next.number);
	rexpAll(db);
}

/**
 * A round decided before its date had its night when it was decided, and that is
 * the date the film wears in the record: the one it was due on never came.
 */
function endNight(db: DB, week: Week, now: Date): void {
	db.prepare('UPDATE week SET closes_at = ? WHERE number = ? AND closes_at > ?').run(
		iso(now),
		week.number,
		iso(now)
	);
}

function closeWithoutWinner(db: DB, rules: RuleSet, week: Week, now: Date): void {
	db.prepare(`UPDATE week SET status = 'closed', winner_film_id = NULL, resolved_at = ? WHERE number = ?`).run(
		iso(now),
		week.number
	);
	settle(db, rules, week);
	markNightUsed(db, week.number, week.closes_at);
	endNight(db, week, now);
	const next = openWeek(db, week.number + 1, now);
	rescoreAll(db, rules, next.number);
}

export type CloseResult =
	| { kind: 'noop' }
	| { kind: 'no-winner' }
	| { kind: 'runoff'; code: string; films: Film[] };

/**
 * §6.1. Idempotent: guarded on status and run in one BEGIN IMMEDIATE transaction,
 * so two concurrent callers produce exactly one winner.
 */
export function closeWeek(db: DB, rules: RuleSet, now: Date = new Date()): CloseResult {
	return immediate(db, () => {
		const week = currentWeek(db);
		if (!week || week.status !== 'open') return { kind: 'noop' } as CloseResult;

		// §3.6: a special round's candidates are its own picks, by approvals
		const special = specialOf(week.special);
		const ranked = special ? specialStandings(db, rules, week) : standingsFor(db, rules, week.number);
		if (ranked.length === 0 || ranked[0].score <= 0) {
			closeWithoutWinner(db, rules, week, now);
			return { kind: 'no-winner' } as CloseResult;
		}

		// points decide who the candidates are; the room decides which one we watch.
		// Even a lone candidate goes to the room: the code on the screen doubles as
		// the attendance sheet, and letting the runoff expire confirms the film
		const candidates = ranked.filter((f) => f.score > 0);
		// §3.5: a film whose nominator asked it to wait is not a candidate tonight,
		// and the film under it moves up. Where every candidate stepped aside none
		// of them does: the room still gets a night and no hold is spent on it.
		// A special round has no holds to honour; its picks cannot be held
		const held = heldIn(db, week.number);
		const awake = candidates.filter((f) => !held.has(f.id));
		if (!awake.length) ignoreHolds(db, week.number);
		const shortlist = (awake.length ? awake : candidates).slice(
			0,
			special ? special.shortlistSize : rules.shortlistSize
		);
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
	});
}

/** runoff.code is unique across every room there has ever been, not just the open ones */
function uniqueCode(db: DB): string {
	const taken = db.prepare('SELECT 1 FROM runoff WHERE code = ?');
	for (let i = 0; i < 50; i++) {
		const code = newCode();
		if (!taken.get(code)) return code;
	}
	throw new Error('could not allocate a unique runoff code');
}
