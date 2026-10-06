import { describe, expect, it } from 'vitest';
import { RULE_SETS } from '../src/lib/server/rules.js';
import { closeWeek, weekByNumber } from '../src/lib/server/weeks.js';
import { closeRunoff, flashVote, openRunoff, runoffFilms } from '../src/lib/server/runoffs.js';
import { filmById } from '../src/lib/server/films.js';
import { addFilm, castBallot, forceAdvanceTo, freshDb } from './helpers.js';

/**
 * The shortlist replaces the spec's tie-only runoff: the top N films by score go
 * to the room every week, and whoever turned up picks. Points buy candidacy;
 * presence buys the choice.
 */
describe('the weekly shortlist', () => {
	it('sends the top three to the room even when nothing is tied', () => {
		const { db, rules } = freshDb('banked');
		const films = ['A', 'B', 'C', 'D'].map((title, index) =>
			addFilm(db, title, ['ala', 'bartek', 'celina', 'darek'][index], 1)
		);
		castBallot(db, 1, 'ala', films[0], 4);
		castBallot(db, 1, 'bartek', films[1], 3);
		castBallot(db, 1, 'celina', films[2], 2);
		castBallot(db, 1, 'darek', films[3], 1);

		const result = closeWeek(db, rules);
		expect(result.kind).toBe('runoff');

		const runoff = openRunoff(db)!;
		const shortlisted = runoffFilms(db, runoff.id).map((f) => f.title).sort();
		expect(shortlisted).toEqual(['A', 'B', 'C']);
		expect(weekByNumber(db, 1)!.status).toBe('runoff');
	});

	it('never shortlists a film nobody voted for', () => {
		const { db, rules } = freshDb('banked');
		const backed = addFilm(db, 'Backed', 'ala', 1);
		const ignored = addFilm(db, 'Ignored', 'bartek', 1);
		const alsoBacked = addFilm(db, 'Also', 'celina', 1);
		castBallot(db, 1, 'ala', backed, 2);
		castBallot(db, 1, 'celina', alsoBacked, 1);

		closeWeek(db, rules);
		const ids = runoffFilms(db, openRunoff(db)!.id).map((f) => f.id);
		expect(ids).toContain(backed);
		expect(ids).toContain(alsoBacked);
		expect(ids).not.toContain(ignored);
	});

	it('sends even a lone candidate to the room, and the fallback confirms it', () => {
		const { db, rules } = freshDb('banked');
		const only = addFilm(db, 'Only', 'ala', 1);
		addFilm(db, 'Nothing', 'bartek', 1);
		castBallot(db, 1, 'ala', only, 2);

		// the code on the screen doubles as the attendance sheet, so the room step
		// happens every decided night; a pointless film still never appears in it
		const result = closeWeek(db, rules);
		expect(result.kind === 'runoff' && result.films.map((f) => f.id)).toEqual([only]);
		const runoff = openRunoff(db)!;
		expect(filmById(db, only)!.status).toBe('active');

		closeRunoff(db, rules, runoff.id);
		expect(filmById(db, only)!.status).toBe('watched');
	});

	it('fills the shortlist by the §3.2 ordering, so the longest wait takes the last slot', () => {
		const { db, rules } = freshDb('banked');
		forceAdvanceTo(db, 5);
		const leader = addFilm(db, 'Leader', 'ala', 3);
		const oldTie = addFilm(db, 'Old', 'bartek', 1);
		const newTie = addFilm(db, 'New', 'celina', 4);
		const alsoNew = addFilm(db, 'Newer', 'darek', 5);
		castBallot(db, 5, 'ala', leader, 3);
		for (const [person, film] of [
			['bartek', oldTie],
			['celina', newTie],
			['darek', alsoNew]
		] as const) {
			castBallot(db, 5, person, film, 1);
		}

		closeWeek(db, rules);
		const shortlisted = runoffFilms(db, openRunoff(db)!.id).map((f) => f.id);
		expect(shortlisted).toContain(leader);
		expect(shortlisted).toContain(oldTie); // added_week 1 beats 4 and 5
		expect(shortlisted).toContain(newTie); // added_week 4 beats 5
		expect(shortlisted).not.toContain(alsoNew);
		expect(shortlisted).toHaveLength(RULE_SETS.banked.shortlistSize);
	});

	it('lets the room pick a film that did not lead on points', () => {
		const { db, rules } = freshDb('banked');
		const onPoints = addFilm(db, 'Points', 'ala', 1);
		const inTheRoom = addFilm(db, 'Room', 'bartek', 1);
		castBallot(db, 1, 'ala', onPoints, 4);
		castBallot(db, 1, 'bartek', inTheRoom, 1);

		closeWeek(db, rules);
		const runoff = openRunoff(db)!;
		flashVote(db, runoff.id, 'celina', 'celina', [inTheRoom, onPoints]);
		flashVote(db, runoff.id, 'darek', 'darek', [inTheRoom, onPoints]);

		const result = closeRunoff(db, rules, runoff.id);
		expect(result.kind === 'winner' && result.film.id).toBe(inTheRoom);

		// the film that led on points stays on the list with its score intact;
		// losing the room vote costs nothing
		const kept = filmById(db, onPoints)!;
		expect(kept.status).toBe('active');
		expect(kept.score).toBe(4);
	});

	it('an empty room still watches the highest-scoring film', () => {
		const { db, rules } = freshDb('banked');
		const top = addFilm(db, 'Top', 'ala', 1);
		const second = addFilm(db, 'Second', 'bartek', 1);
		castBallot(db, 1, 'ala', top, 4);
		castBallot(db, 1, 'bartek', second, 1);

		closeWeek(db, rules);
		const result = closeRunoff(db, rules, openRunoff(db)!.id);
		expect(result.kind === 'winner' && result.film.id).toBe(top);
		expect(weekByNumber(db, 2)!.status).toBe('open');
	});
});

describe('the bank cap', () => {
	it('caps a stockpile at six points', () => {
		expect(RULE_SETS.banked.bankCap).toBe(6);
	});
});
