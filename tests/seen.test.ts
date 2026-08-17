import { describe, expect, it } from 'vitest';
import { seenCounts, seenOf, toggleSeen } from '../src/lib/server/seen.js';
import { freshDb, nominateAs } from './helpers.js';

/** owning up to a rewatch: a toggle per person per film, faces attached */
describe('seen marks', () => {
	it('toggles on and off, reporting the state it landed in', () => {
		const { db, rules } = freshDb('banked');
		const film = nominateAs(db, rules, 'ala', 'Stalker');
		expect(toggleSeen(db, 'bartek', film)).toBe(true);
		expect(seenOf(db, [film]).get(film)).toHaveLength(1);
		expect(toggleSeen(db, 'bartek', film)).toBe(false);
		expect(seenOf(db, [film]).get(film)).toBeUndefined();
	});

	it('collects everyone who owned up, in order, with their faces', () => {
		const { db, rules } = freshDb('banked');
		const film = nominateAs(db, rules, 'ala', 'Stalker');
		toggleSeen(db, 'bartek', film, new Date('2026-08-03T11:00:00Z'));
		toggleSeen(db, 'celina', film, new Date('2026-08-03T12:00:00Z'));

		const faces = seenOf(db, [film]).get(film)!;
		expect(faces.map((face) => face.name)).toEqual(['bartek', 'celina']);
		expect(faces[0].colour).toBe('#fff');
		expect(seenCounts(db, [film])).toEqual({ [film]: 2 });
	});

	it('refuses a mark on a film that does not exist', () => {
		const { db } = freshDb('banked');
		expect(() => toggleSeen(db, 'ala', 999)).toThrow(/no such film/);
	});

	it('returns an empty map for no films without a malformed query', () => {
		const { db } = freshDb('banked');
		expect(seenOf(db, []).size).toBe(0);
		expect(seenCounts(db, [])).toEqual({});
	});
});
