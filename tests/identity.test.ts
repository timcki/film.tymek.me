import { describe, expect, it } from 'vitest';
import { personByToken, rotateToken } from '../src/lib/server/people.js';
import { setPoints } from '../src/lib/server/films.js';
import { flashVote } from '../src/lib/server/runoffs.js';
import { closeWeek } from '../src/lib/server/weeks.js';
import { openRunoff } from '../src/lib/server/runoffs.js';
import { backTo } from '../src/lib/server/respond.js';
import { addFilm, freshDb } from './helpers.js';

describe('identity', () => {
	// 31. /u/:token resolves a person; an unknown token resolves nothing
	it('a token resolves to its person and an unknown token resolves to nothing', () => {
		const { db } = freshDb('banked');
		const token = (db.prepare('SELECT token FROM person WHERE id = ?').get('ala') as {
			token: string;
		}).token;

		expect(personByToken(db, token)?.id).toBe('ala');
		expect(personByToken(db, 'not-a-real-token')).toBeUndefined();
	});

	// 32. rotating a token invalidates the old link
	it('rotating a token invalidates the old link', () => {
		const { db } = freshDb('banked');
		const before = (db.prepare('SELECT token FROM person WHERE id = ?').get('ala') as {
			token: string;
		}).token;

		const after = rotateToken(db, 'ala');
		expect(after).not.toBe(before);
		expect(personByToken(db, before)).toBeUndefined();
		expect(personByToken(db, after)?.id).toBe('ala');
	});

	it('an inactive person cannot be resolved by their token', () => {
		const { db } = freshDb('banked');
		const token = (db.prepare('SELECT token FROM person WHERE id = ?').get('ala') as {
			token: string;
		}).token;
		db.prepare('UPDATE person SET active = 0 WHERE id = ?').run('ala');
		expect(personByToken(db, token)).toBeUndefined();
	});

	// 33. mutating routes need a person; the runoff is the documented exception
	it('a flash vote works without any person, a weekly vote does not', () => {
		const { db, rules } = freshDb('banked');
		const first = addFilm(db, 'Stalker', 'ala', 1, { createdAt: '2026-01-01T00:00:00.000Z' });
		const second = addFilm(db, 'Solaris', 'bartek', 1, { createdAt: '2026-01-02T00:00:00.000Z' });
		setPoints(db, rules, 'ala', first, 2);
		setPoints(db, rules, 'bartek', second, 2);
		closeWeek(db, rules);

		const runoff = openRunoff(db)!;
		// no person_id at all: a guest on a device key
		expect(() => flashVote(db, runoff.id, 'device-xyz', null, [first, second])).not.toThrow();

		// a weekly ballot always needs a real person; the foreign key sees to it
		expect(() => setPoints(db, rules, 'nobody', first, 1)).toThrow();
	});
});

describe('going back after a toggle', () => {
	const here = new URL('https://film.tymek.me/lang');

	it('returns to a page of this app, query and all', () => {
		expect(backTo('/stats?lens=films&era=app', here)).toBe('/stats?lens=films&era=app');
	});

	it('never leaves for somebody else, however the address is dressed up', () => {
		for (const to of ['//evil.com', '/\\evil.com', 'https://evil.com/', '\\\\evil.com', 'javascript:alert(1)']) {
			expect(backTo(to, here)).toBe('/');
		}
		expect(backTo(null, here)).toBe('/');
	});
});
