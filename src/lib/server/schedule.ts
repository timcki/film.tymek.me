import type { DB } from './db.js';
import type { Night } from './types.js';
import { RuleError } from './types.js';
import { iso } from './time.js';

/**
 * The calendar of film nights. A week's closes_at is the next planned night, so
 * moving one moves the round with it and deleting one lets the round run on to
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

/** a planned night is a deadline, and one already behind us would close the round on the next tick */
function assertAhead(at: Date, now: Date): void {
	if (at.getTime() <= now.getTime()) {
		throw new RuleError('night_past', 'that date and time is already behind us');
	}
}

export function addNight(
	db: DB,
	at: Date,
	note: string | null,
	now: Date = new Date(),
	extra = false
): number {
	assertAhead(at, now);
	assertFree(db, at, null);
	const result = db
		.prepare(`INSERT INTO night (at, status, note, extra, created_at) VALUES (?, 'planned', ?, ?, ?)`)
		.run(iso(at), note?.trim() || null, extra ? 1 : 0, iso(now));
	return Number(result.lastInsertRowid);
}

export function moveNight(
	db: DB,
	id: number,
	at: Date,
	note: string | null,
	now: Date = new Date()
): void {
	const night = nightById(db, id);
	if (!night) throw new RuleError('no_night', 'no such night');
	if (night.status === 'used') {
		throw new RuleError('night_used', 'that night has already happened');
	}
	assertAhead(at, now);
	assertFree(db, at, id);
	db.prepare(`UPDATE night SET at = ?, note = ? WHERE id = ?`).run(
		iso(at),
		note?.trim() || null,
		id
	);
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
 * Stamps the night a round was due on. Matches on the exact instant because that
 * is where closes_at came from, so it runs before an early close rewrites it; a
 * round that closed on the Thursday fallback simply matches nothing.
 */
export function markNightUsed(db: DB, week: number, closesAt: string): void {
	db.prepare(`UPDATE night SET status = 'used', week_number = ? WHERE at = ? AND status = 'planned'`).run(
		week,
		closesAt
	);
}
