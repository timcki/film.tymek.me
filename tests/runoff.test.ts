import { describe, expect, it } from 'vitest';
import { closeWeek, weekByNumber } from '../src/lib/server/weeks.js';
import { setPoints } from '../src/lib/server/films.js';
import {
	closeRunoff,
	flashVote as rankVote,
	isExpired,
	latestDecidedRunoff,
	openRunoff,
	runoffByCode,
	runoffFilms,
	publicTally,
	revealedRankings,
	myRanking,
	turnout,
	tally
} from '../src/lib/server/runoffs.js';
import { applySchema, type DB } from '../src/lib/server/db.js';
import { RuleError } from '../src/lib/server/types.js';
import { newCode } from '../src/lib/server/tokens.js';
import { addFilm, freshDb, rankedRoom } from './helpers.js';

/** the original two-film scenarios have only one possible backup preference. */
function flashVote(db: DB, id: number, key: string, person: string | null, first: number, now?: Date) {
	const films = runoffFilms(db, id);
	expect(films).toHaveLength(2);
	rankVote(db, id, key, person, [first, ...films.filter((f) => f.id !== first).map((f) => f.id)], now);
}

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

	// 26. one flash vote per voter_key, and voting again moves it
	it('a flash vote moves rather than piling up a second row', () => {
		const { db, first, second } = tiedWeek();
		const runoff = openRunoff(db)!;

		flashVote(db, runoff.id, 'celina', 'celina', first);
		// a double-tap on the same card is an idempotent no-op
		flashVote(db, runoff.id, 'celina', 'celina', first);
		// and a change of heart is allowed right up to the close
		flashVote(db, runoff.id, 'celina', 'celina', second);

		const rows = db.prepare('SELECT * FROM runoff_ballot WHERE runoff_id = ?').all(runoff.id) as {
			film_id: number;
		}[];
		expect(rows).toHaveLength(1);
		expect(rows[0].film_id).toBe(second);
		// the tally follows the move, it does not count the abandoned film
		expect(tally(db, runoff.id).find((t) => t.film.id === first)!.votes).toBe(0);
	});

	it('a moved flash vote is still refused once the room is decided', () => {
		const { db, rules, first, second } = tiedWeek();
		const runoff = openRunoff(db)!;
		flashVote(db, runoff.id, 'celina', 'celina', first);
		closeRunoff(db, rules, runoff.id);

		expect(() => flashVote(db, runoff.id, 'celina', 'celina', second)).toThrow(RuleError);
		try {
			flashVote(db, runoff.id, 'celina', 'celina', second);
		} catch (error) {
			expect((error as RuleError).code).toBe('runoff_decided');
		}
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

	it('a guest device key can change its mind the same way', () => {
		const { db, first, second } = tiedWeek();
		const runoff = openRunoff(db)!;
		flashVote(db, runoff.id, 'device-abc', null, first);
		flashVote(db, runoff.id, 'device-abc', null, second);
		const rows = db
			.prepare('SELECT film_id, person_id FROM runoff_ballot WHERE voter_key = ?')
			.all('device-abc') as { film_id: number; person_id: string | null }[];
		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({ film_id: second, person_id: null });
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

	// §7.2: the whole point of a movable vote is that the last word counts
	it('a room that talks itself round decides on the last word', () => {
		const { db, rules, first, second } = tiedWeek();
		const runoff = openRunoff(db)!;
		flashVote(db, runoff.id, 'celina', 'celina', second);
		flashVote(db, runoff.id, 'darek', 'darek', second);
		expect(tally(db, runoff.id)[0].film.id).toBe(second);

		flashVote(db, runoff.id, 'celina', 'celina', first);
		flashVote(db, runoff.id, 'darek', 'darek', first);
		const result = closeRunoff(db, rules, runoff.id);
		expect(result.kind === 'winner' && result.film.id).toBe(first);
	});

	// a move still checks its owner in; attendance is not undone by a change of heart
	it('moving a vote leaves the attendance row alone', () => {
		const { db, first, second } = tiedWeek();
		const runoff = openRunoff(db)!;
		flashVote(db, runoff.id, 'celina', 'celina', first);
		flashVote(db, runoff.id, 'celina', 'celina', second);
		const rows = db
			.prepare('SELECT COUNT(*) AS n FROM attendance WHERE week_number = ? AND person_id = ?')
			.get(runoff.week_number, 'celina') as { n: number };
		expect(rows.n).toBe(1);
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


describe('private rankings', () => {
	it('reveals final named rankings only after close, without device keys or invented legacy preferences', () => {
		const { db, rules, runoff, films: [a, b, c] } = rankedRoom();
		db.prepare("UPDATE person SET avatar_updated_at = '2026-08-03T10:00:00Z' WHERE id = 'ala'").run();
		rankVote(db, runoff.id, 'ala', 'ala', [a, b, c]);
		rankVote(db, runoff.id, 'ala', 'ala', [c, a, b]);
		rankVote(db, runoff.id, 'private-device-key', null, [b, c, a]);
		db.prepare('INSERT INTO runoff_ballot (runoff_id, voter_key, person_id, film_id, created_at) VALUES (?, ?, ?, ?, ?)')
			.run(runoff.id, 'bartek', 'bartek', a, runoff.created_at);
		expect(revealedRankings(db, runoff.id)).toEqual([]);
		// expiry alone does not publish ballots; closing the room does
		db.prepare('UPDATE runoff SET expires_at = ? WHERE id = ?').run(runoff.created_at, runoff.id);
		expect(revealedRankings(db, runoff.id)).toEqual([]);
		closeRunoff(db, rules, runoff.id);
		db.prepare("UPDATE person SET xp = CASE id WHEN 'ala' THEN 123 ELSE 0 END").run();
		expect(revealedRankings(db, runoff.id)).toEqual([
			{ name: 'ala', colour: '#fff', xp: 123, avatar: '/avatar/ala?v=1785751200000', ranking: [c, a, b], legacy: false },
			{ name: 'bartek', colour: '#fff', xp: 0, avatar: null, ranking: [a], legacy: true },
			{ name: null, colour: null, xp: null, avatar: null, ranking: [b, c, a], legacy: false }
		]);
		expect(revealedRankings(db, runoff.id + 1)).toEqual([]);
	});

	it('selects the compromise over the plurality leader', () => {
		const { db, rules, runoff, films: [a, b, c], cast } = rankedRoom();
		cast([a, b, c], 4);
		cast([c, b, a], 3);
		cast([b, c, a], 3);
		const rows = tally(db, runoff.id);
		expect(rows.map((r) => [r.film.id, r.votes, r.points])).toEqual([[b, 3, 13], [c, 3, 9], [a, 4, 8]]);
		expect(rows[0].comparisons).toEqual([
			{ filmId: a, preferred: 6, opposed: 4 },
			{ filmId: c, preferred: 7, opposed: 3 }
		]);
		expect(closeRunoff(db, rules, runoff.id)).toMatchObject({ kind: 'winner', film: { id: b } });
	});

	it('gives a pairwise winner priority even when another film has more ranked points', () => {
		const { db, runoff, films: [a, b, c], cast } = rankedRoom();
		cast([a, b, c], 3);
		cast([b, c, a], 2);
		const rows = tally(db, runoff.id);
		expect(rows.map((r) => [r.film.id, r.points, r.beatsAll])).toEqual([
			[a, 6, true], [b, 7, false], [c, 2, false]
		]);
	});

	it('resolves a strict majority cycle with ranked points', () => {
		const { db, runoff, films: [a, b, c], cast } = rankedRoom();
		cast([a, b, c], 3);
		cast([b, c, a], 4);
		cast([c, a, b], 2);
		const rows = tally(db, runoff.id);
		expect(rows.every((r) => !r.beatsAll)).toBe(true);
		expect(rows.map((r) => [r.film.id, r.points])).toEqual([[b, 11], [a, 8], [c, 8]]);
	});

	it('does not treat a tied comparison as a pairwise win', () => {
		const { db, runoff, films: [a, b, c], cast } = rankedRoom();
		cast([a, b, c]);
		cast([b, c, a]);
		const rows = tally(db, runoff.id);
		expect(rows.some((r) => r.beatsAll)).toBe(false);
		expect(rows.map((r) => [r.film.id, r.points])).toEqual([[b, 3], [a, 2], [c, 1]]);
	});

	it('uses weekly score before age when a cycle also ties on ranked points', () => {
		const { db, rules, runoff, films: [a, b, c], cast } = rankedRoom();
		db.prepare('UPDATE film SET score = 5 WHERE id = ?').run(c);
		cast([a, b, c]);
		cast([b, c, a]);
		cast([c, a, b]);
		expect(tally(db, runoff.id).map((r) => r.points)).toEqual([3, 3, 3]);
		expect(closeRunoff(db, rules, runoff.id)).toMatchObject({ film: { id: c } });
		// finish recomputes weekly scores, but must not change the published winner
		expect(publicTally(db, runoffByCode(db, runoff.code)!)[0].film.id).toBe(c);
	});

	it('keeps totals, comparisons and result order private until close', () => {
		const { db, rules, runoff, films: [a, b, c], cast } = rankedRoom();
		const before = publicTally(db, runoff);
		cast([c, b, a], 2);
		expect(publicTally(db, runoff)).toEqual(before);
		expect(before.map((r) => [r.film.id, r.votes, r.points, r.beatsAll, r.comparisons])).toEqual([
			[a, null, null, null, null], [b, null, null, null, null], [c, null, null, null, null]
		]);
		expect(turnout(db, runoff.id)).toBe(2);
		expect(myRanking(db, runoff.id, 'guest-0')).toEqual([c, b, a]);
		expect(myRanking(db, runoff.id, 'another-device')).toEqual([]);
		closeRunoff(db, rules, runoff.id);
		expect(publicTally(db, runoffByCode(db, runoff.code)!)[0]).toMatchObject({
			film: { id: c }, points: 4, votes: 2, beatsAll: true
		});
	});

	it('replaces lower preferences even when the first choice is unchanged', () => {
		const { db, runoff, films: [a, b, c] } = rankedRoom();
		rankVote(db, runoff.id, 'ala', 'ala', [a, b, c]);
		rankVote(db, runoff.id, 'ala', 'ala', [a, c, b]);
		expect(myRanking(db, runoff.id, 'ala')).toEqual([a, c, b]);
		expect(turnout(db, runoff.id)).toBe(1);
		expect(tally(db, runoff.id).map((r) => [r.film.id, r.points])).toEqual([[a, 2], [c, 1], [b, 0]]);
	});

	it('rejects missing, duplicated, foreign and noninteger films without replacing a saved ballot', () => {
		const { db, runoff, films: [a, b, c] } = rankedRoom();
		rankVote(db, runoff.id, 'ala', 'ala', [c, b, a]);
		for (const ranking of [[], [a], [a, b], [a, a, c], [a, b, 9999], [a, b, NaN], [a, b, c + 0.5], [a, b, c, c]]) {
			expect(() => rankVote(db, runoff.id, 'ala', 'ala', ranking)).toThrow('rank every shortlisted film exactly once');
			expect(myRanking(db, runoff.id, 'ala')).toEqual([c, b, a]);
		}
	});

	it('preserves old first-choice ballots through an idempotent column migration', () => {
		const { db, runoff, films: [a, b, c], cast } = rankedRoom();
		db.exec('ALTER TABLE runoff_ballot DROP COLUMN ranking');
		db.prepare('INSERT INTO runoff_ballot (runoff_id, voter_key, film_id, created_at) VALUES (?, ?, ?, ?)')
			.run(runoff.id, 'legacy', c, runoff.created_at);
		applySchema(db);
		applySchema(db);
		expect(myRanking(db, runoff.id, 'legacy')).toEqual([c]);
		expect(tally(db, runoff.id).map((r) => [r.film.id, r.votes, r.points])).toEqual([[c, 1, 2], [a, 0, 0], [b, 0, 0]]);
		cast([b, a, c]);
		expect(tally(db, runoff.id).find((r) => r.film.id === b)!.comparisons)
			.toContainEqual({ filmId: a, preferred: 1, opposed: 0 });
		rankVote(db, runoff.id, 'legacy', null, [c, a, b]);
		expect(turnout(db, runoff.id)).toBe(2);
		expect(myRanking(db, runoff.id, 'legacy')).toEqual([c, a, b]);
	});

	it('accepts a lone candidate and rejects a ranking exactly at expiry', () => {
		const { db, rules } = freshDb();
		const a = addFilm(db, 'Only', 'ala', 1);
		setPoints(db, rules, 'ala', a, 1);
		closeWeek(db, rules);
		const runoff = openRunoff(db)!;
		rankVote(db, runoff.id, 'ala', 'ala', [a]);
		expect(tally(db, runoff.id)[0]).toMatchObject({ film: { id: a }, votes: 1, points: 0 });
		expect(() => rankVote(db, runoff.id, 'guest', null, [a], new Date(runoff.expires_at))).toThrow('expired');
	});
});
