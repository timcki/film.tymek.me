import { describe, expect, it } from 'vitest';
import { cleanNote, filmById, NOTE_MAX, renominate, setNote } from '../src/lib/server/films.js';
import { RuleError } from '../src/lib/server/types.js';
import { freshDb, nominateAs } from './helpers.js';

/** §9: the pitch belongs to the person who nominated the film, and to nobody else */
describe('nomination notes', () => {
	it('stores the note given at nomination time', () => {
		const { db, rules } = freshDb('banked');
		const id = nominateAs(db, rules, 'ala', 'Stalker', { note: '  Trzeci  tydzień z rzędu.  ' });
		expect(filmById(db, id)!.note).toBe('Trzeci tydzień z rzędu.');
	});

	it('treats a blank note as no note at all', () => {
		const { db, rules } = freshDb('banked');
		const id = nominateAs(db, rules, 'ala', 'Stalker', { note: '   ' });
		expect(filmById(db, id)!.note).toBeNull();
	});

	it('lets the nominator edit and clear it later', () => {
		const { db, rules } = freshDb('banked');
		const id = nominateAs(db, rules, 'ala', 'Stalker');
		setNote(db, 'ala', id, 'Zobaczcie chociaż scenę z mostem.');
		expect(filmById(db, id)!.note).toBe('Zobaczcie chociaż scenę z mostem.');
		setNote(db, 'ala', id, '');
		expect(filmById(db, id)!.note).toBeNull();
	});

	it('refuses to let anyone else rewrite the pitch', () => {
		const { db, rules } = freshDb('banked');
		const id = nominateAs(db, rules, 'ala', 'Stalker', { note: 'mine' });
		expect(() => setNote(db, 'bartek', id, 'not any more')).toThrow(RuleError);
		expect(filmById(db, id)!.note).toBe('mine');
	});

	it('rejects a note longer than the limit', () => {
		expect(() => cleanNote('x'.repeat(NOTE_MAX + 1))).toThrow(RuleError);
		expect(cleanNote('x'.repeat(NOTE_MAX))).toHaveLength(NOTE_MAX);
	});

	it('carries the pitch over when a dropped film is re-nominated', () => {
		const { db, rules } = freshDb('banked');
		const id = nominateAs(db, rules, 'ala', 'Stalker', { note: 'worth another go' });
		db.prepare(`UPDATE film SET status = 'dropped' WHERE id = ?`).run(id);

		const fresh = renominate(db, rules, 'bartek', id);
		expect(filmById(db, fresh)!.note).toBe('worth another go');
		// it is a new row starting from zero, now belonging to whoever revived it
		expect(fresh).not.toBe(id);
		expect(filmById(db, fresh)!.added_by).toBe('bartek');
	});
});
