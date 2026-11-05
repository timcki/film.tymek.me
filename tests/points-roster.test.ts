import { describe, expect, it } from 'vitest';
import { pointsRoster } from '../src/lib/server/manage.js';
import { participation, votingHabits } from '../src/lib/server/stats.js';
import { addFilm, castBallot, ensureWeek, freshDb } from './helpers.js';

describe('who has spent their points', () => {
	it('says what each person spent on, most first, and names the nomination', () => {
		const { db, rules } = freshDb('weekly');
		const film = addFilm(db, 'Paddington', 'ala', 1);
		const other = addFilm(db, 'Solaris', 'bartek', 1);
		castBallot(db, 1, 'ala', other, 2);
		castBallot(db, 1, 'ala', film, 1);
		castBallot(db, 1, 'celina', film, 1);

		const rows = pointsRoster(db, rules, 1);
		const by = Object.fromEntries(rows.map((row) => [row.id, row]));
		expect(by.ala).toMatchObject({
			spent: 3,
			budget: rules.pointsPerWeek,
			nominated: 'Paddington',
			films: [
				{ title: 'Solaris', points: 2 },
				{ title: 'Paddington', points: 1 }
			]
		});
		expect(by.celina).toMatchObject({ spent: 1, films: [{ title: 'Paddington', points: 1 }] });
		expect(by.darek).toMatchObject({ spent: 0, films: [], nominated: null, last: null });
		expect(by.celina.last).not.toBeNull();
		expect(rows.map((row) => row.name)).toEqual([...rows.map((row) => row.name)].sort());
	});

	it('leaves out anyone who is not active', () => {
		const { db, rules } = freshDb('weekly');
		db.prepare(`UPDATE person SET active = 0 WHERE id = 'darek'`).run();
		expect(pointsRoster(db, rules, 1).some((row) => row.id === 'darek')).toBe(false);
	});
});

describe('how the rounds went', () => {
	function history() {
		const { db } = freshDb('weekly');
		db.prepare(`UPDATE person SET created_at = '2025-01-01T00:00:00.000Z'`).run();
		db.prepare(`INSERT INTO rules_change (rules_id, week_number, created_at) VALUES ('weekly', 1, '2025-01-01T00:00:00.000Z')`).run();
		const a = addFilm(db, 'A', 'ala', 1);
		const b = addFilm(db, 'B', 'bartek', 1);
		castBallot(db, 1, 'ala', a, 3);
		castBallot(db, 1, 'bartek', b, 1);
		db.prepare(`UPDATE film SET status = 'watched', watched_week = 1 WHERE id = ?`).run(a);
		db.prepare(`UPDATE week SET status = 'closed' WHERE number = 1`).run();
		db.prepare(`INSERT INTO attendance (week_number, person_id, checked_in_at) VALUES (1, 'ala', '2026-01-08T19:00:00.000Z')`).run();
		// round 2 went to a special night after bartek had voted, then the list woke in 3
		ensureWeek(db, 2);
		db.prepare(`UPDATE week SET special = 'approval' WHERE number = 2`).run();
		castBallot(db, 2, 'bartek', b, 2);
		ensureWeek(db, 3, 'open');
		castBallot(db, 3, 'celina', b, 3);
		return { db, a, b };
	}

	it('gives each list round its voters, its spread and what backed the winner', () => {
		const { db } = history();
		const [now, first] = participation(db, { from: 1, to: 3 });
		expect(first).toMatchObject({
			week: 1,
			open: false,
			winnerTitle: 'A',
			roster: 6,
			voters: 2,
			full: 1,
			points: 4,
			films: 2,
			onWinner: 3,
			room: 1
		});
		expect(now).toMatchObject({ week: 3, open: true, winnerTitle: null, voters: 2, full: 1, points: 5, films: 1 });
	});

	it('gives a special night no row and counts what was spent before it in the next round', () => {
		const { db } = history();
		expect(participation(db, { from: 1, to: 3 }).map((row) => row.week)).toEqual([3, 1]);
	});

	it('does not count anyone who joined after the night', () => {
		const { db } = history();
		db.prepare(`UPDATE person SET created_at = '2027-01-01T00:00:00.000Z' WHERE id = 'filip'`).run();
		expect(participation(db, { from: 1, to: 3 }).at(-1)?.roster).toBe(5);
	});
});

describe('how people vote', () => {
	it('counts going all in, coming back to a film, own films, runs and the points leader', () => {
		const { db } = freshDb('weekly');
		const a = addFilm(db, 'A', 'ala', 1);
		const b = addFilm(db, 'B', 'bartek', 1);
		castBallot(db, 1, 'ala', a, 3);
		castBallot(db, 1, 'bartek', a, 1);
		castBallot(db, 1, 'bartek', b, 2);
		db.prepare(`UPDATE film SET status = 'watched', watched_week = 1 WHERE id = ?`).run(b);
		db.prepare(`UPDATE week SET status = 'closed' WHERE number = 1`).run();
		castBallot(db, 2, 'ala', a, 3);
		castBallot(db, 2, 'celina', a, 1);

		const habits = votingHabits(db, { from: 1, to: 2 });
		expect(habits.rounds.map((r) => [r.week, r.voters, r.oneFilm, r.points, r.again, r.own])).toEqual([
			[1, 2, 1, 6, 0, 5],
			[2, 2, 2, 4, 3, 3]
		]);
		const ala = habits.people.find((row) => row.person.id === 'ala')!;
		expect(ala).toMatchObject({ rounds: 2, films: 1, points: 6, again: 3, own: 6, streak: { title: 'A', rounds: 2 } });
		// A led round 1 on points, but the room picked B
		expect([habits.leaderWon, habits.decided]).toEqual([0, 1]);
		expect([habits.halfFrom, habits.voters]).toEqual([1, 3]);
	});
});
