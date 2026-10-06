import { describe, expect, it } from 'vitest';
import type { DB } from '../src/lib/server/db.js';
import type { RuleSet } from '../src/lib/server/rules.js';
import { RULE_SETS, score } from '../src/lib/server/rules.js';
import { filmById } from '../src/lib/server/films.js';
import { rescoreAll } from '../src/lib/server/scoring.js';
import { closeRunoff, flashVote, openRunoff } from '../src/lib/server/runoffs.js';
import { closeWeek } from '../src/lib/server/weeks.js';
import { addFilm, castBallot, freshDb } from './helpers.js';

/** closes the open week and has the room pick `winnerId` */
function roomPicks(db: DB, rules: RuleSet, winnerId: number): void {
	const result = closeWeek(db, rules);
	if (result.kind !== 'runoff') return;
	const runoff = openRunoff(db)!;
	flashVote(db, runoff.id, 'someone-in-the-room', null,
		[winnerId, ...result.films.map((f) => f.id).filter((id) => id !== winnerId)]);
	closeRunoff(db, rules, runoff.id);
}

const weekly = RULE_SETS.weekly;
// the constant under test lives in the rule set, so a retuning is not a rewrite
const f = weekly.decayFactor;

describe('fade scoring', () => {
	it('discounts each past week geometrically', () => {
		const points = new Map([
			[1, 4],
			[3, 2]
		]);
		// 4 * f^2 + 2 * f^0
		expect(score(weekly, points, 3)).toBeCloseTo(4 * f ** 2 + 2);
		// the same ballots viewed a week later are worth f times as much
		expect(score(weekly, points, 4)).toBeCloseTo((4 * f ** 2 + 2) * f);
	});

	it('counts an unfed film at full value in its own week', () => {
		expect(score(weekly, new Map([[5, 2]]), 5)).toBe(2);
	});

	it('ignores ballots from weeks after the one being scored', () => {
		const points = new Map([
			[2, 3],
			[4, 5]
		]);
		expect(score(weekly, points, 2)).toBe(3);
	});

	it('is what rescoreAll writes to the cache', () => {
		const { db, rules } = freshDb('weekly');
		const film = addFilm(db, 'Fading', 'ala', 1);
		castBallot(db, 1, 'ala', film, 2);
		castBallot(db, 2, 'bartek', film, 1);

		rescoreAll(db, rules, 3);
		expect(filmById(db, film)!.score).toBeCloseTo(2 * f ** 2 + 1 * f);
	});
});

describe('a room pass-over costs nothing', () => {
	it('leaves a passed-over shortlist film with its full faded score', () => {
		const { db, rules } = freshDb('weekly');
		const winner = addFilm(db, 'Picked', 'ala', 1);
		const loser = addFilm(db, 'Passed over', 'bartek', 1);
		castBallot(db, 1, 'ala', winner, 2);
		castBallot(db, 1, 'bartek', loser, 2);
		castBallot(db, 1, 'celina', loser, 2);

		roomPicks(db, rules, winner);

		// week 2 is open; the 4 points from week 1 have faded a step
		const kept = filmById(db, loser)!;
		expect(kept.status).toBe('active');
		expect(kept.score).toBeCloseTo(4 * f);
	});

	it('leaves every ballot row exactly as it was', () => {
		const { db, rules } = freshDb('weekly');
		const winner = addFilm(db, 'Picked', 'ala', 1);
		const loser = addFilm(db, 'Passed over', 'bartek', 1);
		castBallot(db, 1, 'ala', winner, 2);
		castBallot(db, 1, 'bartek', loser, 2);

		const ballots = () =>
			db.prepare('SELECT * FROM ballot ORDER BY week_number, person_id, film_id').all();
		const before = ballots();
		roomPicks(db, rules, winner);
		expect(ballots()).toEqual(before);
	});

	it('freezes final_score at the moment of watching', () => {
		const { db, rules } = freshDb('weekly');
		const first = addFilm(db, 'Wins first', 'ala', 1);
		const later = addFilm(db, 'Wins later', 'bartek', 1);
		castBallot(db, 1, 'ala', first, 2);
		castBallot(db, 1, 'bartek', later, 2);

		roomPicks(db, rules, first);
		expect(filmById(db, first)!.final_score).toBe(2);

		// the record does not fade with the list
		castBallot(db, 2, 'celina', later, 1);
		roomPicks(db, rules, later);
		expect(filmById(db, first)!.final_score).toBe(2);
		expect(filmById(db, later)!.final_score).toBeCloseTo(2 * f + 1);
	});
});
