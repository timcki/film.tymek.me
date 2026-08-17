import { describe, expect, it } from 'vitest';
import { holdFilm, releaseFilm, setPoints, standings } from '../src/lib/server/films.js';
import { heldIn, holdOf } from '../src/lib/server/holds.js';
import { closeWeek } from '../src/lib/server/weeks.js';
import { closeRunoff, openRunoff, runoffFilms } from '../src/lib/server/runoffs.js';
import { filmById } from '../src/lib/server/films.js';
import { addFilm, castBallot, forceAdvanceTo, freshDb } from './helpers.js';

/**
 * §3.5. Somebody who cannot make the night asks their own film to sit the round
 * out: it keeps its score and fades like everything else, it simply is not a
 * candidate, and the film under it takes the slot.
 */
describe('holding a film back', () => {
	/** four backed films, one per person, in a clear scoring order */
	function fourFilms(ruleSetId: 'banked' | 'weekly' = 'banked') {
		const { db, rules } = freshDb(ruleSetId);
		const people = ['ala', 'bartek', 'celina', 'darek'];
		const films = ['A', 'B', 'C', 'D'].map((title, index) =>
			addFilm(db, title, people[index], 1)
		);
		[4, 3, 2, 1].forEach((points, index) => castBallot(db, 1, people[index], films[index], points));
		return { db, rules, films };
	}

	it('drops the held film from the shortlist and promotes the next one', () => {
		const { db, rules, films } = fourFilms();
		holdFilm(db, 'ala', films[0]);

		closeWeek(db, rules);
		const shortlisted = runoffFilms(db, openRunoff(db)!.id).map((f) => f.title).sort();
		// A led on points and stepped aside, so D takes the third seat
		expect(shortlisted).toEqual(['B', 'C', 'D']);
	});

	it('leaves the held film on the list with its score untouched', () => {
		const { db, rules, films } = fourFilms();
		holdFilm(db, 'ala', films[0]);
		closeWeek(db, rules);

		const kept = filmById(db, films[0])!;
		expect(kept.status).toBe('active');
		expect(kept.score).toBe(4);
	});

	it('does not shield the film from attrition', () => {
		// 'weekly' drops a film with no points in the last two rounds; a hold is
		// not a hiding place, which is what stops it entrenching a leader
		const { db, rules } = freshDb('weekly');
		const backed = addFilm(db, 'Backed', 'ala', 1);
		const silent = addFilm(db, 'Silent', 'bartek', 1);
		castBallot(db, 1, 'ala', backed, 2);
		holdFilm(db, 'bartek', silent);

		// attrition runs in finish(), once the room has picked
		closeWeek(db, rules);
		closeRunoff(db, rules, openRunoff(db)!.id);
		expect(filmById(db, silent)!.status).toBe('dropped');
	});

	it('honours nobody when every candidate has stepped aside', () => {
		const { db, rules } = freshDb('banked');
		const mine = addFilm(db, 'Mine', 'ala', 1);
		const yours = addFilm(db, 'Yours', 'bartek', 1);
		castBallot(db, 1, 'ala', mine, 2);
		castBallot(db, 1, 'bartek', yours, 1);
		holdFilm(db, 'ala', mine);
		holdFilm(db, 'bartek', yours);

		closeWeek(db, rules);
		const shortlisted = runoffFilms(db, openRunoff(db)!.id).map((f) => f.title).sort();
		expect(shortlisted).toEqual(['Mine', 'Yours']);
		// the rows stay as a record of what was asked for, marked as not counted
		const rows = db.prepare('SELECT applied FROM film_hold WHERE week_number = 1').all() as {
			applied: number;
		}[];
		expect(rows.map((r) => r.applied)).toEqual([0, 0]);
	});

	it('still leaves a short shortlist rather than refusing the hold', () => {
		// no replacement is waiting, and the room picking between two is fine
		const { db, rules } = freshDb('banked');
		const films = ['A', 'B', 'C'].map((title, index) =>
			addFilm(db, title, ['ala', 'bartek', 'celina'][index], 1)
		);
		[3, 2, 1].forEach((points, index) =>
			castBallot(db, 1, ['ala', 'bartek', 'celina'][index], films[index], points)
		);
		holdFilm(db, 'ala', films[0]);

		closeWeek(db, rules);
		expect(runoffFilms(db, openRunoff(db)!.id)).toHaveLength(2);
	});

	it('releases the film back into the running while the round is open', () => {
		const { db, rules, films } = fourFilms();
		holdFilm(db, 'ala', films[0]);
		releaseFilm(db, 'ala', films[0]);
		expect(heldIn(db, 1).size).toBe(0);

		closeWeek(db, rules);
		const shortlisted = runoffFilms(db, openRunoff(db)!.id).map((f) => f.title).sort();
		expect(shortlisted).toEqual(['A', 'B', 'C']);
	});

	it('lets only the nominator hold a film back', () => {
		const { db, films } = fourFilms();
		expect(() => holdFilm(db, 'bartek', films[0])).toThrow(/nominated/);
		expect(() => releaseFilm(db, 'bartek', films[0])).toThrow(/nominated/);
		expect(heldIn(db, 1).size).toBe(0);
	});

	it('allows one hold per person per round', () => {
		// two live films of one person's, nominated a round apart
		const { db } = freshDb('banked');
		const first = addFilm(db, 'First', 'ala', 1);
		forceAdvanceTo(db, 2);
		const second = addFilm(db, 'Second', 'ala', 2);
		holdFilm(db, 'ala', first);
		expect(() => holdFilm(db, 'ala', second)).toThrow(/First/);

		// swapping is free: let the first one go and the second may take the hold
		releaseFilm(db, 'ala', first);
		holdFilm(db, 'ala', second);
		expect(holdOf(db, 2, 'ala')!.film_id).toBe(second);
	});

	it('rewrites the reason when the same hold is placed again', () => {
		const { db, films } = fourFilms();
		holdFilm(db, 'ala', films[0], 'jestem w Warszawie');
		holdFilm(db, 'ala', films[0], 'wracam w piątek');
		expect(holdOf(db, 1, 'ala')!.reason).toBe('wracam w piątek');
	});

	it('refuses once the room is picking', () => {
		const { db, rules, films } = fourFilms();
		closeWeek(db, rules);
		expect(() => holdFilm(db, 'ala', films[0])).toThrow(/room is picking/);
	});

	it('carries the hold to the list, and only for the round it was placed in', () => {
		const { db, rules, films } = fourFilms();
		holdFilm(db, 'ala', films[0], 'nie dojadę');

		const listed = standings(db, rules, 1, 'bartek').find((film) => film.id === films[0])!;
		expect(listed.held).toEqual({ personId: 'ala', name: 'ala', reason: 'nie dojadę' });
		// the row is keyed on the round, so next week the film is back in play
		expect(standings(db, rules, 2, 'bartek').find((film) => film.id === films[0])!.held).toBeNull();
	});

	it('does not touch what anyone may spend', () => {
		const { db, rules, films } = fourFilms();
		holdFilm(db, 'ala', films[0]);
		// a held film is still on the list and still takes votes; the points simply
		// have to wait a week to be worth anything on the night
		setPoints(db, rules, 'ewa', films[0], 1);
		expect(filmById(db, films[0])!.score).toBe(5);
	});
});
