import { describe, expect, it } from 'vitest';
import { titleKey } from '../src/lib/server/rules.js';
import { filmById, nominate, renominate } from '../src/lib/server/films.js';
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

	it('rejects nominating something already watched, naming the week', () => {
		const { db, rules } = freshDb('banked');
		const film = addFilm(db, 'Stalker', 'ala', 1);
		ensureWeek(db, 12);
		db.prepare(`UPDATE film SET status = 'watched', watched_week = 12 WHERE id = ?`).run(film);
		openWeek(db, 13, new Date()); // a live week to nominate into
		expect(() => nominateAs(db, rules, 'bartek', 'Stalker')).toThrow(/watched Stalker in week 12/);
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

	it('a dropped film does not block a fresh nomination of the same title', () => {
		const { db, rules } = freshDb('banked');
		const old = addFilm(db, 'Stalker', 'ala', 1);
		db.prepare(`UPDATE film SET status = 'dropped' WHERE id = ?`).run(old);
		expect(() => nominateAs(db, rules, 'bartek', 'Stalker')).not.toThrow();
	});
});
