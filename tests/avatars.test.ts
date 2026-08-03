import { describe, expect, it } from 'vitest';
import { avatarOf, avatarUrl, clearAvatar, setAvatar } from '../src/lib/server/people.js';
import { RuleError } from '../src/lib/server/types.js';
import { freshDb } from './helpers.js';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
const WEBP = new Uint8Array([
	0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1
]);

/**
 * Profile pictures are judged on their bytes, never on the content type the
 * browser claimed: the part header is attacker-controlled and the route serves
 * whatever mime it recorded.
 */
describe('profile pictures', () => {
	it('accepts the three formats a phone actually produces', () => {
		const { db } = freshDb();
		for (const [bytes, mime] of [
			[JPEG, 'image/jpeg'],
			[PNG, 'image/png'],
			[WEBP, 'image/webp']
		] as const) {
			setAvatar(db, 'ala', bytes);
			expect(avatarOf(db, 'ala')!.mime).toBe(mime);
		}
	});

	it('sniffs the bytes rather than trusting the extension', () => {
		const { db } = freshDb();
		const html = new TextEncoder().encode('<script>alert(1)</script>');
		expect(() => setAvatar(db, 'ala', html)).toThrow(RuleError);
		expect(avatarOf(db, 'ala')).toBeUndefined();
	});

	it('refuses an empty file and one over 2 MB', () => {
		const { db } = freshDb();
		expect(() => setAvatar(db, 'ala', new Uint8Array())).toThrow(RuleError);

		const huge = new Uint8Array(2 * 1024 * 1024 + 1);
		huge.set(JPEG, 0);
		expect(() => setAvatar(db, 'ala', huge)).toThrow(RuleError);
	});

	it('round-trips the bytes it stored', () => {
		const { db } = freshDb();
		setAvatar(db, 'ala', PNG);
		expect([...avatarOf(db, 'ala')!.bytes]).toEqual([...PNG]);
	});

	it('forgets everything when a picture is removed', () => {
		const { db } = freshDb();
		setAvatar(db, 'ala', PNG);
		clearAvatar(db, 'ala');
		expect(avatarOf(db, 'ala')).toBeUndefined();
		const row = db.prepare('SELECT avatar, avatar_mime FROM person WHERE id = ?').get('ala');
		expect(row).toEqual({ avatar: null, avatar_mime: null });
	});

	it('changes the URL when the picture changes, so caches cannot stick', () => {
		const first = avatarUrl('ala', '2026-08-03T10:00:00.000Z');
		const second = avatarUrl('ala', '2026-08-04T10:00:00.000Z');
		expect(first).not.toBe(second);
		expect(avatarUrl('ala', null)).toBeNull();
	});
});
