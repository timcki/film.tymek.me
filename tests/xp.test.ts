import { describe, expect, it } from 'vitest';
import type { DB } from '../src/lib/server/db.js';
import { applySchema } from '../src/lib/server/db.js';
import { XP, rexpAll, xpBreakdown } from '../src/lib/server/xp.js';
import { LEVELS, levelOf, nextLevelAt } from '../src/lib/levels.js';
import { dictFor, LANGS } from '../src/lib/i18n.js';
import { checkIn } from '../src/lib/server/attendance.js';
import { setPoints } from '../src/lib/server/films.js';
import { closeRunoff, flashVote, openRunoff } from '../src/lib/server/runoffs.js';
import { closeWeek } from '../src/lib/server/weeks.js';
import { addFilm, castBallot, freshDb, nominateAs, PEOPLE } from './helpers.js';

const cachedXp = (db: DB, id: string) =>
	(db.prepare('SELECT xp FROM person WHERE id = ?').get(id) as { xp: number }).xp;

/** the drift test: the cache must equal a from-scratch derivation for everyone */
function expectCacheHonest(db: DB): void {
	for (const id of PEOPLE) expect(cachedXp(db, id)).toBe(xpBreakdown(db, id).total);
}

describe('deriving XP', () => {
	it('pays out per source at the agreed rates', () => {
		const { db, rules } = freshDb('weekly');
		const mine = nominateAs(db, rules, 'ala', 'Stalker');
		setPoints(db, rules, 'ala', mine, 2);

		closeWeek(db, rules);
		const runoff = openRunoff(db)!;
		flashVote(db, runoff.id, 'ala', 'ala', [mine]);
		closeRunoff(db, rules, runoff.id);

		// nominated (1), voted one week (2), attended via flash vote (10),
		// nomination watched (15)
		const breakdown = xpBreakdown(db, 'ala');
		expect(breakdown).toEqual({
			nightsAttended: 1,
			weeksVoted: 1,
			nominations: 1,
			nominationsWatched: 1,
			total: XP.attend + XP.vote + XP.nominate + XP.nominationWatched
		});
	});

	it('counts a week of voting once, however many films got points', () => {
		const { db, rules } = freshDb('weekly');
		const a = addFilm(db, 'A', 'bartek', 1);
		const b = addFilm(db, 'B', 'celina', 1);
		setPoints(db, rules, 'ala', a, 1);
		setPoints(db, rules, 'ala', b, 1);

		expect(xpBreakdown(db, 'ala').weeksVoted).toBe(1);
		expect(xpBreakdown(db, 'ala').total).toBe(XP.vote);
	});

	it('pays nothing extra for having had points on the winner', () => {
		const { db, rules } = freshDb('weekly');
		const winner = addFilm(db, 'Winner', 'ala', 1);
		const loser = addFilm(db, 'Loser', 'bartek', 1);
		castBallot(db, 1, 'ala', winner, 2);
		castBallot(db, 1, 'bartek', loser, 1);

		closeWeek(db, rules);
		flashVote(db, openRunoff(db)!.id, 'someone', null, [winner, loser]);
		closeRunoff(db, rules, openRunoff(db)!.id);

		// the winner's nominator is paid for it being watched; backing it is
		// worth exactly what backing the loser is
		expect(xpBreakdown(db, 'ala').total - XP.nominate - XP.nominationWatched).toBe(XP.vote);
		expect(xpBreakdown(db, 'bartek').total - XP.nominate).toBe(XP.vote);
	});
});

describe('the person.xp cache', () => {
	it('is rebuilt inside every event that touches its inputs', () => {
		const { db, rules } = freshDb('weekly');

		const film = nominateAs(db, rules, 'ala', 'Stalker');
		expectCacheHonest(db);

		setPoints(db, rules, 'bartek', film, 1);
		expectCacheHonest(db);

		checkIn(db, 1, 'celina');
		expectCacheHonest(db);

		closeWeek(db, rules);
		closeRunoff(db, rules, openRunoff(db)!.id);
		expectCacheHonest(db);
	});

	it('catches up retroactively when history is seeded', () => {
		const { db, rules } = freshDb('weekly');
		const film = addFilm(db, 'A', 'ala', 1);
		castBallot(db, 1, 'ala', film, 2);
		closeWeek(db, rules);
		flashVote(db, openRunoff(db)!.id, 'darek', 'darek', [film]);
		closeRunoff(db, rules, openRunoff(db)!.id);

		// the pre-attendance world: table dropped, then a deploy boots on old data
		db.exec('DROP TABLE attendance');
		db.exec("UPDATE person SET xp = 0 WHERE id = 'darek'");
		applySchema(db);
		rexpAll(db);
		expect(cachedXp(db, 'darek')).toBe(xpBreakdown(db, 'darek').total);
		expect(xpBreakdown(db, 'darek').nightsAttended).toBe(1);
	});
});

describe('the ladder', () => {
	it('climbs at the published thresholds', () => {
		expect(LEVELS).toHaveLength(12);
		expect(levelOf(0)).toBe(0);
		expect(levelOf(24)).toBe(0);
		expect(levelOf(25)).toBe(1);
		expect(levelOf(999)).toBe(LEVELS.length - 2);
		expect(levelOf(1000)).toBe(LEVELS.length - 1);
		expect(levelOf(10_000)).toBe(LEVELS.length - 1);
	});

	it('knows what to chase next, and when there is nothing left', () => {
		expect(nextLevelAt(0)).toBe(25);
		expect(nextLevelAt(999)).toBe(1000);
		expect(nextLevelAt(1000)).toBeNull();
	});

	it('has a name for every rung in both languages', () => {
		for (const lang of LANGS) {
			expect(dictFor(lang).levels).toHaveLength(LEVELS.length);
		}
	});
});
