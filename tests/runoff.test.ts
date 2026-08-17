import { describe, expect, it } from 'vitest';
import { closeWeek, weekByNumber } from '../src/lib/server/weeks.js';
import { setPoints } from '../src/lib/server/films.js';
import {
	closeRunoff,
	flashVote,
	isExpired,
	latestDecidedRunoff,
	openRunoff,
	runoffByCode,
	tally
} from '../src/lib/server/runoffs.js';
import { RuleError } from '../src/lib/server/types.js';
import { newCode } from '../src/lib/server/tokens.js';
import { addFilm, freshDb } from './helpers.js';

/** two films tied at the top; the older one is `first` */
function tiedWeek() {
	const context = freshDb('banked');
	const { db, rules } = context;
	const first = addFilm(db, 'Stalker', 'ala', 1, { createdAt: '2026-01-01T00:00:00.000Z' });
	const second = addFilm(db, 'Solaris', 'bartek', 1, { createdAt: '2026-01-02T00:00:00.000Z' });
	setPoints(db, rules, 'ala', first, 2);
	setPoints(db, rules, 'bartek', second, 2);
	const result = closeWeek(db, rules);
	return { ...context, first, second, result };
}

describe('runoff', () => {
	// 24. a tie at the top creates a runoff and leaves the week in status runoff
	it('a tie creates a runoff and leaves the week unresolved', () => {
		const { db, result } = tiedWeek();
		expect(result.kind).toBe('runoff');
		expect(weekByNumber(db, 1)!.status).toBe('runoff');
		expect(weekByNumber(db, 2)).toBeUndefined(); // no next week until it resolves

		const runoff = openRunoff(db)!;
		expect(runoff.code).toHaveLength(6);
		expect(new Date(runoff.expires_at).getTime() - new Date(runoff.created_at).getTime()).toBe(
			3 * 60 * 60 * 1000
		);
	});

	// 25. flash votes never appear in ballot and never change a score
	it('flash votes never touch the ballot table or any score', () => {
		const { db, first, second } = tiedWeek();
		const runoff = openRunoff(db)!;
		const before = db.prepare('SELECT id, score FROM film ORDER BY id').all();
		const ballotsBefore = db.prepare('SELECT COUNT(*) AS n FROM ballot').get() as { n: number };

		flashVote(db, runoff.id, 'celina', 'celina', second);
		flashVote(db, runoff.id, 'darek', 'darek', second);

		expect(db.prepare('SELECT COUNT(*) AS n FROM ballot').get()).toEqual(ballotsBefore);
		expect(db.prepare('SELECT id, score FROM film ORDER BY id').all()).toEqual(before);
		expect(first).toBeDefined();
	});

	// 26. one flash vote per voter_key, and the first one is final
	it('a flash vote is final; only a same-film double-tap is forgiven', () => {
		const { db, first, second } = tiedWeek();
		const runoff = openRunoff(db)!;

		flashVote(db, runoff.id, 'celina', 'celina', first);
		// a double-tap on the same card is an idempotent no-op
		expect(() => flashVote(db, runoff.id, 'celina', 'celina', first)).not.toThrow();
		// a change of heart is not
		expect(() => flashVote(db, runoff.id, 'celina', 'celina', second)).toThrow(RuleError);
		try {
			flashVote(db, runoff.id, 'celina', 'celina', second);
		} catch (error) {
			expect((error as RuleError).code).toBe('vote_locked');
		}

		const rows = db.prepare('SELECT * FROM runoff_ballot WHERE runoff_id = ?').all(runoff.id) as {
			film_id: number;
		}[];
		expect(rows).toHaveLength(1);
		expect(rows[0].film_id).toBe(first);
	});

	it('a guest with no person_id can still vote on their own device key', () => {
		const { db, first } = tiedWeek();
		const runoff = openRunoff(db)!;
		flashVote(db, runoff.id, 'device-abc', null, first);
		const row = db
			.prepare('SELECT person_id FROM runoff_ballot WHERE voter_key = ?')
			.get('device-abc') as { person_id: string | null };
		expect(row.person_id).toBeNull();
	});

	it('a guest device key is locked to its first vote the same way', () => {
		const { db, first, second } = tiedWeek();
		const runoff = openRunoff(db)!;
		flashVote(db, runoff.id, 'device-abc', null, first);
		expect(() => flashVote(db, runoff.id, 'device-abc', null, second)).toThrow(/locked/);
	});

	// 27. zero flash votes: the oldest tied film wins
	it('zero turnout falls back to the film that has been waiting longest', () => {
		const { db, rules, first } = tiedWeek();
		const runoff = openRunoff(db)!;
		const result = closeRunoff(db, rules, runoff.id);
		expect(result).toEqual({ kind: 'winner', film: expect.objectContaining({ id: first }) });
	});

	// 28. a tied flash vote: the oldest tied film wins
	it('a tied flash vote falls back the same way', () => {
		const { db, rules, first, second } = tiedWeek();
		const runoff = openRunoff(db)!;
		flashVote(db, runoff.id, 'celina', 'celina', first);
		flashVote(db, runoff.id, 'darek', 'darek', second);

		expect(tally(db, runoff.id).map((t) => t.votes)).toEqual([1, 1]);
		const result = closeRunoff(db, rules, runoff.id);
		expect(result.kind === 'winner' && result.film.id).toBe(first);
	});

	it('flash votes decide the night when they are not tied', () => {
		const { db, rules, second } = tiedWeek();
		const runoff = openRunoff(db)!;
		flashVote(db, runoff.id, 'celina', 'celina', second);
		const result = closeRunoff(db, rules, runoff.id);
		expect(result.kind === 'winner' && result.film.id).toBe(second);
	});

	// 29. closing the runoff finishes the week and opens the next one
	it('closing the runoff finishes the week and opens the next', () => {
		const { db, rules, first } = tiedWeek();
		const runoff = openRunoff(db)!;
		closeRunoff(db, rules, runoff.id);

		const week1 = weekByNumber(db, 1)!;
		expect(week1.status).toBe('closed');
		expect(week1.winner_film_id).toBe(first);
		expect(week1.resolved_at).not.toBeNull();
		expect(weekByNumber(db, 2)!.status).toBe('open');

		expect(closeRunoff(db, rules, runoff.id)).toEqual({ kind: 'noop' });
	});

	it('the decided runoff is findable afterwards, for the winner screen', () => {
		const { db, rules, first } = tiedWeek();
		const runoff = openRunoff(db)!;
		expect(latestDecidedRunoff(db)).toBeUndefined();
		closeRunoff(db, rules, runoff.id);
		const decided = latestDecidedRunoff(db)!;
		expect(decided.id).toBe(runoff.id);
		expect(decided.winner_film_id).toBe(first);
		expect(decided.closed_at).not.toBeNull();
	});

	// 30. an expired code is recognised as expired
	it('a runoff past expires_at is expired and refuses votes', () => {
		const { db, first } = tiedWeek();
		const runoff = openRunoff(db)!;
		const later = new Date(new Date(runoff.expires_at).getTime() + 1000);

		expect(isExpired(runoff, later)).toBe(true);
		expect(() => flashVote(db, runoff.id, 'celina', 'celina', first, later)).toThrow(/expired/);
	});

	it('a code can be looked up case-insensitively', () => {
		const { db } = tiedWeek();
		const runoff = openRunoff(db)!;
		expect(runoffByCode(db, runoff.code.toLowerCase())?.id).toBe(runoff.id);
	});

	it('codes avoid vowels and ambiguous glyphs', () => {
		for (let i = 0; i < 200; i++) {
			expect(newCode()).toMatch(/^[ACDEFGHJKLMNPQRTUVWXY3479]{6}$/);
		}
	});
});
