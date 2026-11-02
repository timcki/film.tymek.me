import { describe, expect, it } from 'vitest';
import { filmById, holdFilm, nominate, setPoints, standings } from '../src/lib/server/films.js';
import { closeWeek, currentWeek, syncOpenWeek, weekByNumber } from '../src/lib/server/weeks.js';
import { closeRunoff, openRunoff } from '../src/lib/server/runoffs.js';
import { droppedShelf } from '../src/lib/server/films.js';
import {
	EXTRA_NOW_MS,
	editSpecial,
	nominateSpecial,
	setApproval,
	specialPicks,
	startExtraNight,
	startExtraNow,
	startSpecial,
	stopSpecial
} from '../src/lib/server/specials.js';
import { addNight, allNights, deleteNight, moveNight, setNightStatus } from '../src/lib/server/schedule.js';
import { filmEvenings, roundEvenings } from '../src/lib/server/evenings.js';
import { addComment } from '../src/lib/server/comments.js';
import { toggleSeen } from '../src/lib/server/seen.js';
import { tick } from '../src/lib/server/scheduler.js';
import { counts, windowFor } from '../src/lib/server/stats.js';
import { xpBreakdown } from '../src/lib/server/xp.js';
import { bankBalance, spentInRound } from '../src/lib/server/people.js';
import { watchedRecord } from '../src/lib/server/manage.js';
import { addFilm, freshDb } from './helpers.js';

/**
 * How a normal round, an extra night and a special night relate: what each does to
 * the others when it starts, when it is called off and when it ends, and what is
 * left in the history afterwards. The clock is the suite's: Monday 3 August, the
 * round closing Thursday 6 August at 20:00 Warsaw time.
 */
const SUNDAY = new Date('2026-08-04T18:00:00Z');
const WEDNESDAY = new Date('2026-08-05T18:00:00Z');

/** a round with a list that already has some life in it */
function lively(ruleSet: 'weekly' | 'banked' = 'weekly') {
	const { db, rules } = freshDb(ruleSet);
	const paddington = addFilm(db, 'Paddington', 'ala', 1);
	const heat = addFilm(db, 'Heat', 'bartek', 1);
	setPoints(db, rules, 'celina', paddington, 2);
	setPoints(db, rules, 'darek', heat, 1);
	return { db, rules, paddington, heat };
}

function decide(db: ReturnType<typeof freshDb>['db'], rules: ReturnType<typeof freshDb>['rules']) {
	closeWeek(db, rules);
	const runoff = openRunoff(db);
	if (runoff) closeRunoff(db, rules, runoff.id);
}

describe('calling a special night off', () => {
	it('works with picks up, erasing them and every tick, comment and seen mark on them', () => {
		const { db, rules } = lively();
		startSpecial(db, rules, 'approval');
		const a = nominateSpecial(db, rules, 'ala', { title: 'The Thing' });
		const b = nominateSpecial(db, rules, 'bartek', { title: 'Suspiria' });
		setApproval(db, rules, 'ewa', a, true);
		setApproval(db, rules, 'filip', a, true);
		setApproval(db, rules, 'filip', b, true);
		addComment(db, 'ewa', a, 'looks great');
		toggleSeen(db, 'filip', b);
		expect(xpBreakdown(db, 'ewa').weeksVoted).toBe(1);

		expect(stopSpecial(db, rules)).toBe(2);

		expect(currentWeek(db)!.special).toBeNull();
		expect(currentWeek(db)!.custom).toBeNull();
		for (const table of ['approval', 'film_comment', 'film_seen']) {
			expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
		}
		expect(db.prepare('SELECT COUNT(*) AS n FROM film WHERE special IS NOT NULL').get()).toEqual({ n: 0 });
		// a tick was the only thing that earned that round, and it is gone with it
		expect(xpBreakdown(db, 'ewa').weeksVoted).toBe(0);
		expect(xpBreakdown(db, 'ala').nominations).toBe(1);
	});

	it('lets the same films be put up again, and a list nomination too', () => {
		const { db, rules } = freshDb('weekly');
		startSpecial(db, rules, 'approval');
		nominateSpecial(db, rules, 'ala', { title: 'The Thing' });
		stopSpecial(db, rules);
		// the list is awake again and the title is nobody’s
		nominate(db, rules, 'ala', { title: 'The Thing' });
		expect(standings(db, rules, 1, 'ala').map((f) => f.title)).toEqual(['The Thing']);
		startSpecial(db, rules, 'approval');
		expect(() => nominateSpecial(db, rules, 'bartek', { title: 'The Thing' })).toThrow(
			expect.objectContaining({ code: 'dup_active' })
		);
	});

	it('wakes the list exactly as it was: points, nominations, holds, budget and the round to close', () => {
		const { db, rules, paddington, heat } = lively();
		nominate(db, rules, 'celina', { title: 'Alien' });
		holdFilm(db, 'ala', paddington, 'away');
		const before = standings(db, rules, 1, 'celina').map((f) => [f.title, f.score, f.held?.reason ?? null]);
		const spent = spentInRound(db, 'celina', 1);

		startSpecial(db, rules, 'approval');
		expect(() => setPoints(db, rules, 'darek', heat, 2)).toThrow(
			expect.objectContaining({ code: 'list_asleep' })
		);
		expect(() => nominate(db, rules, 'ewa', { title: 'Vertigo' })).toThrow(
			expect.objectContaining({ code: 'list_asleep' })
		);
		nominateSpecial(db, rules, 'ewa', { title: 'The Thing' });
		stopSpecial(db, rules);

		expect(standings(db, rules, 1, 'celina').map((f) => [f.title, f.score, f.held?.reason ?? null])).toEqual(before);
		expect(spentInRound(db, 'celina', 1)).toBe(spent);
		// ewa never got to nominate on the list during the night, and now may
		nominate(db, rules, 'ewa', { title: 'Vertigo' });
		expect(() => nominate(db, rules, 'celina', { title: 'Rope' })).toThrow(
			expect.objectContaining({ code: 'already_nominated' })
		);
		// and the round is an ordinary one: it closes on points, with the room
		setPoints(db, rules, 'ewa', paddington, 1);
		decide(db, rules);
		// Paddington leads, but its nominator’s hold survived the night: Heat is the film
		expect(filmById(db, heat)!.status).toBe('watched');
		expect(filmById(db, paddington)!.status).toBe('active');
		expect(currentWeek(db)!.number).toBe(2);
		expect(weekByNumber(db, 1)!.special).toBeNull();
	});

	it('leaves a nominator’s own list film on the list, and it asks again next time', () => {
		const { db, rules } = freshDb('weekly');
		const alien = addFilm(db, 'Alien', 'ala', 1);
		startSpecial(db, rules, 'approval');
		nominateSpecial(db, rules, 'ala', { title: 'Alien' }, null, true);
		stopSpecial(db, rules);
		expect(filmById(db, alien)!.status).toBe('active');
		startSpecial(db, rules, 'approval');
		expect(() => nominateSpecial(db, rules, 'ala', { title: 'Alien' })).toThrow(
			expect.objectContaining({ code: 'from_list_unconfirmed' })
		);
	});

	it('forgets a custom week’s setup, and refuses to tune a round that is no longer special', () => {
		const { db, rules } = freshDb('weekly');
		const custom = { name: 'Polish week', about: '', picks: 2, rules: {} };
		startSpecial(db, rules, 'approval', custom);
		stopSpecial(db, rules);
		expect(() => editSpecial(db, custom)).toThrow(expect.objectContaining({ code: 'no_special' }));
		expect(() => stopSpecial(db, rules)).toThrow(expect.objectContaining({ code: 'no_special' }));
	});

	it('is refused once the room has the night, and once the deadline has passed', () => {
		const { db, rules } = freshDb('weekly');
		startSpecial(db, rules, 'approval');
		const pick = nominateSpecial(db, rules, 'ala', { title: 'The Thing' });
		setApproval(db, rules, 'bartek', pick, true);
		expect(() => stopSpecial(db, rules, new Date('2026-08-06T19:00:00Z'))).toThrow(
			expect.objectContaining({ code: 'deadline_passed' })
		);
		closeWeek(db, rules);
		expect(() => stopSpecial(db, rules)).toThrow(expect.objectContaining({ code: 'room_picking' }));
		closeRunoff(db, rules, openRunoff(db)!.id);
		// a round that is over is a new, plain one
		expect(() => stopSpecial(db, rules)).toThrow(expect.objectContaining({ code: 'no_special' }));
	});

	it('banks the same as a round that was never special', () => {
		const run = (withSpecial: boolean) => {
			const { db, rules, paddington } = lively('banked');
			if (withSpecial) {
				startSpecial(db, rules, 'approval');
				nominateSpecial(db, rules, 'ala', { title: 'The Thing' });
				stopSpecial(db, rules);
			}
			decide(db, rules);
			return [
				filmById(db, paddington)!.status,
				...['ala', 'bartek', 'celina', 'darek'].map((id) => bankBalance(db, id))
			];
		};
		expect(run(true)).toEqual(run(false));
	});

	it('can be followed by another special night, and another call-off', () => {
		const { db, rules } = freshDb('weekly');
		for (let i = 0; i < 3; i++) {
			startSpecial(db, rules, 'approval');
			nominateSpecial(db, rules, 'ala', { title: 'The Thing' });
			stopSpecial(db, rules);
		}
		expect(currentWeek(db)!.special).toBeNull();
		expect(db.prepare('SELECT COUNT(*) AS n FROM film').get()).toEqual({ n: 0 });
	});
});

describe('calling an extra night off', () => {
	it('takes its date out of the calendar and gives the round back the night it had', () => {
		const { db, rules } = lively();
		const thursday = currentWeek(db)!.closes_at;
		startExtraNight(db, rules, 'approval', null, SUNDAY);
		nominateSpecial(db, rules, 'ewa', { title: 'The Thing' });
		expect(currentWeek(db)!.closes_at).toBe(SUNDAY.toISOString());

		stopSpecial(db, rules);

		expect(allNights(db)).toEqual([]);
		expect(currentWeek(db)!.closes_at).toBe(thursday);
		expect(currentWeek(db)!.special).toBeNull();
	});

	it('leaves a night somebody planned alone, even when the round was made special on it', () => {
		const { db, rules } = freshDb('weekly');
		addNight(db, WEDNESDAY, 'Wednesday');
		syncOpenWeek(db);
		startSpecial(db, rules, 'approval');
		stopSpecial(db, rules);
		expect(allNights(db).map((n) => [n.at, n.status])).toEqual([[WEDNESDAY.toISOString(), 'planned']]);
		expect(currentWeek(db)!.closes_at).toBe(WEDNESDAY.toISOString());
	});

	it('takes out only the extra date when a planned night is there too', () => {
		const { db, rules } = freshDb('weekly');
		addNight(db, WEDNESDAY, 'Wednesday');
		syncOpenWeek(db);
		startExtraNight(db, rules, 'approval', null, SUNDAY);
		stopSpecial(db, rules);
		expect(allNights(db).map((n) => n.at)).toEqual([WEDNESDAY.toISOString()]);
		expect(currentWeek(db)!.closes_at).toBe(WEDNESDAY.toISOString());
	});

	it('follows the date if an admin moved it, and does nothing to one they skipped or deleted', () => {
		const { db, rules } = freshDb('weekly');
		const thursday = currentWeek(db)!.closes_at;
		startExtraNight(db, rules, 'approval', null, SUNDAY);
		const id = allNights(db)[0].id;
		const monday = new Date('2026-08-04T20:00:00Z');
		moveNight(db, id, monday, null);
		syncOpenWeek(db);
		expect(currentWeek(db)!.closes_at).toBe(monday.toISOString());
		stopSpecial(db, rules);
		expect(allNights(db)).toEqual([]);
		expect(currentWeek(db)!.closes_at).toBe(thursday);

		// skipped: the special round is on to the Thursday, and calling it off leaves the note of it
		startExtraNight(db, rules, 'approval', null, SUNDAY);
		setNightStatus(db, allNights(db)[0].id, 'skipped');
		syncOpenWeek(db);
		expect(currentWeek(db)!.closes_at).toBe(thursday);
		expect(currentWeek(db)!.special).toBe('approval');
		stopSpecial(db, rules);
		expect(allNights(db).map((n) => n.status)).toEqual(['skipped']);

		// deleted: the same, with nothing left to find
		const { db: db2, rules: rules2 } = freshDb('weekly');
		startExtraNight(db2, rules2, 'approval', null, SUNDAY);
		deleteNight(db2, allNights(db2)[0].id);
		syncOpenWeek(db2);
		expect(currentWeek(db2)!.special).toBe('approval');
		stopSpecial(db2, rules2);
		expect(allNights(db2)).toEqual([]);
	});

	it('can be set up again on the same date afterwards', () => {
		const { db, rules } = freshDb('weekly');
		startExtraNight(db, rules, 'approval', null, SUNDAY);
		stopSpecial(db, rules);
		expect(startExtraNight(db, rules, 'approval', null, SUNDAY).closes_at).toBe(SUNDAY.toISOString());
	});
});

describe('an extra night that is played', () => {
	it('is its own evening, before the Thursday’s, and gives the list the round it had', () => {
		const { db, rules, paddington } = lively('banked');
		const thursday = currentWeek(db)!.closes_at;
		startExtraNight(db, rules, 'approval', null, SUNDAY);
		const pick = nominateSpecial(db, rules, 'ewa', { title: 'The Thing' });
		setApproval(db, rules, 'filip', pick, true);
		tick(new Date('2026-08-04T18:00:30Z'), db);
		expect(currentWeek(db)!.status).toBe('runoff');
		tick(new Date('2026-08-04T21:01:00Z'), db);

		expect(filmById(db, pick)!.status).toBe('watched');
		expect(filmById(db, pick)!.watched_week).toBe(1);
		const next = currentWeek(db)!;
		expect(next.number).toBe(2);
		expect(next.special).toBeNull();
		expect(next.closes_at).toBe(thursday);
		expect(allNights(db)).toMatchObject([{ status: 'used', week_number: 1, extra: 1 }]);
		// the list’s points are still against the same budget, and nobody was banked twice
		expect(spentInRound(db, 'celina', 2)).toBe(2);
		expect(filmById(db, paddington)!.status).toBe('active');

		// the Thursday film is the second evening, and it is round 2
		setPoints(db, rules, 'ala', paddington, 2);
		tick(new Date(Date.parse(thursday) + 1000), db);
		tick(new Date(Date.parse(thursday) + 4 * 3600_000), db);
		expect(filmById(db, paddington)!.watched_week).toBe(2);
		const evenings = filmEvenings(db);
		expect(evenings.get(pick)).toBe(1);
		expect(evenings.get(paddington)).toBe(2);
		expect(roundEvenings(db)[3]).toBe(3);
	});

	it('closes with no film when nobody ticked, and the list round is still waiting at its night', () => {
		const { db, rules } = lively();
		const thursday = currentWeek(db)!.closes_at;
		startExtraNight(db, rules, 'approval', null, SUNDAY);
		nominateSpecial(db, rules, 'ewa', { title: 'The Thing' });
		tick(new Date('2026-08-04T18:00:30Z'), db);
		expect(currentWeek(db)!.number).toBe(2);
		expect(currentWeek(db)!.closes_at).toBe(thursday);
		expect(allNights(db)[0].status).toBe('used');
		// what did not get watched is dropped, and is not on the list’s shelf of films to bring back
		expect(db.prepare(`SELECT status FROM film WHERE title = 'The Thing'`).get()).toEqual({ status: 'dropped' });
		expect(droppedShelf(db)).toEqual([]);
		// the list lived through it: both of its films, with their points, one list round old
		expect(standings(db, rules, 2, null).map((f) => [f.title, f.score])).toEqual([
			['Paddington', 2],
			['Heat', 1]
		]);
	});

	it('a pick that lost can be nominated on the list afterwards', () => {
		const { db, rules } = freshDb('weekly');
		startSpecial(db, rules, 'approval');
		const thing = nominateSpecial(db, rules, 'ala', { title: 'The Thing' });
		nominateSpecial(db, rules, 'bartek', { title: 'Suspiria' });
		setApproval(db, rules, 'celina', thing, true);
		decide(db, rules);
		expect(filmById(db, thing)!.status).toBe('watched');
		nominate(db, rules, 'bartek', { title: 'Suspiria' });
		expect(standings(db, rules, 2, 'bartek').map((f) => f.title)).toEqual(['Suspiria']);
		// the watched one is still a duplicate
		expect(() => nominate(db, rules, 'celina', { title: 'The Thing' })).toThrow(
			expect.objectContaining({ code: 'dup_watched' })
		);
	});

	it('a winning pick from the list takes its list film off, and off the shelf of dropped films', () => {
		const { db, rules } = freshDb('weekly');
		const alien = addFilm(db, 'Alien', 'ala', 1);
		setPoints(db, rules, 'bartek', alien, 2);
		startSpecial(db, rules, 'approval');
		const pick = nominateSpecial(db, rules, 'ala', { title: 'Alien' }, null, true);
		setApproval(db, rules, 'celina', pick, true);
		decide(db, rules);
		expect(filmById(db, alien)!.status).toBe('dropped');
		expect(filmById(db, pick)!.status).toBe('watched');
		expect(droppedShelf(db)).toEqual([]);
		// what was spent on the list film stays spent
		expect(spentInRound(db, 'bartek', 2)).toBe(2);
	});
});

describe('stretches of specials and normal rounds in a row', () => {
	it('keeps the list’s clock right across two special nights', () => {
		const { db, rules } = freshDb('weekly');
		const paddington = addFilm(db, 'Paddington', 'ala', 1);
		setPoints(db, rules, 'bartek', paddington, 2);
		for (const title of ['The Thing', 'Suspiria']) {
			startSpecial(db, rules, 'approval');
			setApproval(db, rules, 'celina', nominateSpecial(db, rules, 'darek', { title }), true);
			// the list has not aged, whatever number the round has
			expect(standings(db, rules, currentWeek(db)!.number, null)[0].score).toBe(2);
			decide(db, rules);
		}
		const week = currentWeek(db)!;
		expect(week.number).toBe(3);
		expect(standings(db, rules, 3, null)[0]).toMatchObject({ title: 'Paddington', score: 2 });
		expect(spentInRound(db, 'bartek', 3)).toBe(2);
		expect(filmById(db, paddington)!.status).toBe('active');
	});

	it('does not let a played special night spoil the stats of the list’s evenings', () => {
		const { db, rules, paddington } = lively();
		const before = counts(db, windowFor(db, 'all'));
		startExtraNight(db, rules, 'approval', null, SUNDAY);
		const pick = nominateSpecial(db, rules, 'ewa', { title: 'The Thing' });
		setApproval(db, rules, 'filip', pick, true);
		tick(new Date('2026-08-04T18:00:30Z'), db);
		tick(new Date('2026-08-04T21:01:00Z'), db);
		const during = counts(db, windowFor(db, 'all'));
		expect(during.nights).toBe(before.nights + 1);
		expect(during.rounds).toBeGreaterThanOrEqual(before.rounds);
		expect(filmById(db, paddington)!.status).toBe('active');
	});

	it('refuses to start a special night, or an extra one, while the room is picking', () => {
		const { db, rules } = lively();
		closeWeek(db, rules);
		expect(() => startSpecial(db, rules, 'approval')).toThrow(expect.objectContaining({ code: 'room_picking' }));
		expect(() => startExtraNight(db, rules, 'approval', null, SUNDAY)).toThrow(
			expect.objectContaining({ code: 'room_picking' })
		);
	});

	it('refuses a second special night on a round that already is one, extra or not', () => {
		const { db, rules } = freshDb('weekly');
		startExtraNight(db, rules, 'approval', null, SUNDAY);
		expect(() => startSpecial(db, rules, 'approval')).toThrow(expect.objectContaining({ code: 'special_on' }));
		expect(() => startExtraNight(db, rules, 'approval', null, new Date('2026-08-04T12:00:00Z'))).toThrow(
			expect.objectContaining({ code: 'special_on' })
		);
		// and the refused one left nothing in the calendar
		expect(allNights(db)).toHaveLength(1);
	});
});

describe('an extra night started on the spot', () => {
	it('is a special night that closes a couple of hours from now and takes the list’s place meanwhile', () => {
		const { db, rules, paddington } = lively();
		const thursday = currentWeek(db)!.closes_at;

		const week = startExtraNow(db, rules);

		expect(week.special).toBe('approval');
		expect(Date.parse(week.closes_at) - Date.now()).toBeLessThanOrEqual(EXTRA_NOW_MS);
		expect(Date.parse(week.closes_at) - Date.now()).toBeGreaterThan(EXTRA_NOW_MS - 60_000);
		expect(allNights(db).map((n) => n.extra)).toEqual([1]);

		// what was spent on the list stays where it was, and the list can be had back
		expect(spentInRound(db, 'celina', 1)).toBe(2);
		stopSpecial(db, rules);
		expect(allNights(db)).toEqual([]);
		expect(currentWeek(db)!.closes_at).toBe(thursday);
		expect(filmById(db, paddington)!.status).toBe('active');
	});

	it('is turned down while a special night is on, and nothing changes', () => {
		const { db, rules } = lively();
		startSpecial(db, rules, 'approval');
		expect(() => startExtraNow(db, rules)).toThrow(/already/);
		expect(allNights(db)).toEqual([]);
	});

	it('is turned down when the round closes within the time it would run', () => {
		const { db, rules } = lively();
		addNight(db, new Date(Date.now() + 3600_000), null);
		syncOpenWeek(db);
		expect(() => startExtraNow(db, rules)).toThrow(/before the round closes/);
		expect(currentWeek(db)!.special).toBeNull();
	});
});

describe('how the record tells the nights apart', () => {
	it('marks the film of a special night or an extra night, and leaves the Thursday film unmarked', () => {
		const { db, rules, paddington } = lively();
		const thursday = currentWeek(db)!.closes_at;
		startExtraNight(db, rules, 'approval', { name: 'Garden', about: '', picks: 1, rules: {} }, SUNDAY);
		const pick = nominateSpecial(db, rules, 'ewa', { title: 'The Thing' });
		setApproval(db, rules, 'filip', pick, true);
		tick(new Date('2026-08-04T18:00:30Z'), db);
		tick(new Date('2026-08-04T21:01:00Z'), db);

		setPoints(db, rules, 'ala', paddington, 2);
		tick(new Date(Date.parse(thursday) + 1000), db);
		tick(new Date(Date.parse(thursday) + 4 * 3600_000), db);

		startSpecial(db, rules, 'approval');
		const third = nominateSpecial(db, rules, 'bartek', { title: 'Suspiria' });
		setApproval(db, rules, 'celina', third, true);
		decide(db, rules);

		const record = new Map(watchedRecord(db).map((film) => [film.title, film.specialNight]));
		expect(record.get('The Thing')).toBe(true);
		expect(record.get('Paddington')).toBe(false);
		expect(record.get('Suspiria')).toBe(true);
	});
});
