import { error } from '@sveltejs/kit';
import type { DB } from './db.js';
import type { Person } from './types.js';
import { iso } from './time.js';

/**
 * Admin is a flag on a person, not a separate login: whoever holds the personal
 * link is already that person as far as the app is concerned, and a second
 * password on top of it would only be theatre. The flag is seeded from ADMINS at
 * boot so a fresh database comes up with someone able to get in, after which the
 * admin screen itself is how it is granted and revoked.
 */

export function adminIds(): string[] {
	return (process.env.ADMINS ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);
}

/** grants only: revoking is a deliberate act in the UI, never a side effect of a deploy */
export function seedAdmins(db: DB): void {
	const grant = db.prepare('UPDATE person SET is_admin = 1 WHERE id = ? AND is_admin = 0');
	for (const id of adminIds()) grant.run(id);
}

export function isAdmin(person: Person | null | undefined): boolean {
	return Boolean(person && person.is_admin && person.active);
}

/**
 * 404 rather than 403: the other twenty people have no reason to learn that
 * /admin is a page at all. Called at the top of every admin load and action, so
 * the route gate in hooks.server.ts is a second line and never the only one.
 */
export function requireAdmin(person: Person | null | undefined): Person {
	if (!isAdmin(person)) throw error(404, 'Not found');
	return person as Person;
}

export type AuditRow = {
	id: number;
	person_id: string;
	action: string;
	target: string | null;
	detail: string | null;
	created_at: string;
};

/** what changed, who changed it, and what it looked like before */
export function logAdmin(
	db: DB,
	personId: string,
	action: string,
	target: string | null = null,
	detail: string | null = null,
	now: Date = new Date()
): void {
	db.prepare(
		'INSERT INTO audit (person_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)'
	).run(personId, action, target, detail, iso(now));
}

export function recentAudit(db: DB, limit = 40): (AuditRow & { person_name: string })[] {
	return db
		.prepare(
			`SELECT a.*, COALESCE(p.name, a.person_id) AS person_name
			 FROM audit a LEFT JOIN person p ON p.id = a.person_id
			 ORDER BY a.id DESC LIMIT ?`
		)
		.all(limit) as (AuditRow & { person_name: string })[];
}
