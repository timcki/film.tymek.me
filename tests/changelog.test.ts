import { describe, expect, it } from 'vitest';
import { CHANGELOG, latestChangelogId, unseenChangelog } from '../src/lib/changelog.js';
import { LANGS } from '../src/lib/i18n.js';

describe('the changelog', () => {
	it('speaks both languages in every entry', () => {
		for (const entry of CHANGELOG) {
			for (const lang of LANGS) {
				expect(entry.title[lang]).toBeTruthy();
				expect(entry.body[lang].length).toBeGreaterThan(0);
			}
			// the two versions say the same number of things
			expect(entry.body.pl.length).toBe(entry.body.en.length);
		}
	});

	it('never reuses an id', () => {
		const ids = CHANGELOG.map((entry) => entry.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('shows each entry exactly once', () => {
		// a fresh person has seen nothing
		expect(unseenChangelog(0).map((entry) => entry.id)).toContain(latestChangelogId());
		// dismissing records the newest id, after which nothing is unseen
		expect(unseenChangelog(latestChangelogId())).toEqual([]);
	});
});
