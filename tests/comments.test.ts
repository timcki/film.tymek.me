import { describe, expect, it } from 'vitest';
import {
	addComment,
	cleanComment,
	COMMENT_MAX,
	commentsOf,
	reactComment
} from '../src/lib/server/comments.js';
import { RuleError } from '../src/lib/server/types.js';
import { freshDb, nominateAs } from './helpers.js';

/** anyone's two cents on a suggestion; permanent, unlike the nominator's note */
describe('film comments', () => {
	it('stores a trimmed, whitespace-collapsed body', () => {
		const { db, rules } = freshDb('banked');
		const id = nominateAs(db, rules, 'ala', 'Stalker');
		addComment(db, 'bartek', id, '  strefa  czeka.  ');
		expect(commentsOf(db, [id]).get(id)![0].body).toBe('strefa czeka.');
	});

	it('rejects a blank comment instead of treating it as a deletion', () => {
		const { db, rules } = freshDb('banked');
		const id = nominateAs(db, rules, 'ala', 'Stalker');
		expect(() => addComment(db, 'bartek', id, '   ')).toThrow(RuleError);
		try {
			addComment(db, 'bartek', id, '');
		} catch (error) {
			expect((error as RuleError).code).toBe('empty_comment');
		}
	});

	it('caps the length and accepts exactly the cap', () => {
		expect(() => cleanComment('x'.repeat(COMMENT_MAX + 1))).toThrow(RuleError);
		expect(cleanComment('x'.repeat(COMMENT_MAX))).toHaveLength(COMMENT_MAX);
	});

	it('lets anyone comment, not just the nominator', () => {
		const { db, rules } = freshDb('banked');
		const id = nominateAs(db, rules, 'ala', 'Stalker');
		addComment(db, 'ala', id, 'my own pick');
		addComment(db, 'bartek', id, 'seconded');
		expect(commentsOf(db, [id]).get(id)).toHaveLength(2);
	});

	it('refuses a comment on a film that does not exist', () => {
		const { db } = freshDb('banked');
		expect(() => addComment(db, 'ala', 999, 'into the void')).toThrow(/no such film/);
	});

	it('batches several films into a map, oldest first, with the author attached', () => {
		const { db, rules } = freshDb('banked');
		const stalker = nominateAs(db, rules, 'ala', 'Stalker');
		const solaris = nominateAs(db, rules, 'bartek', 'Solaris');
		addComment(db, 'celina', stalker, 'first', new Date('2026-08-03T11:00:00Z'));
		addComment(db, 'darek', stalker, 'second', new Date('2026-08-03T12:00:00Z'));
		addComment(db, 'ewa', solaris, 'the ocean dreams', new Date('2026-08-03T13:00:00Z'));

		const byFilm = commentsOf(db, [stalker, solaris]);
		expect(byFilm.get(stalker)!.map((c) => c.body)).toEqual(['first', 'second']);
		const solarisComment = byFilm.get(solaris)![0];
		expect(solarisComment.name).toBe('ewa');
		expect(solarisComment.colour).toBe('#fff');
		expect(solarisComment.xp).toBe(0);
		expect(solarisComment.avatar).toBeNull();
	});

	it('returns an empty map for no films without a malformed query', () => {
		const { db } = freshDb('banked');
		expect(commentsOf(db, []).size).toBe(0);
	});
});

/** a reaction is a mood, not a statement: toggleable, several feelings at once */
describe('comment reactions', () => {
	it('groups reactions by emoji with everyone who felt it, in arrival order', () => {
		const { db, rules } = freshDb('banked');
		const film = nominateAs(db, rules, 'ala', 'Stalker');
		const comment = addComment(db, 'ala', film, 'the zone waits');
		reactComment(db, 'bartek', comment, '🍿', new Date('2026-08-03T11:00:00Z'));
		reactComment(db, 'celina', comment, '🍿', new Date('2026-08-03T12:00:00Z'));
		reactComment(db, 'darek', comment, '💀', new Date('2026-08-03T13:00:00Z'));

		const reacts = commentsOf(db, [film]).get(film)![0].reacts;
		expect(reacts.map((r) => r.emoji)).toEqual(['🍿', '💀']);
		expect(reacts[0].people.map((p) => p.name)).toEqual(['bartek', 'celina']);
		expect(reacts[0].people[0].colour).toBe('#fff');
	});

	it('toggles: the same emoji again takes the feeling back', () => {
		const { db, rules } = freshDb('banked');
		const film = nominateAs(db, rules, 'ala', 'Stalker');
		const comment = addComment(db, 'ala', film, 'the zone waits');
		reactComment(db, 'bartek', comment, '😂');
		expect(commentsOf(db, [film]).get(film)![0].reacts).toHaveLength(1);
		reactComment(db, 'bartek', comment, '😂');
		expect(commentsOf(db, [film]).get(film)![0].reacts).toHaveLength(0);
	});

	it('allows several feelings from one person and marks the viewer among them', () => {
		const { db, rules } = freshDb('banked');
		const film = nominateAs(db, rules, 'ala', 'Stalker');
		const comment = addComment(db, 'ala', film, 'the zone waits');
		reactComment(db, 'bartek', comment, '👍');
		reactComment(db, 'bartek', comment, '💀');

		const asBartek = commentsOf(db, [film], 'bartek').get(film)![0].reacts;
		expect(asBartek).toHaveLength(2);
		expect(asBartek.every((r) => r.mine)).toBe(true);
		const asCelina = commentsOf(db, [film], 'celina').get(film)![0].reacts;
		expect(asCelina.every((r) => r.mine)).toBe(false);
	});

	it('refuses feelings off the menu and comments that do not exist', () => {
		const { db, rules } = freshDb('banked');
		const film = nominateAs(db, rules, 'ala', 'Stalker');
		const comment = addComment(db, 'ala', film, 'the zone waits');
		expect(() => reactComment(db, 'bartek', comment, '🦑')).toThrow(RuleError);
		expect(() => reactComment(db, 'bartek', 999, '👍')).toThrow(/no such comment/);
	});
});
