import { describe, expect, it } from 'vitest';
import type { DB } from '../src/lib/server/db.js';
import type { RuleSet } from '../src/lib/server/rules.js';
import { filmById } from '../src/lib/server/films.js';
import { closeRunoff, flashVote, openRunoff } from '../src/lib/server/runoffs.js';
import { closeWeek, halved } from '../src/lib/server/weeks.js';
import { addFilm, castBallot, freshDb } from './helpers.js';

/** closes the open week and has the room pick `winnerId` */
function roomPicks(db: DB, rules: RuleSet, winnerId: number): void {
	const result = closeWeek(db, rules);
	if (result.kind !== 'runoff') return;
	const runoff = openRunoff(db)!;
	flashVote(db, runoff.id, 'someone-in-the-room', null, winnerId);
	closeRunoff(db, rules, runoff.id);
}

const scoreOf = (db: DB, id: number) => filmById(db, id)!.score;
const ballots = (db: DB) =>
	db.prepare('SELECT * FROM ballot ORDER BY week_number, person_id, film_id').all();

describe('halving a passed-over score', () => {
	it('rounds down and never goes below one', () => {
		expect(halved(7)).toBe(3);
		expect(halved(6)).toBe(3);
		expect(halved(5)).toBe(2);
		expect(halved(4)).toBe(2);
		expect(halved(3)).toBe(1);
		expect(halved(2)).toBe(1);
		expect(halved(1)).toBe(1);
	});
});

describe('the pass-over penalty', () => {
	it('takes half off a shortlisted film the room did not pick', () => {
		const { db, rules } = freshDb('banked');
		const winner = addFilm(db, 'Picked', 'ala', 1);
		const loser = addFilm(db, 'Passed over', 'bartek', 1);
		castBallot(db, 1, 'ala', winner, 2);
		castBallot(db, 1, 'bartek', loser, 4);
		castBallot(db, 1, 'celina', loser, 3);

		roomPicks(db, rules, winner);

		// 7 points on the ballots, 4 taken off, 3 left
		const cut = filmById(db, loser)!;
		expect(cut.penalty).toBe(4);
		expect(cut.last_penalty).toBe(4);
		expect(cut.last_penalty_week).toBe(1);
		expect(cut.score).toBe(3);
	});

	it('compounds across consecutive pass-overs: 6 to 3 to 1', () => {
		const { db, rules } = freshDb('banked');
		const loser = addFilm(db, 'Perennial', 'ala', 1);
		castBallot(db, 1, 'ala', loser, 6);

		for (const week of [1, 2, 3]) {
			const winner = addFilm(db, `Winner ${week}`, 'bartek', week);
			castBallot(db, week, 'bartek', winner, 1);
			roomPicks(db, rules, winner);
			if (week === 1) expect(scoreOf(db, loser)).toBe(3);
			if (week === 2) expect(scoreOf(db, loser)).toBe(1);
			// the floor holds: a third pass-over takes nothing more
			if (week === 3) expect(scoreOf(db, loser)).toBe(1);
		}

		expect(filmById(db, loser)!.last_penalty).toBe(0);
	});

	it('penalises the shortlisted losers and nobody else', () => {
		const { db, rules } = freshDb('banked');
		const [top, picked, third, fourth, fifth] = ['Top', 'Picked', 'Third', 'Fourth', 'Fifth'].map(
			(title, index) => addFilm(db, title, ['ala', 'bartek', 'celina', 'darek', 'ewa'][index], 1)
		);
		castBallot(db, 1, 'ala', top, 5);
		castBallot(db, 1, 'bartek', picked, 4);
		castBallot(db, 1, 'celina', third, 3);
		castBallot(db, 1, 'darek', fourth, 2);
		castBallot(db, 1, 'ewa', fifth, 1);

		roomPicks(db, rules, picked);

		expect(filmById(db, top)!.penalty).toBe(3); // 5 -> 2
		expect(filmById(db, third)!.penalty).toBe(2); // 3 -> 1
		// the winner pays nothing, and neither does anything below the shortlist
		expect(filmById(db, picked)!.penalty).toBe(0);
		expect(filmById(db, fourth)!.penalty).toBe(0);
		expect(filmById(db, fifth)!.penalty).toBe(0);
	});

	it('leaves every ballot row exactly as it was', () => {
		const { db, rules } = freshDb('banked');
		const winner = addFilm(db, 'Picked', 'ala', 1);
		const loser = addFilm(db, 'Passed over', 'bartek', 1);
		castBallot(db, 1, 'ala', winner, 2);
		castBallot(db, 1, 'bartek', loser, 6);

		const before = ballots(db);
		roomPicks(db, rules, winner);

		expect(ballots(db)).toEqual(before);
		// which is what keeps the rule reversible: the raw total is still there
		expect(filmById(db, loser)!.penalty).toBe(3);
	});

	it('does not let the cut take a film that was voted for this week', () => {
		const { db, rules } = freshDb('banked');
		const winner = addFilm(db, 'Picked', 'ala', 1);
		const loser = addFilm(db, 'Passed over', 'bartek', 1);
		castBallot(db, 1, 'ala', winner, 2);
		castBallot(db, 1, 'bartek', loser, 2);

		roomPicks(db, rules, winner);

		const survivor = filmById(db, loser)!;
		expect(survivor.status).toBe('active');
		expect(survivor.penalty).toBe(1);
		expect(survivor.score).toBe(1);
	});

	it('penalises nobody when only one film is in contention', () => {
		const { db, rules } = freshDb('banked');
		const only = addFilm(db, 'Only', 'ala', 1);
		const ignored = addFilm(db, 'Ignored', 'bartek', 1);
		castBallot(db, 1, 'ala', only, 4);

		const result = closeWeek(db, rules);
		expect(result.kind).toBe('winner');
		expect(filmById(db, only)!.penalty).toBe(0);
		expect(filmById(db, ignored)!.penalty).toBe(0);
	});

	it('applies exactly once however many times the close is run', () => {
		const { db, rules } = freshDb('banked');
		const winner = addFilm(db, 'Picked', 'ala', 1);
		const loser = addFilm(db, 'Passed over', 'bartek', 1);
		castBallot(db, 1, 'ala', winner, 2);
		castBallot(db, 1, 'bartek', loser, 6);

		closeWeek(db, rules);
		const runoff = openRunoff(db)!;
		// a second close while the room is still voting must change nothing
		expect(closeWeek(db, rules).kind).toBe('noop');
		flashVote(db, runoff.id, 'someone-in-the-room', null, winner);
		closeRunoff(db, rules, runoff.id);
		closeRunoff(db, rules, runoff.id);
		closeWeek(db, rules);

		expect(filmById(db, loser)!.penalty).toBe(3);
		expect(filmById(db, loser)!.score).toBe(3);
	});

	it('freezes final_score at the moment of watching', () => {
		const { db, rules } = freshDb('banked');
		const late = addFilm(db, 'Wins later', 'ala', 1);
		const first = addFilm(db, 'Wins first', 'bartek', 1);
		castBallot(db, 1, 'ala', late, 6);
		castBallot(db, 1, 'bartek', first, 2);

		roomPicks(db, rules, first);
		expect(filmById(db, first)!.final_score).toBe(2);
		expect(scoreOf(db, late)).toBe(3);

		// now the cut film wins, and its 3 is what goes in the record
		const rival = addFilm(db, 'Rival', 'celina', 2);
		castBallot(db, 2, 'celina', rival, 1);
		roomPicks(db, rules, late);
		expect(filmById(db, late)!.final_score).toBe(3);

		// a later week penalises other films; neither record moves
		const other = addFilm(db, 'Other', 'darek', 3);
		castBallot(db, 3, 'darek', other, 4);
		castBallot(db, 3, 'ewa', rival, 2);
		roomPicks(db, rules, other);
		expect(filmById(db, first)!.final_score).toBe(2);
		expect(filmById(db, late)!.final_score).toBe(3);
		expect(filmById(db, rival)!.penalty).toBeGreaterThan(0);
	});
});
