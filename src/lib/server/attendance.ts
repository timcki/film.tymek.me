import type { DB } from './db.js';
import { iso } from './time.js';

/** §7.4: records presence once per night; scanning again changes nothing */
export function checkIn(db: DB, weekNumber: number, personId: string, now: Date = new Date()): void {
	db.prepare(
		`INSERT OR IGNORE INTO attendance (week_number, person_id, checked_in_at) VALUES (?, ?, ?)`
	).run(weekNumber, personId, iso(now));
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
