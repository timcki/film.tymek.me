import { describe, expect, it } from 'vitest';
import { RULE_SETS } from '../src/lib/server/rules.js';
import { setPoints } from '../src/lib/server/films.js';
import { addFilm, freshDb } from './helpers.js';

const T0 = new Date('2026-08-03T12:00:00Z');
/** `seconds` after T0, for stepping through the grace window */
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

const GRACE = RULE_SETS.weekly.voteGraceSeconds;

const myPoints = (db: ReturnType<typeof freshDb>['db'], filmId: number) =>
	(
		db.prepare('SELECT points FROM ballot WHERE person_id = ? AND film_id = ?').get('ala', filmId) as
			| { points: number }
			| undefined
	)?.points ?? 0;

describe('votes are final after the grace window', () => {
	it('allows a full undo within the window', () => {
		const { db, rules } = freshDb('weekly');
		const film = addFilm(db, 'Stalker', 'ala', 1);

		setPoints(db, rules, 'ala', film, 2, at(0));
		setPoints(db, rules, 'ala', film, 0, at(GRACE - 1));
		expect(myPoints(db, film)).toBe(0);
	});

	it('rejects lowering once the window has shut', () => {
		const { db, rules } = freshDb('weekly');
		const film = addFilm(db, 'Stalker', 'ala', 1);

		setPoints(db, rules, 'ala', film, 2, at(0));
		expect(() => setPoints(db, rules, 'ala', film, 1, at(GRACE + 1))).toThrow(/final/);
		expect(myPoints(db, film)).toBe(2);
	});

	it('always allows adding more, however old the vote', () => {
		const { db, rules } = freshDb('weekly');
		const film = addFilm(db, 'Stalker', 'ala', 1);

		setPoints(db, rules, 'ala', film, 1, at(0));
		setPoints(db, rules, 'ala', film, 2, at(3600));
		expect(myPoints(db, film)).toBe(2);
	});

	it('a raise commits at the floor: the undo goes back to it, not to zero', () => {
		const { db, rules } = freshDb('weekly');
		const film = addFilm(db, 'Stalker', 'ala', 1);

		setPoints(db, rules, 'ala', film, 1, at(0));
		// the first point is final by now; the second opens a fresh window
		setPoints(db, rules, 'ala', film, 2, at(GRACE + 10));
		setPoints(db, rules, 'ala', film, 1, at(GRACE + 15));
		expect(myPoints(db, film)).toBe(1);
		expect(() => setPoints(db, rules, 'ala', film, 0, at(GRACE + 20))).toThrow(/final/);
	});

	it('raises inside one window collapse: the undo unwinds them all', () => {
		const { db, rules } = freshDb('weekly');
		const film = addFilm(db, 'Stalker', 'ala', 1);

		setPoints(db, rules, 'ala', film, 1, at(0));
		setPoints(db, rules, 'ala', film, 2, at(5));
		setPoints(db, rules, 'ala', film, 0, at(10));
		expect(myPoints(db, film)).toBe(0);
	});

	it('an undo does not stretch the window', () => {
		const { db, rules } = freshDb('weekly');
		const film = addFilm(db, 'Stalker', 'ala', 1);

		setPoints(db, rules, 'ala', film, 2, at(0));
		setPoints(db, rules, 'ala', film, 1, at(GRACE - 5));
		// the window still runs from the raise at t=0, so it is shut now
		expect(() => setPoints(db, rules, 'ala', film, 0, at(GRACE + 5))).toThrow(/final/);
		expect(myPoints(db, film)).toBe(1);
	});

	it('locked points stay spent: the budget does not come back', () => {
		const { db, rules } = freshDb('weekly');
		const a = addFilm(db, 'Stalker', 'ala', 1);
		const b = addFilm(db, 'Solaris', 'bartek', 1);

		setPoints(db, rules, 'ala', a, rules.pointsPerWeek, at(0));
		// the whole budget is final; nothing left for the other film
		expect(() => setPoints(db, rules, 'ala', b, 1, at(GRACE + 1))).toThrow(/points/);
	});
});
