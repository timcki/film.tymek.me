import { describe, expect, it } from 'vitest';
import { titleKey } from '../src/lib/server/rules.js';
import {
	OVERVIEW_MAX,
	TITLE_MAX,
	droppedShelf,
	filmById,
	nominate,
	renominate
} from '../src/lib/server/films.js';
import { openWeek } from '../src/lib/server/weeks.js';
import { addFilm, ensureWeek, freshDb, nominateAs } from './helpers.js';

describe('nominations', () => {
	// 5. a second nomination in the same week is rejected
	it('rejects a second nomination in the same week', () => {
		const { db, rules } = freshDb('banked');
		nominateAs(db, rules, 'ala', 'Stalker');
		expect(() => nominateAs(db, rules, 'ala', 'Solaris')).toThrow(/already nominated/);
	});

	// 6. the unique index rejects it even if the check is bypassed
	it('the unique index rejects a second nomination even when the check is bypassed', () => {
		const { db } = freshDb('banked');
		addFilm(db, 'Stalker', 'ala', 1);
		expect(() => addFilm(db, 'Solaris', 'ala', 1)).toThrow(/UNIQUE/i);
	});

	// 7. duplicates by tmdb_id and by title_key, including diacritics
	it('rejects a duplicate by tmdb_id', () => {
		const { db, rules } = freshDb('banked');
		nominateAs(db, rules, 'ala', 'Stalker', { tmdbId: 1398 });
		expect(() =>
			nominate(db, rules, 'bartek', { title: 'Stalker (1979)', tmdbId: 1398 })
		).toThrow(/already on the list/);
	});

	it('rejects a duplicate by title_key', () => {
		const { db, rules } = freshDb('banked');
		nominateAs(db, rules, 'ala', 'The Thing');
		expect(() => nominateAs(db, rules, 'bartek', 'Thing')).toThrow(/already on the list/);
	});

	it('Sátántangó and Satantango collide', () => {
		expect(titleKey('Sátántangó')).toBe(titleKey('Satantango'));
		const { db, rules } = freshDb('banked');
		nominateAs(db, rules, 'ala', 'Sátántangó');
		expect(() => nominateAs(db, rules, 'bartek', 'Satantango')).toThrow(/already on the list/);
	});

	it('rejects nominating something already watched, naming the evening', () => {
		const { db, rules } = freshDb('banked');
		const film = addFilm(db, 'Stalker', 'ala', 1);
		ensureWeek(db, 12);
		db.prepare(`UPDATE film SET status = 'watched', watched_week = 12 WHERE id = ?`).run(film);
		openWeek(db, 13, new Date()); // a live week to nominate into
		// the first film anybody watched, however many weeks went by before it
		expect(() => nominateAs(db, rules, 'bartek', 'Stalker')).toThrow(/watched Stalker on night 1/);
	});

	// 8. re-nominating a dropped film succeeds, starts at zero, consumes the slot
	it('re-nominating a dropped film makes a new row at score 0 and uses the slot', () => {
		const { db, rules } = freshDb('banked');
		const old = addFilm(db, 'Stalker', 'ala', 1);
		db.prepare(`UPDATE film SET status = 'dropped', score = 9 WHERE id = ?`).run(old);

		const fresh = renominate(db, rules, 'bartek', old);
		expect(fresh).not.toBe(old);

		const row = filmById(db, fresh)!;
		expect(row.status).toBe('active');
		expect(row.added_by).toBe('bartek');
		expect((row as { score: number }).score).toBe(0);
		expect(filmById(db, old)!.status).toBe('dropped');

		expect(() => nominateAs(db, rules, 'bartek', 'Solaris')).toThrow(/already nominated/);
	});

	it('takes a dropped film off the shelf once it is back as another row, watched or not', () => {
		const { db, rules } = freshDb('banked');
		const old = addFilm(db, 'Stalker', 'ala', 1);
		addFilm(db, 'Solaris', 'celina', 1);
		db.prepare(`UPDATE film SET status = 'dropped' WHERE id IN (?, ?)`).run(old, old + 1);
		const shelf = () => droppedShelf(db).map((film) => film.title);
		expect(shelf()).toEqual(['Stalker', 'Solaris']);

		const fresh = renominate(db, rules, 'bartek', old);
		expect(shelf()).toEqual(['Solaris']);
		db.prepare(`UPDATE film SET status = 'watched', watched_week = 1 WHERE id = ?`).run(fresh);
		expect(shelf()).toEqual(['Solaris']);
	});

	it('a dropped film does not block a fresh nomination of the same title', () => {
		const { db, rules } = freshDb('banked');
		const old = addFilm(db, 'Stalker', 'ala', 1);
		db.prepare(`UPDATE film SET status = 'dropped' WHERE id = ?`).run(old);
		expect(() => nominateAs(db, rules, 'bartek', 'Stalker')).not.toThrow();
	});
});

describe('what a nomination may carry', () => {
	// the demo is a public door onto this action, so these fields stopped being
	// whatever the TMDB picker happened to send and became what the row will take
	it('takes a poster from TMDB', () => {
		const { db, rules } = freshDb('banked');
		const id = nominate(db, rules, 'ala', {
			title: 'Stalker',
			posterUrl: 'https://image.tmdb.org/t/p/w342/abc.jpg'
		});
		expect(filmById(db, id)?.poster_url).toBe('https://image.tmdb.org/t/p/w342/abc.jpg');
	});

	it('refuses a poster hosted anywhere else, which the browser would go and fetch', () => {
		const { db, rules } = freshDb('banked');
		expect(() =>
			nominate(db, rules, 'ala', {
				title: 'Stalker',
				posterUrl: 'http://attacker.example/tracker.gif'
			})
		).toThrow(/TMDB/);
	});

	it('refuses a poster that only starts like one', () => {
		const { db, rules } = freshDb('banked');
		expect(() =>
			nominate(db, rules, 'ala', {
				title: 'Stalker',
				posterUrl: 'https://image.tmdb.org.attacker.example/t/p/w342/abc.jpg'
			})
		).toThrow(/TMDB/);
	});

	it('keeps no poster as no poster', () => {
		const { db, rules } = freshDb('banked');
		const id = nominate(db, rules, 'ala', { title: 'Stalker', posterUrl: '  ' });
		expect(filmById(db, id)?.poster_url).toBeNull();
	});

	it('refuses a title longer than the column was ever meant to hold', () => {
		const { db, rules } = freshDb('banked');
		expect(() =>
			nominate(db, rules, 'ala', { title: 'x'.repeat(TITLE_MAX + 1) })
		).toThrow(/under 200/);
	});

	it('refuses a summary longer than the column was ever meant to hold', () => {
		const { db, rules } = freshDb('banked');
		expect(() =>
			nominate(db, rules, 'ala', { title: 'Stalker', overview: 'x'.repeat(OVERVIEW_MAX + 1) })
		).toThrow(/under 2000/);
	});

	it('still refuses a blank title, by the same route as before', () => {
		const { db, rules } = freshDb('banked');
		expect(() => nominate(db, rules, 'ala', { title: '   ' })).toThrow(/give the film a title/);
	});
});
