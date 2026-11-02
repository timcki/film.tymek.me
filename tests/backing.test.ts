import { describe, expect, it } from 'vitest';
import { addFilm, castBallot, ensureWeek, freshDb } from './helpers.js';
import { backing } from '../src/lib/server/stats.js';
import { ringOrder } from '../src/lib/ring.js';

const ALL = { from: 1, to: 99 };

describe('who backs whom', () => {
	it('sums what each person spent on each other person’s films, one way at a time', () => {
		const { db } = freshDb();
		const a = addFilm(db, 'Heat', 'ala', 1);
		ensureWeek(db, 2);
		const a2 = addFilm(db, 'Paddington', 'ala', 2);
		const b = addFilm(db, 'Solaris', 'bartek', 1);
		castBallot(db, 1, 'bartek', a, 2);
		castBallot(db, 2, 'bartek', a2, 1);
		castBallot(db, 1, 'ala', b, 1);

		expect(backing(db, ALL).links).toEqual([
			{ from: 'bartek', to: 'ala', points: 3 },
			{ from: 'ala', to: 'bartek', points: 1 }
		]);
	});

	it('leaves out what somebody spent on their own films', () => {
		const { db } = freshDb();
		const a = addFilm(db, 'A', 'ala', 1);
		castBallot(db, 1, 'ala', a, 3);

		expect(backing(db, ALL)).toEqual({ people: [], links: [] });
	});

	it('lists the busiest person first and only those with a link', () => {
		const { db } = freshDb();
		const a = addFilm(db, 'A', 'ala', 1);
		const b = addFilm(db, 'B', 'bartek', 1);
		castBallot(db, 1, 'celina', a, 1);
		castBallot(db, 1, 'celina', b, 3);
		castBallot(db, 1, 'ala', b, 1);

		expect(backing(db, ALL).people.map((p) => p.id)).toEqual(['bartek', 'celina', 'ala']);
	});

	it('counts only the rounds inside the window', () => {
		const { db } = freshDb();
		const a = addFilm(db, 'A', 'ala', 1);
		castBallot(db, 1, 'bartek', a, 1);
		castBallot(db, 2, 'bartek', a, 2);

		expect(backing(db, { from: 2, to: 2 }).links).toEqual([{ from: 'bartek', to: 'ala', points: 2 }]);
	});
});

describe('ringOrder', () => {
	const tie: Record<string, number> = { 'a-c': 5, 'c-b': 4, 'b-d': 1 };
	const weight = (x: string, y: string) => tie[`${x}-${y}`] ?? tie[`${y}-${x}`] ?? 0;

	it('seats each person next to whoever they are most tied to', () => {
		expect(ringOrder(['a', 'b', 'c', 'd'], weight)).toEqual(['a', 'c', 'b', 'd']);
	});

	it('keeps the caller’s order between equals, and seats everybody once', () => {
		expect(ringOrder(['a', 'b', 'c'], () => 0)).toEqual(['a', 'b', 'c']);
		expect(ringOrder([], weight)).toEqual([]);
	});
});
