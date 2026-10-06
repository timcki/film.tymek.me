import { describe, expect, it } from 'vitest';
import {
	REVEAL_GRACE_MS,
	TIEBREAK_MS,
	resultPublic,
	revealLength,
	revealStep
} from '../src/lib/reveal.js';
import { closeRunoff, decidedOnPoints, runoffByCode, startReveal } from '../src/lib/server/runoffs.js';
import { rankedRoom } from './helpers.js';

const at = (iso: string, ms = 0) => new Date(new Date(iso).getTime() + ms);

describe('§7.2 the count on the projector', () => {
	it('gives each ballot time to be read, within a floor and a ceiling', () => {
		expect(revealStep(15)).toBe(2000);
		expect(revealStep(2)).toBe(2600);
		expect(revealStep(40)).toBe(1500);
		expect(revealLength(7, true) - revealLength(7, false)).toBe(TIEBREAK_MS);
	});

	it('keeps the result off the phones until the host has counted it on the screen', () => {
		const closed = '2026-08-03T10:00:00.000Z';
		const room = { closed_at: closed, revealed_at: null };
		expect(resultPublic({ closed_at: null, revealed_at: null }, 5, false, at(closed, 1e9))).toBe(false);
		expect(resultPublic(room, 5, false, at(closed, 60_000))).toBe(false);
		// a room that closed on its own clock, with nobody to press the button
		expect(resultPublic(room, 5, false, at(closed, REVEAL_GRACE_MS))).toBe(true);

		const counted = { closed_at: closed, revealed_at: '2026-08-03T10:02:00.000Z' };
		expect(resultPublic(counted, 5, false, at(counted.revealed_at, revealLength(5, false) - 1))).toBe(false);
		expect(resultPublic(counted, 5, false, at(counted.revealed_at, revealLength(5, false)))).toBe(true);
		expect(resultPublic(counted, 5, true, at(counted.revealed_at, revealLength(5, false)))).toBe(false);
	});

	it('starts the phones’ clock once, and only on a closed room', () => {
		const { db, rules, runoff, films: [a, b, c], cast } = rankedRoom();
		cast([a, b, c], 2);
		startReveal(db, runoff.id, at('2026-08-03T10:00:00.000Z'));
		expect(runoffByCode(db, runoff.code)!.revealed_at).toBeNull();

		closeRunoff(db, rules, runoff.id);
		startReveal(db, runoff.id, at('2026-08-03T10:05:00.000Z'));
		startReveal(db, runoff.id, at('2026-08-03T10:06:00.000Z'));
		expect(runoffByCode(db, runoff.code)!.revealed_at).toBe('2026-08-03T10:05:00.000Z');
	});

	it('knows when the winner had to be settled on ranked points', () => {
		const clear = rankedRoom();
		clear.cast([clear.films[0], clear.films[1], clear.films[2]], 3);
		clear.cast([clear.films[1], clear.films[2], clear.films[0]], 2);
		closeRunoff(clear.db, clear.rules, clear.runoff.id);
		expect(decidedOnPoints(clear.db, runoffByCode(clear.db, clear.runoff.code)!)).toBe(false);

		const cycle = rankedRoom();
		const [a, b, c] = cycle.films;
		cycle.cast([a, b, c], 3);
		cycle.cast([b, c, a], 4);
		cycle.cast([c, a, b], 2);
		closeRunoff(cycle.db, cycle.rules, cycle.runoff.id);
		expect(decidedOnPoints(cycle.db, runoffByCode(cycle.db, cycle.runoff.code)!)).toBe(true);
	});
});
