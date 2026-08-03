import type { DB } from './db.js';
import type { Night } from './types.js';
import { RuleError } from './types.js';
import { iso, nextDeadline } from './time.js';

/**
 * The calendar of film nights. A week's closes_at is the next planned night, so
 * moving one moves the round with it and skipping one lets the round run on to
 * the date after. An empty calendar is not an error: with nothing planned the
 * app falls back to next Thursday 20:00, which is what it did before any of
 * this existed, so it keeps working whether or not anybody curates it.
 */

export function nightById(db: DB, id: number): Night | undefined {
	return db.prepare('SELECT * FROM night WHERE id = ?').get(id) as Night | undefined;
}

/** planned nights strictly after `from`, soonest first */
export function plannedAfter(db: DB, from: Date): Night[] {
	return db
		.prepare(`SELECT * FROM night WHERE status = 'planned' AND at > ? ORDER BY at`)
		.all(iso(from)) as Night[];
}

/**
 * When the round that opened at `from` should close. Deliberately keyed off the
 * round's own opening instant rather than the wall clock, so the answer is stable
 * every time it is recomputed.
 */
export function nextNight(db: DB, from: Date): Date {
	const planned = plannedAfter(db, from)[0];
	return planned ? new Date(planned.at) : nextDeadline(from);
}

/** true when this round's deadline comes from the calendar rather than the fallback */
export function nightAt(db: DB, at: string): Night | undefined {
	return db.prepare(`SELECT * FROM night WHERE at = ? AND status = 'planned'`).get(at) as
		| Night
		| undefined;
}

/** the whole calendar, newest plans last, for the admin screen */
export function allNights(db: DB): Night[] {
	return db.prepare('SELECT * FROM night ORDER BY at').all() as Night[];
}

function assertFree(db: DB, at: Date, exceptId: number | null): void {
	const clash = db
		.prepare(`SELECT id FROM night WHERE at = ? AND status != 'used' AND id IS NOT ?`)
		.get(iso(at), exceptId) as { id: number } | undefined;
	if (clash) throw new RuleError('night_exists', 'that date and time is already in the calendar');
}

export function addNight(db: DB, at: Date, note: string | null, now: Date = new Date()): number {
	assertFree(db, at, null);
	const result = db
		.prepare(`INSERT INTO night (at, status, note, created_at) VALUES (?, 'planned', ?, ?)`)
		.run(iso(at), note?.trim() || null, iso(now));
	return Number(result.lastInsertRowid);
}

export function moveNight(db: DB, id: number, at: Date, note: string | null): void {
	const night = nightById(db, id);
	if (!night) throw new RuleError('no_night', 'no such night');
	if (night.status === 'used') {
		throw new RuleError('night_used', 'that night has already happened');
	}
	assertFree(db, at, id);
	db.prepare(`UPDATE night SET at = ?, note = ? WHERE id = ?`).run(
		iso(at),
		note?.trim() || null,
		id
	);
}

/** skipping leaves the row in place, so the calendar still shows the week we sat out */
export function setNightStatus(db: DB, id: number, status: 'planned' | 'skipped'): void {
	const night = nightById(db, id);
	if (!night) throw new RuleError('no_night', 'no such night');
	if (night.status === 'used') {
		throw new RuleError('night_used', 'that night has already happened');
	}
	db.prepare('UPDATE night SET status = ? WHERE id = ?').run(status, id);
}

export function deleteNight(db: DB, id: number): void {
	const night = nightById(db, id);
	if (!night) throw new RuleError('no_night', 'no such night');
	if (night.status === 'used') {
		throw new RuleError('night_used', 'that night has already happened');
	}
	db.prepare('DELETE FROM night WHERE id = ?').run(id);
}

/**
 * Stamps the night a round closed on. Matches on the exact instant because that
 * is where closes_at came from; a round that closed on the Thursday fallback, or
 * early by hand, simply matches nothing.
 */
export function markNightUsed(db: DB, week: number, closesAt: string): void {
	db.prepare(`UPDATE night SET status = 'used', week_number = ? WHERE at = ? AND status = 'planned'`).run(
		week,
		closesAt
	);
}
