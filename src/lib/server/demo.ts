import type { DB } from './db.js';
import type { Person } from './types.js';
import { currentWeek } from './weeks.js';

/**
 * Who a visitor to the demo gets to be. Everything past this point is the
 * ordinary app reading an ordinary person off locals: the demo never forks the
 * rules, it only decides which of the made-up people is holding the phone.
 *
 * Three, because three states are worth seeing. A regular member is the app as
 * twenty of the twenty-two experience it; the admin is the only way to reach the
 * back office, /host being open to anyone holding a link here as it is there; and
 * somebody who has not voted this week is the only way to see a full budget,
 * which is otherwise a state you have to wait a week for.
 */
export type PersonaKind = 'member' | 'admin' | 'fresh';

export const PERSONAS: PersonaKind[] = ['member', 'admin', 'fresh'];

export function isPersonaKind(value: string | null | undefined): value is PersonaKind {
	return value === 'member' || value === 'admin' || value === 'fresh';
}

/** picked by id rather than at random, so the demo is the same demo every hour */
export function personas(db: DB): Record<PersonaKind, Person | undefined> {
	const member = db
		.prepare('SELECT * FROM person WHERE active = 1 AND is_admin = 0 ORDER BY id LIMIT 1')
		.get() as Person | undefined;
	const admin = db
		.prepare('SELECT * FROM person WHERE active = 1 AND is_admin = 1 ORDER BY id LIMIT 1')
		.get() as Person | undefined;

	const week = currentWeek(db);
	const spoken = [member?.id ?? '', admin?.id ?? ''];
	const fresh = week
		? (db
				.prepare(
					`SELECT * FROM person WHERE active = 1 AND id NOT IN (?, ?)
					   AND id NOT IN (SELECT person_id FROM ballot WHERE week_number = ?)
					 ORDER BY id LIMIT 1`
				)
				.get(spoken[0], spoken[1], week.number) as Person | undefined)
		: undefined;

	return {
		member,
		admin,
		// a demo where everybody has already spent their points still has to offer a
		// third face, so it falls back to whoever is next rather than to nobody
		fresh:
			fresh ??
			(db
				.prepare('SELECT * FROM person WHERE active = 1 AND id NOT IN (?, ?) ORDER BY id LIMIT 1')
				.get(spoken[0], spoken[1]) as Person | undefined)
	};
}

/** who a visitor with no cookie is, which is a regular member and never the admin */
export function demoDefault(db: DB): Person | null {
	const picked = personas(db).member;
	if (picked) return picked;
	return (
		(db.prepare('SELECT * FROM person WHERE active = 1 ORDER BY id LIMIT 1').get() as
			| Person
			| undefined) ?? null
	);
}
