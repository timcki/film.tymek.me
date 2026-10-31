import type { DB } from './db.js';
import { immediate } from './db.js';
import { RuleError } from './types.js';
import { iso } from './time.js';
import { rexpAll } from './xp.js';

/** a name picked on a shared phone arrives as a bare id, so it has to be somebody on the roster */
export function requireActive(db: DB, personId: string): void {
	const person = db.prepare('SELECT active FROM person WHERE id = ?').get(personId) as
		| { active: number }
		| undefined;
	if (!person?.active) throw new RuleError('no_person', 'no such person');
}

/** §7.4: records presence once per night; scanning again changes nothing */
export function checkIn(db: DB, weekNumber: number, personId: string, now: Date = new Date()): void {
	immediate(db, () => {
		requireActive(db, personId);
		const result = db
			.prepare(
				`INSERT OR IGNORE INTO attendance (week_number, person_id, checked_in_at) VALUES (?, ?, ?)`
			)
			.run(weekNumber, personId, iso(now));
		if (result.changes > 0) rexpAll(db);
	});
}

export function attended(db: DB, weekNumber: number, personId: string): boolean {
	return Boolean(
		db
			.prepare('SELECT 1 FROM attendance WHERE week_number = ? AND person_id = ?')
			.get(weekNumber, personId)
	);
}

export function attendedWeeks(db: DB, personId: string): number[] {
	return (
		db
			.prepare('SELECT week_number FROM attendance WHERE person_id = ? ORDER BY week_number')
			.all(personId) as { week_number: number }[]
	).map((r) => r.week_number);
}
