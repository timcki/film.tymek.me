import { describe, expect, it } from 'vitest';
import { RULE_SETS, compareFilms, orderFilms, score } from '../src/lib/server/rules.js';
import { pointsByFilm, rescoreAll } from '../src/lib/server/scoring.js';
import { addFilm, castBallot, freshDb } from './helpers.js';

/** an independent computation from raw ballot rows, for comparison with rescoreAll */
function scoresFromBallots(db: ReturnType<typeof freshDb>['db'], rulesId: keyof typeof RULE_SETS, week: number) {
	const rules = RULE_SETS[rulesId];
	const rows = db.prepare('SELECT film_id, week_number, points FROM ballot').all() as {
		film_id: number;
		week_number: number;
		points: number;
	}[];
	const byFilm = new Map<number, Map<number, number>>();
	for (const row of rows) {
		const weeks = byFilm.get(row.film_id) ?? new Map<number, number>();
		weeks.set(row.week_number, (weeks.get(row.week_number) ?? 0) + row.points);
		byFilm.set(row.film_id, weeks);
	}
	const out = new Map<number, number>();
	for (const { id } of db.prepare('SELECT id FROM film').all() as { id: number }[]) {
		out.set(id, score(rules, byFilm.get(id) ?? new Map(), week));
	}
	return out;
}

describe('scoring', () => {
	// 9 & 11. ledger and banked score the sum of all points ever placed
	it.each(['ledger', 'banked'] as const)('%s: score is the sum of all points ever placed', (id) => {
		const { db, rules } = freshDb(id);
		const film = addFilm(db, 'Stalker', 'ala', 1);
		castBallot(db, 1, 'ala', film, 1);
		castBallot(db, 2, 'bartek', film, 2);
		castBallot(db, 5, 'celina', film, 3);

		expect(rescoreAll(db, rules, 5).get(film)).toBe(6);
		expect(rescoreAll(db, rules, 99).get(film)).toBe(6); // the week does not matter
	});

	// 10. rolling: this week plus half of last week; three weeks ago scores 0
	it('rolling: this week plus half of last week, and nothing older counts', () => {
		const { db, rules } = freshDb('rolling');
		const recent = addFilm(db, 'Stalker', 'ala', 1);
		const stale = addFilm(db, 'Solaris', 'bartek', 1);

		castBallot(db, 5, 'ala', recent, 4);
		castBallot(db, 4, 'bartek', recent, 3);
		castBallot(db, 2, 'celina', stale, 5);

		const scores = rescoreAll(db, rules, 5);
		expect(scores.get(recent)).toBe(4 + 0.5 * 3);
		expect(scores.get(stale)).toBe(0);
	});

	// 12. rescoreAll after a rule-set switch matches a fresh computation from ballots
	it('rescoreAll matches an independent computation after switching rule sets', () => {
		const { db } = freshDb('ledger');
		const a = addFilm(db, 'Stalker', 'ala', 1);
		const b = addFilm(db, 'Solaris', 'bartek', 1);
		castBallot(db, 1, 'ala', a, 1);
		castBallot(db, 2, 'bartek', a, 2);
		castBallot(db, 2, 'celina', b, 3);
		castBallot(db, 3, 'darek', b, 1);

		for (const id of ['ledger', 'rolling', 'banked'] as const) {
			const cached = rescoreAll(db, RULE_SETS[id], 3);
			const fresh = scoresFromBallots(db, id, 3);
			expect([...cached.entries()].sort()).toEqual([...fresh.entries()].sort());

			// the cache column agrees with the returned map
			const stored = db.prepare('SELECT id, score FROM film').all() as {
				id: number;
				score: number;
			}[];
			for (const row of stored) expect(row.score).toBe(cached.get(row.id));
		}
	});

	it('pointsByFilm groups ballots by film and week', () => {
		const { db } = freshDb('banked');
		const film = addFilm(db, 'Stalker', 'ala', 1);
		castBallot(db, 1, 'ala', film, 1);
		castBallot(db, 1, 'bartek', film, 2);
		expect(pointsByFilm(db).get(film)?.get(1)).toBe(3);
	});
});

describe('ordering', () => {
	// 13. equal scores order by added_week ascending
	it('breaks a score tie by added_week ascending', () => {
		const older = { id: 9, score: 5, added_week: 1, created_at: '2026-02-01T00:00:00.000Z' };
		const newer = { id: 2, score: 5, added_week: 4, created_at: '2026-01-01T00:00:00.000Z' };
		expect(orderFilms([newer, older])[0]).toBe(older);
	});

	// 14. the ordering is total: no two films ever compare equal
	it('is total across every combination of the tie-breakers', () => {
		const films = [
			{ id: 1, score: 3, added_week: 1, created_at: '2026-01-01T00:00:00.000Z' },
			{ id: 2, score: 3, added_week: 1, created_at: '2026-01-01T00:00:00.000Z' },
			{ id: 3, score: 3, added_week: 1, created_at: '2026-01-02T00:00:00.000Z' },
			{ id: 4, score: 3, added_week: 2, created_at: '2026-01-01T00:00:00.000Z' },
			{ id: 5, score: 9, added_week: 7, created_at: '2026-03-01T00:00:00.000Z' }
		];
		for (const a of films) {
			for (const b of films) {
				if (a.id === b.id) continue;
				expect(compareFilms(a, b)).not.toBe(0);
				// antisymmetric
				expect(Math.sign(compareFilms(a, b))).toBe(-Math.sign(compareFilms(b, a)));
			}
		}
		expect(orderFilms(films).map((f) => f.id)).toEqual([5, 1, 2, 3, 4]);
	});
});
