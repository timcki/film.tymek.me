import type { DB } from './db.js';
import type { Person } from './types.js';
import { iso } from './time.js';
import { newToken } from './tokens.js';
import type { RuleSet } from './rules.js';
import { budget as budgetFor } from './rules.js';

export function personByToken(db: DB, token: string): Person | undefined {
	return db.prepare('SELECT * FROM person WHERE token = ? AND active = 1').get(token) as
		| Person
		| undefined;
}

export function personById(db: DB, id: string): Person | undefined {
	return db.prepare('SELECT * FROM person WHERE id = ?').get(id) as Person | undefined;
}

export function allPeople(db: DB): Person[] {
	return db
		.prepare('SELECT * FROM person WHERE active = 1 ORDER BY name COLLATE NOCASE')
		.all() as Person[];
}

export function rotateToken(db: DB, personId: string): string {
	const token = newToken();
	db.prepare('UPDATE person SET token = ? WHERE id = ?').run(token, personId);
	return token;
}

export function bankBalance(db: DB, personId: string): number {
	const row = db.prepare('SELECT balance FROM bank WHERE person_id = ?').get(personId) as
		| { balance: number }
		| undefined;
	return row?.balance ?? 0;
}

export function setBankBalance(db: DB, personId: string, balance: number): void {
	db.prepare(
		`INSERT INTO bank (person_id, balance, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(person_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at`
	).run(personId, balance, iso());
}

export function spentInWeek(db: DB, personId: string, week: number): number {
	const row = db
		.prepare(
			'SELECT COALESCE(SUM(points), 0) AS total FROM ballot WHERE person_id = ? AND week_number = ?'
		)
		.get(personId, week) as { total: number };
	return row.total;
}

/** the point budget this person has for the current week */
export function budgetOf(db: DB, rules: RuleSet, personId: string): number {
	return budgetFor(rules, bankBalance(db, personId));
}
