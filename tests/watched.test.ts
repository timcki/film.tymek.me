import { describe, expect, it } from 'vitest';
import { moveWatched, reassignFilm, recordWatched, type RecordedFilm } from '../src/lib/server/manage.js';
import { filmEvenings, roundEvenings } from '../src/lib/server/evenings.js';
import { filmById, setPoints, standings } from '../src/lib/server/films.js';
import { applyAttrition } from '../src/lib/server/weeks.js';
import { personById } from '../src/lib/server/people.js';
import { watchedFilms, whoseNights } from '../src/lib/server/stats.js';
import { addFilm, freshDb } from './helpers.js';

/**
 * A film we watched together that no round decided gets written down with a
 * date, never a week. Four rounds ending on the Thursdays of July into August,
 * the last still open: the clock is pinned to Monday 3 August.
 */
const NIGHTS = [
	'2026-07-16T18:00:00.000Z',
	'2026-07-23T18:00:00.000Z',
	'2026-07-30T18:00:00.000Z',
	'2026-08-06T18:00:00.000Z'
];

function fourRounds() {
	const { db, rules } = freshDb('weekly');
	db.prepare(`UPDATE week SET opens_at = ?, closes_at = ?, status = 'closed' WHERE number = 1`).run(
		'2026-07-09T18:00:00.000Z',
		NIGHTS[0]
	);
	for (const [i, closes] of NIGHTS.slice(1).entries()) {
		db.prepare('INSERT INTO week (number, opens_at, closes_at, status) VALUES (?, ?, ?, ?)').run(
			i + 2,
			NIGHTS[i],
			closes,
			i + 2 === 4 ? 'open' : 'closed'
		);
	}
	return { db, rules };
}

const film = (over: Partial<RecordedFilm> = {}): RecordedFilm => ({
	title: 'Stalker',
	year: 1979,
	director: null,
	genre: null,
	runtime: null,
	tmdbId: 1398,
	posterUrl: null,
	overview: null,
	personId: 'ala',
	at: new Date(NIGHTS[1]),
	outing: null,
	...over
});

describe('writing down a film we watched', () => {
	it('finds the round from the date, and leaves the week record alone', () => {
		const { db } = fourRounds();
		// a Wednesday: the night was moved, and it still belongs to round 2
		const id = recordWatched(db, film({ at: new Date('2026-07-22T17:00:00Z') }));

		expect(filmById(db, id)).toMatchObject({
			status: 'watched',
			archival: 1,
			added_week: 2,
			watched_week: 2,
			outing: null,
			watched_at: '2026-07-22T17:00:00.000Z',
			final_score: null
		});
		expect(db.prepare('SELECT winner_film_id FROM week WHERE number = 2').get()).toEqual({
			winner_film_id: null
		});
	});

	it('puts an outing between the nights either side of it', () => {
		const { db } = fourRounds();
		const first = recordWatched(db, film({ title: 'Solaris', tmdbId: 593, at: new Date(NIGHTS[0]) }));
		const second = recordWatched(db, film({ at: new Date(NIGHTS[1]) }));
		// the Sunday in between, at the cinema
		const cinema = recordWatched(
			db,
			film({ title: 'Mirror', tmdbId: 1396, at: new Date('2026-07-19T15:00:00Z'), outing: 'cinema' })
		);

		const evenings = filmEvenings(db);
		expect([evenings.get(first), evenings.get(cinema), evenings.get(second)]).toEqual([1, 2, 3]);
		expect(filmById(db, cinema)).toMatchObject({ watched_week: 2, watched_at: '2026-07-19T15:00:00.000Z' });
		// round 2 is called after its own night, which came after the cinema
		expect(roundEvenings(db)).toEqual({ 1: 1, 2: 3, 3: 4, 4: 4 });
	});

	it('takes a film night from before the first round, on its own date', () => {
		const { db } = fourRounds();
		const before = new Date('2026-06-25T18:00:00Z');
		const id = recordWatched(db, film({ at: before }));
		expect(filmById(db, id)).toMatchObject({ outing: null, watched_week: 1, watched_at: before.toISOString() });
		const first = recordWatched(db, film({ title: 'Solaris', tmdbId: 593, at: new Date(NIGHTS[0]) }));
		const evenings = filmEvenings(db);
		expect([evenings.get(id), evenings.get(first)]).toEqual([1, 2]);
	});

	it('takes an outing in the round still running, which moves its night along', () => {
		const { db } = fourRounds();
		expect(roundEvenings(db)[4]).toBe(1);
		recordWatched(db, film({ at: new Date('2026-08-01T19:00:00Z'), outing: 'trip' }));
		expect(roundEvenings(db)[4]).toBe(2);
	});

	it('refuses what has not happened yet, and takes a night in the round still running', () => {
		const { db } = fourRounds();
		expect(() => recordWatched(db, film({ at: new Date('2026-08-04T19:00:00Z'), outing: 'cinema' }))).toThrowError(
			expect.objectContaining({ code: 'watched_future' })
		);
		const id = recordWatched(db, film({ at: new Date('2026-08-01T19:00:00Z') }));
		expect(filmById(db, id)).toMatchObject({ outing: null, watched_week: 4 });
	});

	it('takes a second film night in one round, each on its own date', () => {
		const { db } = fourRounds();
		recordWatched(db, film());

		const second = recordWatched(
			db,
			film({ title: 'Mirror', tmdbId: 1396, at: new Date('2026-07-21T18:00:00Z') })
		);
		expect(filmById(db, second)).toMatchObject({ outing: null, watched_week: 2 });
		// the 21st came before the 23rd, so it is the earlier of the two
		expect(filmEvenings(db).get(second)).toBe(1);
		expect(
			recordWatched(
				db,
				film({ title: 'Ivan', tmdbId: 1400, at: new Date('2026-07-21T18:00:00Z'), outing: 'cinema' })
			)
		).toBeGreaterThan(0);
	});

	it('warns about a film already written down, naming its evening, and yields when told to', () => {
		const { db } = fourRounds();
		recordWatched(db, film({ at: new Date(NIGHTS[0]) }));

		expect(() => recordWatched(db, film({ at: new Date(NIGHTS[2]) }))).toThrowError(
			expect.objectContaining({ code: 'dup_recorded', params: { title: 'Stalker', evening: 1 } })
		);
		const again = recordWatched(db, film({ at: new Date(NIGHTS[2]), allowDuplicate: true }));
		expect(filmById(db, again)).toMatchObject({ watched_week: 3 });
	});

	it('warns about a film that is still on the list', () => {
		const { db } = fourRounds();
		addFilm(db, 'Stalker', 'bartek', 4, { tmdbId: 1398 });
		expect(() => recordWatched(db, film({ outing: 'cinema' }))).toThrowError(
			expect.objectContaining({ code: 'dup_recorded', params: { title: 'Stalker', evening: 0 } })
		);
	});
});

describe('what a written-down film is kept out of', () => {
	it('stays off the list, out of attrition and away from the ballot', () => {
		const { db, rules } = fourRounds();
		const id = recordWatched(db, film({ outing: 'cinema', at: new Date('2026-08-01T19:00:00Z') }));

		expect(standings(db, rules, 4, 'ala').map((f) => f.id)).not.toContain(id);
		applyAttrition(db, rules, 20);
		expect(filmById(db, id)).toMatchObject({ status: 'watched' });
		expect(() => setPoints(db, rules, 'ala', id, 1)).toThrowError(
			expect.objectContaining({ code: 'film_archival' })
		);
	});

	it('an outing is in what we watched, and nowhere in the game', () => {
		const { db } = fourRounds();
		recordWatched(db, film({ personId: 'bartek' }));
		recordWatched(
			db,
			film({ title: 'Mirror', tmdbId: 1396, personId: 'celina', at: new Date('2026-07-19T15:00:00Z'), outing: 'cinema' })
		);

		expect(watchedFilms(db).map((f) => f.title).sort()).toEqual(['Mirror', 'Stalker']);
		expect(whoseNights(db, { from: 1, to: 4 }).map((row) => row.person.id)).toEqual(['bartek']);
		// a film night earns its nominator a nomination and a watching; an outing earns nothing
		expect(personById(db, 'bartek')!.xp).toBe(16);
		expect(personById(db, 'celina')!.xp).toBe(0);
	});
});

describe('putting a written-down evening right', () => {
	it('turns a film night into an outing and back, and the XP follows', () => {
		const { db } = fourRounds();
		const id = recordWatched(db, film());
		expect(personById(db, 'ala')!.xp).toBe(16);

		moveWatched(db, id, new Date('2026-07-26T15:00:00Z'), 'cinema');
		expect(filmById(db, id)).toMatchObject({
			watched_week: 3,
			outing: 'cinema',
			watched_at: '2026-07-26T15:00:00.000Z'
		});
		expect(personById(db, 'ala')!.xp).toBe(0);

		// its own night is no clash with itself
		moveWatched(db, id, new Date(NIGHTS[2]), null);
		moveWatched(db, id, new Date(NIGHTS[2]), null);
		expect(filmById(db, id)).toMatchObject({ watched_week: 3, outing: null, watched_at: NIGHTS[2] });
		expect(personById(db, 'ala')!.xp).toBe(16);
	});

	it('moves it onto a round that already has a night, as a second one', () => {
		const { db } = fourRounds();
		recordWatched(db, film());
		const mirror = recordWatched(
			db,
			film({ title: 'Mirror', tmdbId: 1396, at: new Date('2026-07-19T15:00:00Z'), outing: 'cinema' })
		);
		moveWatched(db, mirror, new Date(NIGHTS[1]), null);
		expect(filmById(db, mirror)).toMatchObject({ outing: null, watched_week: 2, watched_at: NIGHTS[1] });
	});

	it('leaves a film a round decided on that round’s night', () => {
		const { db } = fourRounds();
		const id = addFilm(db, 'Solaris', 'bartek', 1);
		db.prepare(`UPDATE film SET status = 'watched', watched_week = 1 WHERE id = ?`).run(id);
		expect(() => moveWatched(db, id, new Date(NIGHTS[1]), 'cinema')).toThrowError(
			expect.objectContaining({ code: 'not_a_record' })
		);
	});
});

describe('crediting a film to whoever suggested it', () => {
	it('moves the XP with it', () => {
		const { db } = fourRounds();
		const id = recordWatched(db, film({ personId: 'ala' }));
		expect(personById(db, 'ala')!.xp).toBe(16);

		reassignFilm(db, id, 'darek');
		expect(filmById(db, id)).toMatchObject({ added_by: 'darek', watched_week: 2 });
		expect(personById(db, 'ala')!.xp).toBe(0);
		expect(personById(db, 'darek')!.xp).toBe(16);
	});

	it('credits two films of one round to the same person', () => {
		const { db } = fourRounds();
		const night = recordWatched(db, film());
		const cinema = recordWatched(
			db,
			film({ title: 'Mirror', tmdbId: 1396, at: new Date('2026-07-19T15:00:00Z'), outing: 'cinema' })
		);

		reassignFilm(db, night, 'celina');
		reassignFilm(db, cinema, 'celina');
		expect(filmById(db, night)).toMatchObject({ added_by: 'celina' });
		expect(filmById(db, cinema)).toMatchObject({ added_by: 'celina' });
	});
});
