import { describe, expect, it } from 'vitest';
import { applySchema } from '../src/lib/server/db.js';
import { attended, attendedWeeks, checkIn } from '../src/lib/server/attendance.js';
import { closeRunoff, flashVote, openRunoff } from '../src/lib/server/runoffs.js';
import { closeWeek } from '../src/lib/server/weeks.js';
import { setPoints } from '../src/lib/server/films.js';
import { addFilm, castBallot, freshDb } from './helpers.js';

describe('checking in', () => {
	it('records a person once per night, however often they scan', () => {
		const { db } = freshDb('weekly');
		checkIn(db, 1, 'ala');
		checkIn(db, 1, 'ala');
		checkIn(db, 1, 'bartek');

		expect(attended(db, 1, 'ala')).toBe(true);
		expect(attended(db, 1, 'celina')).toBe(false);
		expect(attendedWeeks(db, 'ala')).toEqual([1]);
	});

	it('every decided night has a room code to scan, even with one candidate', () => {
		const { db, rules } = freshDb('weekly');
		const film = addFilm(db, 'Only', 'ala', 1);
		setPoints(db, rules, 'ala', film, 2);

		const result = closeWeek(db, rules);
		expect(result.kind).toBe('runoff');

		// people scan and check in while the room confirms the lone candidate
		const runoff = openRunoff(db)!;
		checkIn(db, runoff.week_number, 'bartek');
		closeRunoff(db, rules, runoff.id);
		expect(attended(db, 1, 'bartek')).toBe(true);
	});

	it('an identified flash vote implies presence via the boot seed', () => {
		const { db, rules } = freshDb('weekly');
		const a = addFilm(db, 'A', 'ala', 1);
		const b = addFilm(db, 'B', 'bartek', 1);
		castBallot(db, 1, 'ala', a, 2);
		castBallot(db, 1, 'bartek', b, 2);

		closeWeek(db, rules);
		const runoff = openRunoff(db)!;
		flashVote(db, runoff.id, 'celina', 'celina', [a, b]);
		flashVote(db, runoff.id, 'guest-device', null, [b, a]);
		closeRunoff(db, rules, runoff.id);

		// the idempotent seed in applySchema turns historical flash votes into
		// attendance rows; anonymous guests leave no trace
		applySchema(db);
		expect(attended(db, 1, 'celina')).toBe(true);
		const rows = db.prepare('SELECT COUNT(*) AS n FROM attendance').get() as { n: number };
		expect(rows.n).toBe(1);
	});

	it('seeds retroactively on a database that predates the table', () => {
		const { db, rules } = freshDb('weekly');
		const a = addFilm(db, 'A', 'ala', 1);
		const b = addFilm(db, 'B', 'bartek', 1);
		castBallot(db, 1, 'ala', a, 2);
		castBallot(db, 1, 'bartek', b, 2);
		closeWeek(db, rules);
		flashVote(db, openRunoff(db)!.id, 'darek', 'darek', [a, b]);
		closeRunoff(db, rules, openRunoff(db)!.id);

		// simulate the pre-attendance world: the table vanishes, then a deploy
		// with the new schema boots on the old data
		db.exec('DROP TABLE attendance');
		applySchema(db);
		expect(attended(db, 1, 'darek')).toBe(true);
	});
});
