import { describe, expect, it } from 'vitest';
import { applyAttrition, closeWeek } from '../src/lib/server/weeks.js';
import { closeRunoff, openRunoff } from '../src/lib/server/runoffs.js';
import { filmById, setPoints } from '../src/lib/server/films.js';
import { addFilm, castBallot, forceAdvanceTo, freshDb } from './helpers.js';

describe('attrition', () => {
	// 20. ledger: zero points for 8 weeks is archived; a single vote revives it
	it('ledger: archives after eight pointless weeks and a vote brings it back', () => {
		const { db, rules } = freshDb('ledger');
		const film = addFilm(db, 'Stalker', 'ala', 1);

		applyAttrition(db, rules, 8);
		expect(filmById(db, film)!.status).toBe('active'); // week 8, age 7, not yet

		applyAttrition(db, rules, 9);
		expect(filmById(db, film)!.status).toBe('archived'); // age 8

		forceAdvanceTo(db, 9);
		setPoints(db, rules, 'ala', film, 1);
		expect(filmById(db, film)!.status).toBe('active');
	});

	it('ledger: a film with points is never archived', () => {
		const { db, rules } = freshDb('ledger');
		const film = addFilm(db, 'Stalker', 'ala', 1);
		castBallot(db, 1, 'ala', film, 1);
		applyAttrition(db, rules, 20);
		expect(filmById(db, film)!.status).toBe('active');
	});

	// 21. rolling: no points this week is dropped
	it('rolling: one pointless week drops the film', () => {
		const { db, rules } = freshDb('rolling');
		const backed = addFilm(db, 'Stalker', 'ala', 1);
		const ignored = addFilm(db, 'Solaris', 'bartek', 1);
		castBallot(db, 3, 'ala', backed, 2);

		applyAttrition(db, rules, 3);
		expect(filmById(db, backed)!.status).toBe('active');
		expect(filmById(db, ignored)!.status).toBe('dropped');
	});

	// 22. banked: two consecutive pointless weeks are needed
	it('banked: survives one pointless week, drops after two', () => {
		const { db, rules } = freshDb('banked');
		const film = addFilm(db, 'Stalker', 'ala', 1);
		castBallot(db, 3, 'ala', film, 2);

		applyAttrition(db, rules, 4); // window {3,4} still has week 3's points
		expect(filmById(db, film)!.status).toBe('active');

		applyAttrition(db, rules, 5); // window {4,5} is empty
		expect(filmById(db, film)!.status).toBe('dropped');
	});

	it('banked: a brand-new nomination nobody votes for gets no grace week', () => {
		const { db, rules } = freshDb('banked');
		const film = addFilm(db, 'Stalker', 'ala', 1);
		applyAttrition(db, rules, 1);
		expect(filmById(db, film)!.status).toBe('dropped');
	});

	// 23. attrition runs after the winner is removed, so the winner is never archived
	it('the winner is watched, never swept up by attrition', () => {
		const { db, rules } = freshDb('banked');
		const winner = addFilm(db, 'Stalker', 'ala', 1);
		const loser = addFilm(db, 'Solaris', 'bartek', 1);
		setPoints(db, rules, 'ala', winner, 2);

		closeWeek(db, rules);
		closeRunoff(db, rules, openRunoff(db)!.id);
		expect(filmById(db, winner)!.status).toBe('watched');
		expect(filmById(db, loser)!.status).toBe('dropped');
	});
});
