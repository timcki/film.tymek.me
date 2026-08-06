import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/lib/server/db.js';
import { RULE_SETS } from '../src/lib/server/rules.js';
import { iso } from '../src/lib/server/time.js';
import { newToken } from '../src/lib/server/tokens.js';
import { closeWeek, openWeek } from '../src/lib/server/weeks.js';
import { closeRunoff, openRunoff } from '../src/lib/server/runoffs.js';
import { setPoints } from '../src/lib/server/films.js';

/**
 * These need a real file, not :memory:, because two connections have to see the
 * same database and fight over the same write lock.
 */
let dir: string | null = null;

afterEach(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
	dir = null;
});

function fileDb() {
	dir = mkdtempSync(join(tmpdir(), 'filmnight-'));
	return join(dir, 'test.db');
}

describe('two connections at once', () => {
	// 16. running closeWeek twice concurrently produces exactly one winner
	it('closes the week exactly once when two callers race', () => {
		const path = fileDb();
		const rules = RULE_SETS.banked;

		const a = openDatabase(path);
		for (const id of ['ala', 'bartek']) {
			a.prepare(
				`INSERT INTO person (id, name, colour, token, active, created_at) VALUES (?, ?, '#fff', ?, 1, ?)`
			).run(id, id, newToken(), iso());
			a.prepare(`INSERT INTO bank (person_id, balance, updated_at) VALUES (?, 2, ?)`).run(id, iso());
		}
		openWeek(a, 1);
		a.prepare(
			`INSERT INTO film (title, title_key, added_by, added_week, status, score, created_at)
			 VALUES ('Stalker', 'stalker', 'ala', 1, 'active', 0, ?)`
		).run(iso());
		setPoints(a, rules, 'ala', 1, 2);

		const b = openDatabase(path);
		const first = closeWeek(a, rules);
		const second = closeWeek(b, rules);

		// the loser of the race sees the week already in the room-picking stage
		expect(first.kind).toBe('runoff');
		expect(second.kind).toBe('noop');
		closeRunoff(b, rules, openRunoff(b)!.id);

		const watched = b.prepare(`SELECT COUNT(*) AS n FROM film WHERE status = 'watched'`).get() as {
			n: number;
		};
		expect(watched.n).toBe(1);

		const week1 = b.prepare('SELECT * FROM week WHERE number = 1').get() as {
			status: string;
			winner_film_id: number;
		};
		expect(week1.status).toBe('closed');
		expect(week1.winner_film_id).toBe(1);

		a.close();
		b.close();
	});

	// §10: concurrent votes at 19:59:59 are serialised, and the budget check holds
	it('serialises two votes so the budget is never overspent', () => {
		const path = fileDb();
		const rules = RULE_SETS.banked;

		const a = openDatabase(path);
		a.prepare(
			`INSERT INTO person (id, name, colour, token, active, created_at) VALUES ('ala', 'ala', '#fff', ?, 1, ?)`
		).run(newToken(), iso());
		a.prepare(`INSERT INTO bank (person_id, balance, updated_at) VALUES ('ala', 2, ?)`).run(iso());
		openWeek(a, 1);
		openWeek(a, 2);
		for (const title of ['Stalker', 'Solaris']) {
			a.prepare(
				`INSERT INTO film (title, title_key, added_by, added_week, status, score, created_at)
				 VALUES (?, ?, 'ala', ?, 'active', 0, ?)`
			).run(title, title.toLowerCase(), title === 'Stalker' ? 1 : 2, iso());
		}
		openWeek(a, 2);

		const b = openDatabase(path);
		setPoints(a, rules, 'ala', 1, 2);
		// the second connection sees the first one's spend and refuses
		expect(() => setPoints(b, rules, 'ala', 2, 1)).toThrow(/points/);

		const total = b
			.prepare(`SELECT COALESCE(SUM(points), 0) AS n FROM ballot WHERE person_id = 'ala'`)
			.get() as { n: number };
		expect(total.n).toBe(2);

		a.close();
		b.close();
	});
});
