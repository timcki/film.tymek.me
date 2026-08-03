import { describe, expect, it } from 'vitest';
import { closeWeek, currentWeek, weekByNumber } from '../src/lib/server/weeks.js';
import { setPoints } from '../src/lib/server/films.js';
import { formatLocal, nextDeadline } from '../src/lib/server/time.js';
import { addFilm, castBallot, freshDb } from './helpers.js';

describe('week lifecycle', () => {
	// 15. closeWeek on an already-closed week is a no-op
	it('closing an already-closed week does nothing', () => {
		const { db, rules } = freshDb('banked');
		const film = addFilm(db, 'Stalker', 'ala', 1);
		setPoints(db, rules, 'ala', film, 2);

		const first = closeWeek(db, rules);
		expect(first.kind).toBe('winner');

		// week 2 is now open with no films; closing it again resolves nothing new
		const before = db.prepare('SELECT COUNT(*) AS n FROM week').get() as { n: number };
		const second = closeWeek(db, rules, new Date('2026-08-06T18:00:01Z'));
		expect(second.kind).toBe('no-winner');

		const watched = db.prepare(`SELECT COUNT(*) AS n FROM film WHERE status = 'watched'`).get() as {
			n: number;
		};
		expect(watched.n).toBe(1);
		expect(before.n).toBe(2);
	});

	// 16. running closeWeek twice produces exactly one winner
	it('two closes in a row produce exactly one winner for the week', () => {
		const { db, rules } = freshDb('banked');
		const film = addFilm(db, 'Stalker', 'ala', 1);
		setPoints(db, rules, 'ala', film, 2);

		const a = closeWeek(db, rules);
		const b = closeWeek(db, rules); // week 2 is open but empty
		expect(a.kind).toBe('winner');
		expect(b.kind).toBe('no-winner');

		const week1 = weekByNumber(db, 1)!;
		expect(week1.status).toBe('closed');
		expect(week1.winner_film_id).toBe(film);
		const winners = db
			.prepare(`SELECT COUNT(*) AS n FROM film WHERE status = 'watched' AND watched_week = 1`)
			.get() as { n: number };
		expect(winners.n).toBe(1);
	});

	// 17. final_score is the score at the moment of closing, not recomputed later
	it('final_score is frozen at the moment of closing', () => {
		const { db, rules } = freshDb('banked');
		const film = addFilm(db, 'Stalker', 'ala', 1);
		setPoints(db, rules, 'ala', film, 2);
		castBallot(db, 1, 'bartek', film, 1);

		closeWeek(db, rules);
		const frozen = (db.prepare('SELECT final_score FROM film WHERE id = ?').get(film) as {
			final_score: number;
		}).final_score;
		expect(frozen).toBe(3);

		// later ballots in a later week do not rewrite history
		castBallot(db, 2, 'celina', film, 5);
		closeWeek(db, rules, new Date('2026-08-06T18:00:01Z'));
		const still = (db.prepare('SELECT final_score FROM film WHERE id = ?').get(film) as {
			final_score: number;
		}).final_score;
		expect(still).toBe(3);
	});

	// 18. votes are rejected once closes_at has passed
	it('rejects a vote once the deadline has passed', () => {
		const { db, rules } = freshDb('banked');
		const film = addFilm(db, 'Stalker', 'ala', 1);
		const week = currentWeek(db)!;
		db.prepare('UPDATE week SET closes_at = ? WHERE number = ?').run(
			new Date(Date.now() - 1000).toISOString(),
			week.number
		);
		expect(() => setPoints(db, rules, 'ala', film, 1)).toThrow(/closed/);
	});

	it('no winner when nobody votes, and the next week still opens', () => {
		const { db, rules } = freshDb('banked');
		addFilm(db, 'Stalker', 'ala', 1);
		const result = closeWeek(db, rules);
		expect(result.kind).toBe('no-winner');
		expect(weekByNumber(db, 1)!.winner_film_id).toBeNull();
		expect(weekByNumber(db, 2)).toBeDefined();
		expect(weekByNumber(db, 2)!.status).toBe('open');
	});

	it('one film with any points wins by default', () => {
		const { db, rules } = freshDb('banked');
		const film = addFilm(db, 'Stalker', 'ala', 1);
		setPoints(db, rules, 'ala', film, 1);
		const result = closeWeek(db, rules);
		expect(result.kind).toBe('winner');
		expect(weekByNumber(db, 1)!.winner_film_id).toBe(film);
	});
});

describe('the deadline across DST', () => {
	// 19. Thursday 20:00 Europe/Warsaw on both sides of both DST boundaries
	it('stays at 20:00 local across the March boundary', () => {
		// the last Sunday of March 2026 is the 29th
		const before = nextDeadline(new Date('2026-03-23T09:00:00Z'));
		expect(before.toISOString()).toBe('2026-03-26T19:00:00.000Z'); // CET, UTC+1
		expect(formatLocal(before)).toContain('20:00');

		const after = nextDeadline(new Date('2026-03-30T09:00:00Z'));
		expect(after.toISOString()).toBe('2026-04-02T18:00:00.000Z'); // CEST, UTC+2
		expect(formatLocal(after)).toContain('20:00');
	});

	it('stays at 20:00 local across the October boundary', () => {
		// the last Sunday of October 2026 is the 25th
		const before = nextDeadline(new Date('2026-10-19T09:00:00Z'));
		expect(before.toISOString()).toBe('2026-10-22T18:00:00.000Z'); // CEST
		expect(formatLocal(before)).toContain('20:00');

		const after = nextDeadline(new Date('2026-10-26T09:00:00Z'));
		expect(after.toISOString()).toBe('2026-10-29T19:00:00.000Z'); // CET
		expect(formatLocal(after)).toContain('20:00');
	});

	it('is always strictly in the future, including at 20:00 exactly', () => {
		const onTheDot = new Date('2026-08-06T18:00:00Z'); // Thursday 20:00 Warsaw
		expect(nextDeadline(onTheDot).toISOString()).toBe('2026-08-13T18:00:00.000Z');
	});
});
