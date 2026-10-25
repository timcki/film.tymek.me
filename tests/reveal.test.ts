import { describe, expect, it } from 'vitest';
import {
	REVEAL_GRACE_MS,
	resultPublic,
	revealLength,
	revealStep
} from '../src/lib/reveal.js';
import { closeRunoff, runoffByCode, startReveal } from '../src/lib/server/runoffs.js';
import { rankedRoom } from './helpers.js';

const at = (iso: string, ms = 0) => new Date(new Date(iso).getTime() + ms);

describe('§7.2 the count on the projector', () => {
	it('gives each ballot time to be read, within a floor and a ceiling', () => {
		expect(revealStep(15)).toBe(2000);
		expect(revealStep(2)).toBe(2600);
		expect(revealStep(40)).toBe(1500);
	});

	it('keeps the result off the phones until the host has counted it on the screen', () => {
		const closed = '2026-08-03T10:00:00.000Z';
		const room = { closed_at: closed, revealed_at: null };
		expect(resultPublic({ closed_at: null, revealed_at: null }, 5, at(closed, 1e9))).toBe(false);
		expect(resultPublic(room, 5, at(closed, 60_000))).toBe(false);
		// a room that closed on its own clock, with nobody to press the button
		expect(resultPublic(room, 5, at(closed, REVEAL_GRACE_MS))).toBe(true);

		const counted = { closed_at: closed, revealed_at: '2026-08-03T10:02:00.000Z' };
		expect(resultPublic(counted, 5, at(counted.revealed_at, revealLength(5) - 1))).toBe(false);
		expect(resultPublic(counted, 5, at(counted.revealed_at, revealLength(5)))).toBe(true);
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

});
