import type { DB } from './db.js';
import type { Face, Person } from './types.js';
import { RuleError } from './types.js';
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

/**
 * The picture's URL, or null when someone has not uploaded one and their
 * initials on a colour will do. The timestamp busts the cache on replacement,
 * which lets the route itself be cached hard.
 */
export function avatarUrl(id: string, updatedAt: string | null): string | null {
	return updatedAt ? `/avatar/${encodeURIComponent(id)}?v=${Date.parse(updatedAt)}` : null;
}

export function faceOf(person: Person): Face {
	return {
		id: person.id,
		name: person.name,
		colour: person.colour,
		avatar: avatarUrl(person.id, person.avatar_updated_at)
	};
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** what the bytes actually are, not what the browser claimed in the part header */
function sniffImage(bytes: Uint8Array): string | null {
	const at = (offset: number, ...signature: number[]) =>
		signature.every((byte, i) => bytes[offset + i] === byte);
	if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
	if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
	// RIFF....WEBP
	if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
	return null;
}

export function setAvatar(db: DB, personId: string, bytes: Uint8Array): void {
	if (!bytes.length) throw new RuleError('empty_file', 'empty file');
	if (bytes.length > MAX_AVATAR_BYTES) throw new RuleError('avatar_too_big', 'that picture is too big; 2 MB max', { mb: 2 });
	const mime = sniffImage(bytes);
	if (!mime) throw new RuleError('avatar_not_image', 'that is not a JPEG, PNG or WebP');
	db.prepare(
		'UPDATE person SET avatar = ?, avatar_mime = ?, avatar_updated_at = ? WHERE id = ?'
	).run(Buffer.from(bytes), mime, iso(), personId);
}

export function clearAvatar(db: DB, personId: string): void {
	db.prepare(
		'UPDATE person SET avatar = NULL, avatar_mime = NULL, avatar_updated_at = NULL WHERE id = ?'
	).run(personId);
}

export function avatarOf(
	db: DB,
	personId: string
): { bytes: Uint8Array; mime: string; updatedAt: string } | undefined {
	const row = db
		.prepare('SELECT avatar, avatar_mime, avatar_updated_at FROM person WHERE id = ?')
		.get(personId) as
		| { avatar: Uint8Array | null; avatar_mime: string | null; avatar_updated_at: string | null }
		| undefined;
	if (!row?.avatar || !row.avatar_mime || !row.avatar_updated_at) return undefined;
	return { bytes: row.avatar, mime: row.avatar_mime, updatedAt: row.avatar_updated_at };
}
