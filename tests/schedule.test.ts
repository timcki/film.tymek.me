import { describe, expect, it } from 'vitest';
import {
	addNight,
	allNights,
	deleteNight,
	markNightUsed,
	moveNight,
	nextNight,
	setNightStatus
} from '../src/lib/server/schedule.js';
import { closeWeek, currentWeek, openWeek, syncOpenWeek } from '../src/lib/server/weeks.js';
import { closeRunoff, openRunoff } from '../src/lib/server/runoffs.js';
import { tick } from '../src/lib/server/scheduler.js';
import { RuleError } from '../src/lib/server/types.js';
import { addFilm, castBallot, freshDb } from './helpers.js';

/** freshDb opens week 1 at this instant, a Monday */
const MONDAY = new Date('2026-08-03T10:00:00Z');
const at = (iso: string) => new Date(iso);

describe('the calendar', () => {
	it('falls back to Thursday 20:00 when nothing is planned', () => {
		const { db } = freshDb('banked', MONDAY);
		// 20:00 Warsaw in August is 18:00 UTC
		expect(currentWeek(db)!.closes_at).toBe('2026-08-06T18:00:00.000Z');
	});

	it('closes the round on the next planned night instead', () => {
		const { db } = freshDb('banked', MONDAY);
		addNight(db, at('2026-08-05T18:00:00.000Z'), 'u Piotra');

		expect(syncOpenWeek(db)!.closes_at).toBe('2026-08-05T18:00:00.000Z');
	});

	it('takes the soonest planned night, not the first one entered', () => {
		const { db } = freshDb('banked', MONDAY);
		addNight(db, at('2026-08-20T18:00:00.000Z'), null);
		addNight(db, at('2026-08-05T18:00:00.000Z'), null);

		expect(nextNight(db, MONDAY).toISOString()).toBe('2026-08-05T18:00:00.000Z');
	});

	it('runs the round on to the date after when a night is skipped', () => {
		const { db } = freshDb('banked', MONDAY);
		const wednesday = addNight(db, at('2026-08-05T18:00:00.000Z'), null);
		addNight(db, at('2026-08-12T18:00:00.000Z'), null);
		expect(syncOpenWeek(db)!.closes_at).toBe('2026-08-05T18:00:00.000Z');

		setNightStatus(db, wednesday, 'skipped');

		expect(syncOpenWeek(db)!.closes_at).toBe('2026-08-12T18:00:00.000Z');
	});

	it('goes back to the Thursday fallback when the last plan is dropped', () => {
		const { db } = freshDb('banked', MONDAY);
		const only = addNight(db, at('2026-08-11T18:00:00.000Z'), null);
		syncOpenWeek(db);

		deleteNight(db, only);

		expect(syncOpenWeek(db)!.closes_at).toBe('2026-08-06T18:00:00.000Z');
	});

	it('moves everyone deadline at once when a night is moved', () => {
		const { db } = freshDb('banked', MONDAY);
		const night = addNight(db, at('2026-08-06T18:00:00.000Z'), null);
		syncOpenWeek(db);

		moveNight(db, night, at('2026-08-05T17:00:00.000Z'), 'wcześniej, bo Piotr pracuje');

		expect(syncOpenWeek(db)!.closes_at).toBe('2026-08-05T17:00:00.000Z');
	});

	it('refuses two nights at the same instant', () => {
		const { db } = freshDb('banked', MONDAY);
		addNight(db, at('2026-08-06T18:00:00.000Z'), null);
		expect(() => addNight(db, at('2026-08-06T18:00:00.000Z'), null)).toThrow(RuleError);
	});

	it('leaves a night alone once it has been used', () => {
		const { db } = freshDb('banked', MONDAY);
		const night = addNight(db, at('2026-08-06T18:00:00.000Z'), null);
		markNightUsed(db, 1, '2026-08-06T18:00:00.000Z');

		expect(() => deleteNight(db, night)).toThrow(RuleError);
		expect(() => moveNight(db, night, at('2026-09-01T18:00:00.000Z'), null)).toThrow(RuleError);
		expect(() => setNightStatus(db, night, 'skipped')).toThrow(RuleError);
	});

	it('refuses a night that is already behind us, however it gets there', () => {
		const { db } = freshDb('banked', MONDAY);
		const past = at('2026-08-03T09:00:00.000Z');
		const code = (fn: () => unknown) => {
			try {
				fn();
			} catch (error) {
				return (error as RuleError).code;
			}
		};
		expect(code(() => addNight(db, past, null, MONDAY))).toBe('night_past');

		const wednesday = addNight(db, at('2026-08-05T18:00:00.000Z'), null, MONDAY);
		expect(code(() => moveNight(db, wednesday, past, null, MONDAY))).toBe('night_past');

		// skipped on Monday, then somebody presses restore once Wednesday is over
		setNightStatus(db, wednesday, 'skipped', MONDAY);
		const friday = at('2026-08-07T10:00:00.000Z');
		expect(code(() => setNightStatus(db, wednesday, 'planned', friday))).toBe('night_past');
		// skipping a night that has passed is still fine; it changes no deadline
		setNightStatus(db, wednesday, 'planned', MONDAY);
		expect(() => setNightStatus(db, wednesday, 'skipped', friday)).not.toThrow();
	});

	it('is stable: recomputing does not walk the deadline forward', () => {
		const { db } = freshDb('banked', MONDAY);
		const first = syncOpenWeek(db)!.closes_at;
		for (let i = 0; i < 5; i++) syncOpenWeek(db);
		expect(currentWeek(db)!.closes_at).toBe(first);
	});
});

describe('a round that closes on a planned night', () => {
	it('records which night it was and picks up the next one', () => {
		const { db, rules } = freshDb('banked', MONDAY);
		addNight(db, at('2026-08-05T18:00:00.000Z'), 'środa');
		addNight(db, at('2026-08-19T18:00:00.000Z'), 'za dwa tygodnie');
		syncOpenWeek(db);

		const film = addFilm(db, 'Only', 'ala', 1);
		castBallot(db, 1, 'ala', film, 2);
		closeWeek(db, rules, at('2026-08-05T18:00:00.000Z'));
		closeRunoff(db, rules, openRunoff(db)!.id, at('2026-08-05T18:05:00.000Z'));

		const nights = allNights(db);
		expect(nights[0].status).toBe('used');
		expect(nights[0].week_number).toBe(1);
		// the fortnight gap is the schedule doing what it was told, not a bug
		expect(currentWeek(db)!.number).toBe(2);
		expect(currentWeek(db)!.closes_at).toBe('2026-08-19T18:00:00.000Z');
	});

	it('gives a round decided early on the night itself a whole round after it', () => {
		const { db, rules } = freshDb('banked', MONDAY);
		const film = addFilm(db, 'Only', 'ala', 1);
		castBallot(db, 1, 'ala', film, 2);

		// nothing planned, so the round was due Thursday 20:00; the host closed at
		// 19:30 and the room had decided by 19:50
		closeWeek(db, rules, at('2026-08-06T17:30:00.000Z'));
		closeRunoff(db, rules, openRunoff(db)!.id, at('2026-08-06T17:50:00.000Z'));

		expect(currentWeek(db)!.number).toBe(2);
		expect(currentWeek(db)!.closes_at).toBe('2026-08-13T18:00:00.000Z');
		expect(syncOpenWeek(db)!.closes_at).toBe('2026-08-13T18:00:00.000Z');
	});

	it('does not hand the next round the night the early close already used', () => {
		const { db, rules } = freshDb('banked', MONDAY);
		addNight(db, at('2026-08-06T18:00:00.000Z'), null);
		syncOpenWeek(db);
		const film = addFilm(db, 'Only', 'ala', 1);
		castBallot(db, 1, 'ala', film, 2);

		closeWeek(db, rules, at('2026-08-05T18:00:00.000Z'));
		closeRunoff(db, rules, openRunoff(db)!.id, at('2026-08-05T18:05:00.000Z'));

		expect(currentWeek(db)!.closes_at).toBe('2026-08-13T18:00:00.000Z');
	});

	it('leaves the calendar alone when it closes on the Thursday fallback', () => {
		const { db, rules } = freshDb('banked', MONDAY);
		addNight(db, at('2026-09-02T18:00:00.000Z'), 'later on');
		const film = addFilm(db, 'Only', 'ala', 1);
		castBallot(db, 1, 'ala', film, 2);

		// closed early by hand, so no planned night matches
		closeWeek(db, rules, at('2026-08-04T12:00:00.000Z'));

		expect(allNights(db)[0].status).toBe('planned');
	});
});

describe('the scheduler', () => {
	it('closes the round the moment a moved-up night passes', () => {
		const { db } = freshDb('banked', MONDAY);
		openWeek(db, 1, MONDAY);
		const film = addFilm(db, 'Only', 'ala', 1);
		castBallot(db, 1, 'ala', film, 2);
		addNight(db, at('2026-08-04T18:00:00.000Z'), null);

		tick(at('2026-08-04T17:59:00.000Z'), db);
		expect(currentWeek(db)!.number).toBe(1);

		// the close sends the night to the room; the runoff expiring three hours
		// later is what resolves the week, and the tick handles that too
		tick(at('2026-08-04T18:00:30.000Z'), db);
		expect(currentWeek(db)!.status).toBe('runoff');
		tick(at('2026-08-04T21:01:00.000Z'), db);
		expect(currentWeek(db)!.number).toBe(2);
	});
});
