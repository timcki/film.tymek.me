import { describe, expect, it } from 'vitest';
import { eveningOf, roundEvenings } from '../src/lib/server/evenings.js';
import { addFilm, ensureWeek, freshDb } from './helpers.js';

/** week 1 is open from freshDb; films watched in 2, 3 and 5, nothing in 1, 4 and 6 */
function gappyHistory() {
	const { db } = freshDb('weekly');
	for (const week of [2, 3, 4, 5, 6]) ensureWeek(db, week);
	const watch = (title: string, week: number) => {
		const id = addFilm(db, title, 'ala', week);
		db.prepare(`UPDATE film SET status = 'watched', watched_week = ? WHERE id = ?`).run(week, id);
	};
	watch('Stalker', 2);
	watch('Solaris', 3);
	watch('Mirror', 5);
	// on the list or fallen off it, neither is an evening
	addFilm(db, 'Nostalghia', 'bartek', 4);
	const dropped = addFilm(db, 'Sacrifice', 'celina', 6);
	db.prepare(`UPDATE film SET status = 'dropped' WHERE id = ?`).run(dropped);
	return db;
}

describe('evenings', () => {
	it('counts only the nights we watched something, so the gaps disappear', () => {
		const db = gappyHistory();
		expect(roundEvenings(db)).toEqual({ 1: 1, 2: 1, 3: 2, 4: 3, 5: 3, 6: 4 });
	});

	it('a round with no film is called after the evening it is still heading for', () => {
		const db = gappyHistory();
		// week 4 watched nothing, so it and week 5 both lead to the third evening
		expect(roundEvenings(db)[4]).toBe(roundEvenings(db)[5]);
	});

	it('the single lookup agrees with the whole map', () => {
		const db = gappyHistory();
		const all = roundEvenings(db);
		for (const week of [1, 2, 3, 4, 5, 6]) expect(eveningOf(db, week)).toBe(all[week]);
	});
});
