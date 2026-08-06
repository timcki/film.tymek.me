import { describe, expect, it } from 'vitest';
import {
	addArchivalFilm,
	markWatched,
	nightOf,
	reassignFilm,
	setFilmAttribution
} from '../src/lib/server/manage.js';
import { filmById, setPoints, standings } from '../src/lib/server/films.js';
import { applyAttrition } from '../src/lib/server/weeks.js';
import { RuleError } from '../src/lib/server/types.js';
import { addFilm, ensureWeek, freshDb } from './helpers.js';

/**
 * The archive is a written record of nights that already happened. It has to be
 * possible to correct who suggested what and which night it was, and to fill in
 * a night nobody logged, without any of it touching the round in play.
 */

const archival = (over: Partial<Parameters<typeof addArchivalFilm>[1]> = {}) => ({
	title: 'Stalker',
	year: 1979,
	director: 'Andrei Tarkovsky',
	genre: 'Science Fiction',
	runtime: 162,
	tmdbId: 1398,
	posterUrl: null,
	overview: null,
	personId: 'ala',
	week: 3,
	watched: false,
	...over
});

describe('writing a night down', () => {
	it('does not disturb a nomination already sitting in that week', () => {
		const { db } = freshDb();
		ensureWeek(db, 3);
		const existing = addFilm(db, 'Solaris', 'ala', 3);

		addArchivalFilm(db, archival({ personId: 'ala', week: 3 }));

		// the bug this whole change exists for: the row that was already there stays
		expect(filmById(db, existing)).toMatchObject({ title: 'Solaris', added_by: 'ala' });
		expect((db.prepare('SELECT COUNT(*) AS n FROM film').get() as { n: number }).n).toBe(2);
	});

	it('takes several films for one person in one week', () => {
		const { db } = freshDb();
		ensureWeek(db, 3);
		addArchivalFilm(db, archival({ title: 'Stalker', tmdbId: 1398 }));
		addArchivalFilm(db, archival({ title: 'Mirror', tmdbId: 1396 }));
		addArchivalFilm(db, archival({ title: 'Andrei Rublev', tmdbId: 895 }));

		const n = db
			.prepare(`SELECT COUNT(*) AS n FROM film WHERE added_by = 'ala' AND added_week = 3`)
			.get() as { n: number };
		expect(n.n).toBe(3);
	});

	it('needs no open week, and spends no nomination slot', () => {
		const { db } = freshDb();
		ensureWeek(db, 3);
		db.prepare(`UPDATE week SET status = 'closed'`).run();

		const id = addArchivalFilm(db, archival({ watched: true }));
		expect(filmById(db, id)).toMatchObject({ archival: 1, status: 'watched', watched_week: 3 });
		expect(db.prepare('SELECT winner_film_id FROM week WHERE number = 3').get()).toEqual({
			winner_film_id: id
		});
	});

	it('refuses a night that already has a winner, leaving no row behind', () => {
		const { db, rules } = freshDb();
		ensureWeek(db, 3);
		const first = addFilm(db, 'Solaris', 'bartek', 3);
		markWatched(db, rules, first, 3, 1);

		expect(() => addArchivalFilm(db, archival({ watched: true, week: 3 }))).toThrowError(
			expect.objectContaining({ code: 'week_has_winner' })
		);
		expect((db.prepare('SELECT COUNT(*) AS n FROM film').get() as { n: number }).n).toBe(1);
	});

	it('warns on a film already written down, and yields when told to', () => {
		const { db } = freshDb();
		ensureWeek(db, 3);
		ensureWeek(db, 9);
		addArchivalFilm(db, archival({ week: 3 }));

		expect(() => addArchivalFilm(db, archival({ week: 9 }))).toThrowError(
			expect.objectContaining({ code: 'dup_archival' })
		);
		// the same film genuinely comes up at more than one night
		const id = addArchivalFilm(db, archival({ week: 9, allowDuplicate: true }));
		expect(filmById(db, id)).toMatchObject({ added_week: 9 });
	});
});

describe('what an archival row is kept out of', () => {
	it('stays off the list, out of attrition and away from the ballot', () => {
		const { db, rules } = freshDb();
		ensureWeek(db, 1);
		const id = addArchivalFilm(db, archival({ week: 1, watched: false }));

		expect(standings(db, rules, 1, 'ala').map((f) => f.id)).not.toContain(id);

		applyAttrition(db, rules, 20);
		expect(filmById(db, id)).toMatchObject({ status: 'active', archival: 1 });

		expect(() => setPoints(db, rules, 'ala', id, 1)).toThrowError(
			expect.objectContaining({ code: 'film_archival' })
		);
	});
});

describe('correcting who suggested it and when', () => {
	it('moves a watched film to another night, taking the winner slot with it', () => {
		const { db, rules } = freshDb();
		ensureWeek(db, 4);
		ensureWeek(db, 5);
		const id = addFilm(db, 'Stalker', 'ala', 4);
		markWatched(db, rules, id, 4, 1);

		setFilmAttribution(db, id, 'bartek', 5);

		expect(filmById(db, id)).toMatchObject({ added_by: 'bartek', watched_week: 5, added_week: 5 });
		expect(db.prepare('SELECT winner_film_id FROM week WHERE number = 4').get()).toEqual({
			winner_film_id: null
		});
		expect(db.prepare('SELECT winner_film_id FROM week WHERE number = 5').get()).toEqual({
			winner_film_id: id
		});
	});

	it('refuses to move onto a night that is taken', () => {
		const { db, rules } = freshDb();
		ensureWeek(db, 4);
		ensureWeek(db, 5);
		const moving = addFilm(db, 'Stalker', 'ala', 4);
		const sitting = addFilm(db, 'Solaris', 'bartek', 5);
		markWatched(db, rules, moving, 4, 1);
		markWatched(db, rules, sitting, 5, 1);

		expect(() => setFilmAttribution(db, moving, 'ala', 5)).toThrowError(
			expect.objectContaining({ code: 'week_has_winner' })
		);
		expect(filmById(db, moving)).toMatchObject({ watched_week: 4 });
	});

	it('credits two of one night to the same person', () => {
		const { db, rules } = freshDb();
		ensureWeek(db, 6);
		const winner = addFilm(db, 'Stalker', 'ala', 6);
		markWatched(db, rules, winner, 6, 1);
		const alsoRan = addArchivalFilm(db, archival({ title: 'Solaris', tmdbId: 393, week: 6 }));

		// what the old whole-table index made impossible
		setFilmAttribution(db, winner, 'celina', 6);
		setFilmAttribution(db, alsoRan, 'celina', 6);

		expect(filmById(db, winner)).toMatchObject({ added_by: 'celina' });
		expect(filmById(db, alsoRan)).toMatchObject({ added_by: 'celina' });
	});

	it('keeps the round a live nomination was put up in', () => {
		const { db, rules } = freshDb();
		ensureWeek(db, 7);
		ensureWeek(db, 8);
		ensureWeek(db, 9);
		const id = addFilm(db, 'Stalker', 'ala', 7);
		markWatched(db, rules, id, 8, 1);

		// nominated in 7, won in 8: moving the night to 9 must not rewrite when it
		// went up, unlike a backfilled row where the two weeks agree and travel together
		setFilmAttribution(db, id, 'bartek', 9);
		expect(filmById(db, id)).toMatchObject({ added_week: 7, watched_week: 9 });
	});

	it('still refuses two live nominations from one person in one round', () => {
		const { db } = freshDb();
		addFilm(db, 'Solaris', 'ala', 1);
		const mine = addFilm(db, 'Stalker', 'bartek', 1);

		expect(() => setFilmAttribution(db, mine, 'ala', 1)).toThrowError(
			expect.objectContaining({ code: 'nomination_clash' })
		);
	});

	it('reassignFilm keeps working on the night the film already sits in', () => {
		const { db, rules } = freshDb();
		ensureWeek(db, 4);
		const id = addFilm(db, 'Stalker', 'ala', 4);
		markWatched(db, rules, id, 4, 1);

		reassignFilm(db, id, 'darek');
		const film = filmById(db, id)!;
		expect(film).toMatchObject({ added_by: 'darek', watched_week: 4 });
		expect(nightOf(film)).toBe(4);
	});
});

describe('marking a film watched', () => {
	it('will not quietly take a night off the film that holds it', () => {
		const { db, rules } = freshDb();
		ensureWeek(db, 2);
		const first = addFilm(db, 'Stalker', 'ala', 2);
		const second = addFilm(db, 'Solaris', 'bartek', 2);
		markWatched(db, rules, first, 2, 1);

		expect(() => markWatched(db, rules, second, 2, 1)).toThrowError(RuleError);
		expect(db.prepare('SELECT winner_film_id FROM week WHERE number = 2').get()).toEqual({
			winner_film_id: first
		});
	});

	it('releases the night it used to hold when moved to another', () => {
		const { db, rules } = freshDb();
		ensureWeek(db, 2);
		ensureWeek(db, 3);
		const id = addFilm(db, 'Stalker', 'ala', 2);
		markWatched(db, rules, id, 2, 1);
		markWatched(db, rules, id, 3, 1);

		expect(db.prepare('SELECT winner_film_id FROM week WHERE number = 2').get()).toEqual({
			winner_film_id: null
		});
		expect(db.prepare('SELECT winner_film_id FROM week WHERE number = 3').get()).toEqual({
			winner_film_id: id
		});
	});
});
