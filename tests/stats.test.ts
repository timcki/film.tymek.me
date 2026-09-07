import { describe, expect, it } from 'vitest';
import { addFilm, castBallot, ensureWeek, freshDb } from './helpers.js';
import type { DB } from '../src/lib/server/db.js';
import { bandLabel, bandOf, bandsFor } from '../src/lib/bands.js';
import { shortNames } from '../src/lib/names.js';
import {
	byDecade,
	byDirector,
	byGenre,
	counts,
	engagement,
	filmFacts,
	eraOf,
	lensOf,
	openness,
	whoseNights,
	roundRows,
	runtimes,
	screenStats,
	openShare,
	timing,
	watchedFilms,
	windowFor,
	type WatchedFilm
} from '../src/lib/server/stats.js';

const ALL = { from: 1, to: 99 };

/** the rows the film figures work on, without the round trip through SQLite */
function film(extra: Partial<WatchedFilm>): WatchedFilm {
	return {
		id: 1,
		title: 'F',
		year: 1999,
		director: null,
		genre: null,
		runtime: null,
		posterUrl: null,
		week: 1,
		addedBy: 'ala',
		addedByName: 'ala',
		...extra
	};
}

function watch(db: DB, filmId: number, week: number): void {
	ensureWeek(db, week);
	db.prepare(`UPDATE film SET status = 'watched', watched_week = ? WHERE id = ?`).run(week, filmId);
}

describe('the window a figure is counted over', () => {
	it('starts the app era at the first round anybody voted in', () => {
		const { db } = freshDb();
		const a = addFilm(db, 'A', 'ala', 1);
		castBallot(db, 4, 'bartek', a, 1);
		expect(windowFor(db, 'app')).toEqual({ from: 4, to: 4 });
		expect(windowFor(db, 'all')).toEqual({ from: 1, to: 4 });
	});

	it('falls back to the current round while nobody has voted at all', () => {
		const { db } = freshDb();
		expect(windowFor(db, 'app')).toEqual({ from: 1, to: 1 });
	});

	it('reads both switches off the query string, defaulting to the honest view', () => {
		expect(eraOf(null)).toBe('app');
		expect(eraOf('nonsense')).toBe('app');
		expect(eraOf('all')).toBe('all');
		expect(lensOf(undefined)).toBe('people');
		expect(lensOf('nonsense')).toBe('people');
		expect(lensOf('films')).toBe('films');
	});
});

describe('what every other figure is counted out of', () => {
	it('counts the nights, the rounds, the roster and the ballots', () => {
		const { db } = freshDb();
		const a = addFilm(db, 'A', 'ala', 1);
		const b = addFilm(db, 'B', 'bartek', 1);
		castBallot(db, 1, 'ala', a, 2);
		castBallot(db, 1, 'bartek', b, 1);
		watch(db, a, 1);

		expect(counts(db, ALL)).toEqual({ nights: 1, rounds: 1, roster: 6, ballots: 2 });
	});
});

describe('the rounds, one column each', () => {
	/**
	 * The bug this pins: an admin who moves a night's film around leaves
	 * week.winner_film_id pointing at nothing, and the round then reads as one
	 * the group watched nothing in.
	 */
	it('names the film off the film table even when the week forgot it', () => {
		const { db } = freshDb();
		const a = addFilm(db, 'A', 'ala', 1);
		watch(db, a, 1);
		db.prepare(`UPDATE week SET status = 'closed', winner_film_id = NULL WHERE number = 1`).run();

		expect(roundRows(db, ALL)[0].winnerTitle).toBe('A');
	});

	it('leaves a round nobody watched anything in without a film', () => {
		const { db } = freshDb();
		db.prepare(`UPDATE week SET status = 'closed' WHERE number = 1`).run();
		expect(roundRows(db, ALL)[0].winnerTitle).toBeNull();
	});

	it('reports how many voted and how many turned up, round by round', () => {
		const { db } = freshDb();
		const a = addFilm(db, 'A', 'ala', 1);
		ensureWeek(db, 2);
		castBallot(db, 1, 'ala', a, 1);
		castBallot(db, 1, 'bartek', a, 1);
		castBallot(db, 2, 'celina', a, 1);
		const checkIn = db.prepare(
			'INSERT INTO attendance (week_number, person_id, checked_in_at) VALUES (?, ?, ?)'
		);
		for (const id of ['ala', 'bartek', 'darek']) checkIn.run(1, id, '2026-08-03T20:00:00.000Z');

		const rows = roundRows(db, ALL);
		expect(rows.map((row) => [row.week, row.voters, row.attended])).toEqual([
			[1, 2, 3],
			[2, 1, 0]
		]);
	});
});

describe('openness', () => {
	/** ala backs her own twice and somebody else once; bartek backs only his own */
	function scenario() {
		const { db } = freshDb();
		const hers = addFilm(db, 'Hers', 'ala', 1);
		const his = addFilm(db, 'His', 'bartek', 1);
		castBallot(db, 1, 'ala', hers, 2);
		castBallot(db, 1, 'ala', his, 1);
		castBallot(db, 1, 'bartek', his, 3);
		castBallot(db, 1, 'celina', hers, 2);
		return { db, hers, his };
	}

	it('scores each person on the share that went to everybody else’s films', () => {
		const { db } = scenario();
		const rows = openness(db, ALL);
		const ala = rows.find((row) => row.person.id === 'ala')!;
		expect(ala.own).toBe(2);
		expect(ala.others).toBe(1);
		expect(openShare(ala)).toBeCloseTo(1 / 3);

		// bartek spent everything on his own, which is the closed end of the scale
		const bartek = rows.find((row) => row.person.id === 'bartek')!;
		expect(openShare(bartek)).toBe(0);
	});

	/**
	 * Somebody who has never nominated has put every point they own on somebody
	 * else's film, which is what the figure measures and what it should say. An
	 * earlier version counted only the rounds where a person had a film of their
	 * own up and left everybody else out of the ranking entirely.
	 */
	it('gives somebody who has never nominated a clean hundred per cent', () => {
		const { db } = scenario();
		const celina = openness(db, ALL).find((row) => row.person.id === 'celina')!;
		expect(celina.own).toBe(0);
		expect(celina.others).toBe(2);
		expect(openShare(celina)).toBe(1);
	});

	it('ranks the most open first', () => {
		const { db } = scenario();
		expect(openness(db, ALL).map((row) => row.person.id)).toEqual([
			'celina',
			'ala',
			'bartek'
		]);
	});

	/** the percentage has to be checkable against the films it was made from */
	it('shows the working: every film the points went on, biggest first', () => {
		const { db } = scenario();
		const ala = openness(db, ALL).find((row) => row.person.id === 'ala')!;
		expect(ala.films).toEqual([
			{ id: expect.any(Number), title: 'Hers', mine: true, points: 2 },
			{ id: expect.any(Number), title: 'His', mine: false, points: 1 }
		]);
		// and the halves of the fraction are the halves of that list
		const sum = (mine: boolean) =>
			ala.films.filter((film) => film.mine === mine).reduce((n, film) => n + film.points, 0);
		expect(sum(false)).toBe(ala.others);
		expect(sum(true)).toBe(ala.own);
	});

	it('adds up the rounds a film was backed across into one row', () => {
		const { db } = freshDb();
		const one = addFilm(db, 'Campaign', 'bartek', 1);
		castBallot(db, 1, 'ala', one, 2);
		castBallot(db, 2, 'ala', one, 3);

		const ala = openness(db, ALL)[0];
		expect(ala.films).toEqual([
			{ id: one, title: 'Campaign', mine: false, points: 5 }
		]);
	});

	it('leaves out anybody who has not voted at all', () => {
		const { db } = scenario();
		expect(openness(db, ALL).some((row) => row.person.id === 'darek')).toBe(false);
	});

	it('counts only the rounds inside the window', () => {
		const { db } = freshDb();
		const mine = addFilm(db, 'Mine', 'ala', 1);
		const theirs = addFilm(db, 'Theirs', 'bartek', 1);
		castBallot(db, 1, 'ala', mine, 1);
		castBallot(db, 2, 'ala', theirs, 1);

		expect(openShare(openness(db, { from: 1, to: 1 })[0])).toBe(0);
		expect(openShare(openness(db, { from: 2, to: 2 })[0])).toBe(1);
	});
});

describe('whose films the group watches', () => {
	it('counts the nights that were each person’s film', () => {
		const { db } = freshDb();
		ensureWeek(db, 2);
		const first = addFilm(db, 'First', 'ala', 1);
		addFilm(db, 'Second', 'ala', 2);
		watch(db, first, 1);

		const ala = whoseNights(db, ALL).find((row) => row.person.id === 'ala')!;
		expect(ala.nights).toBe(1);
	});

	/**
	 * The bug this pins: a film nominated one round and watched the next belongs
	 * to the night it was watched on. Counting by added_week dropped The Green
	 * Ray out of the era it was actually screened in.
	 */
	it('counts a film against the round it was watched in, not the one it was put up in', () => {
		const { db } = freshDb();
		ensureWeek(db, 2);
		ensureWeek(db, 3);
		const late = addFilm(db, 'Late', 'ala', 1);
		watch(db, late, 3);

		expect(whoseNights(db, { from: 3, to: 3 })).toHaveLength(1);
		expect(whoseNights(db, { from: 1, to: 2 })).toEqual([]);
	});

	/** they are not nominations in play, but they are nights the group sat through */
	it('credits the backfilled nights to whoever proposed them', () => {
		const { db } = freshDb();
		const old = addFilm(db, 'Old', 'ala', 1);
		db.prepare('UPDATE film SET archival = 1 WHERE id = ?').run(old);
		watch(db, old, 1);

		expect(whoseNights(db, ALL).find((row) => row.person.id === 'ala')?.nights).toBe(1);
	});
});

describe('turning up', () => {

	it('credits backing the film that won the round it won in', () => {
		const { db } = freshDb();
		const winner = addFilm(db, 'Winner', 'ala', 1);
		castBallot(db, 1, 'bartek', winner, 2);
		castBallot(db, 2, 'celina', winner, 1);
		watch(db, winner, 1);
		db.prepare('UPDATE week SET winner_film_id = ? WHERE number = 1').run(winner);

		const rows = engagement(db, ALL);
		expect(rows.find((row) => row.person.id === 'bartek')!.winnersBacked).toBe(1);
		// celina backed it a round late, which is not the same thing
		expect(rows.find((row) => row.person.id === 'celina')!.winnersBacked).toBe(0);
	});

	it('lists everybody on the roster, including the ones who have done nothing', () => {
		const { db } = freshDb();
		const rows = engagement(db, ALL);
		expect(rows).toHaveLength(6);
		expect(rows.every((row) => row.roundsVoted === 0)).toBe(true);
	});
});

describe('when in the round the votes land', () => {
	it('places each ballot between the round opening and its deadline', () => {
		const { db } = freshDb();
		const a = addFilm(db, 'A', 'ala', 1);
		db.prepare('UPDATE week SET opens_at = ?, closes_at = ? WHERE number = 1').run(
			'2026-08-03T00:00:00.000Z',
			'2026-08-13T00:00:00.000Z'
		);
		castBallot(db, 1, 'ala', a, 1);
		castBallot(db, 1, 'bartek', a, 1);
		db.prepare('UPDATE ballot SET updated_at = ? WHERE person_id = ?').run(
			'2026-08-05T12:00:00.000Z',
			'ala'
		);
		db.prepare('UPDATE ballot SET updated_at = ? WHERE person_id = ?').run(
			'2026-08-10T12:00:00.000Z',
			'bartek'
		);

		const rows = timing(db, ALL);
		expect(rows.map((row) => row.person.id)).toEqual(['ala', 'bartek']);
		expect(rows[0].median).toBeCloseTo(0.25);
		expect(rows[1].median).toBeCloseTo(0.75);
	});

	it('keeps a vote cast after a hand-closed deadline on the axis', () => {
		const { db } = freshDb();
		const a = addFilm(db, 'A', 'ala', 1);
		db.prepare('UPDATE week SET opens_at = ?, closes_at = ? WHERE number = 1').run(
			'2026-08-03T00:00:00.000Z',
			'2026-08-04T00:00:00.000Z'
		);
		castBallot(db, 1, 'ala', a, 1);
		db.prepare('UPDATE ballot SET updated_at = ?').run('2026-08-09T00:00:00.000Z');

		expect(timing(db, ALL)[0].median).toBe(1);
	});
});

describe('the canon', () => {
	it('keeps every decade between the first film and the last, empty ones included', () => {
		const buckets = byDecade([
			film({ id: 1, year: 1971 }),
			film({ id: 2, year: 1978 }),
			film({ id: 3, year: 1994 })
		]);
		expect(buckets.map((b) => b.label)).toEqual(['70s', '80s', '90s']);
		expect(buckets.map((b) => b.films.length)).toEqual([2, 0, 1]);
	});

	it('counts a film under each of the genres TMDB gave it', () => {
		const buckets = byGenre([
			film({ id: 1, genre: 'Crime / Drama' }),
			film({ id: 2, genre: 'Drama' }),
			film({ id: 3, genre: null })
		]);
		expect(buckets.map((b) => [b.label, b.films.length])).toEqual([
			['Drama', 2],
			['Crime', 1]
		]);
	});

	it('names only the directors the group has come back to', () => {
		const buckets = byDirector([
			film({ id: 1, director: 'Tarkovsky' }),
			film({ id: 2, director: 'Tarkovsky' }),
			film({ id: 3, director: 'Yang' })
		]);
		expect(buckets).toHaveLength(1);
		expect(buckets[0].label).toBe('Tarkovsky');
	});

	it('reports the spread of runtimes and says nothing when there are none', () => {
		const spread = runtimes([
			film({ id: 1, runtime: 90 }),
			film({ id: 2, runtime: 110 }),
			film({ id: 3, runtime: 160 })
		])!;
		expect([spread.min, spread.max, spread.median]).toEqual([90, 160, 110]);
		expect(spread.mean).toBeCloseTo(120);
		expect(runtimes([film({ id: 1, runtime: null })])).toBeNull();
	});

	it('reads the nights off the film table, newest first', () => {
		const { db } = freshDb();
		ensureWeek(db, 2);
		const first = addFilm(db, 'First', 'ala', 1);
		const second = addFilm(db, 'Second', 'bartek', 2);
		watch(db, first, 1);
		watch(db, second, 2);
		expect(watchedFilms(db).map((f) => f.title)).toEqual(['Second', 'First']);
	});
});

describe('what a chart row calls somebody', () => {
	it('uses first names, and only as much more as it takes to tell two apart', () => {
		const names = shortNames([
			{ id: 'a', name: 'Halka Jagielska' },
			{ id: 'b', name: 'Julia Kisielewicz' },
			{ id: 'c', name: 'Julia Markusiewicz' },
			{ id: 'd', name: 'Julia Wroblewska' }
		]);
		expect(names.get('a')).toBe('Halka');
		expect(names.get('b')).toBe('Julia K.');
		expect(names.get('c')).toBe('Julia M.');
		expect(names.get('d')).toBe('Julia W.');
	});

	it('spells out the whole name when even the initial collides', () => {
		const names = shortNames([
			{ id: 'a', name: 'Julia Kisielewicz' },
			{ id: 'b', name: 'Julia Kowalska' }
		]);
		expect(names.get('a')).toBe('Julia Kisielewicz');
		expect(names.get('b')).toBe('Julia Kowalska');
	});

	it('leaves a one-word name alone', () => {
		expect(shortNames([{ id: 'a', name: 'ala' }]).get('a')).toBe('ala');
	});
});

describe('the bands the engagement grid is cut into', () => {
	const labels = (outOf: number) => bandsFor(outOf).map(bandLabel);

	/**
	 * The bug this pins twice over. By fraction, three nights out of four and all
	 * four both came out above two thirds and shared a cell. Banding four ways
	 * regardless then put three out of five and four out of five together, which
	 * is the same failure wearing different numbers: at this scale a band is
	 * always wider than the difference anybody cares about.
	 */
	it('gives every count its own column while they still fit', () => {
		expect(labels(5)).toEqual(['0', '1', '2', '3', '4', '5']);
		expect(bandOf(4, 5)).toBe(4);
		expect(bandOf(3, 5)).toBe(3);
		expect(bandOf(5, 5)).toBe(5);
	});

	it('falls back to ranges once the history outgrows the screen', () => {
		expect(labels(7)).toEqual(['0', '1-3', '4-6', '7']);
		expect(labels(40)).toEqual(['0', '1-20', '21-39', '40']);
		// and the top of the range is the full set, never merely most of it
		expect(bandOf(40, 40)).toBe(3);
		expect(bandOf(39, 40)).toBe(2);
	});

	it('puts nobody above zero', () => {
		expect(bandOf(0, 5)).toBe(0);
		expect(bandOf(-1, 5)).toBe(0);
	});

	/** a window with nothing in it must not promote everybody to the top band */
	it('survives a window holding no nights at all', () => {
		expect(labels(0)).toEqual(['0']);
		expect(bandOf(0, 0)).toBe(0);
		expect(bandOf(3, 0)).toBe(0);
	});

	it('never sends anybody outside the grid it drew', () => {
		for (const outOf of [0, 1, 5, 6, 7, 40]) {
			const width = bandsFor(outOf).length;
			for (const count of [-1, 0, 1, outOf - 1, outOf, outOf + 5]) {
				const index = bandOf(count, outOf);
				expect(index).toBeGreaterThanOrEqual(0);
				expect(index).toBeLessThan(width);
			}
		}
	});
});

describe('what it takes for a film to reach the screen', () => {
	/** a night the app resolved: it has a score behind it */
	function won(db: DB, title: string, added: number, watched: number, score: number) {
		ensureWeek(db, added);
		ensureWeek(db, watched);
		const id = addFilm(db, title, 'ala', added);
		db.prepare(
			`UPDATE film SET status = 'watched', watched_week = ?, final_score = ? WHERE id = ?`
		).run(watched, score, id);
		return id;
	}

	it('averages the wait and the winning score, and names both extremes', () => {
		const { db } = freshDb();
		won(db, 'Quick', 4, 5, 9);
		won(db, 'Patient', 1, 5, 3);
		const stats = screenStats(db)!;

		expect(stats.nights).toBe(2);
		expect(stats.meanWait).toBe(2.5);
		expect(stats.meanScore).toBe(6);
		// each chart is ordered longest first, so the extreme reads off the top
		expect(stats.waits.map((film) => [film.title, film.value])).toEqual([
			['Patient', 4],
			['Quick', 1]
		]);
		expect(stats.scores.map((film) => [film.title, film.value])).toEqual([
			['Quick', 9],
			['Patient', 3]
		]);
	});

	/**
	 * A backfilled night was written down as nominated and watched in the same
	 * week and carries no score, so counting those would put the typical wait at
	 * nothing and the typical winner at zero points.
	 */
	it('is counted only over the nights the app itself resolved', () => {
		const { db } = freshDb();
		won(db, 'Real', 1, 3, 8);
		const old = addFilm(db, 'Backfilled', 'bartek', 1);
		db.prepare(
			`UPDATE film SET status = 'watched', watched_week = 1, archival = 1 WHERE id = ?`
		).run(old);

		const stats = screenStats(db)!;
		expect(stats.nights).toBe(1);
		expect(stats.meanWait).toBe(2);
		expect(stats.meanScore).toBe(8);
	});

	it('ranks the films still on the list by how long they have been on it', () => {
		const { db } = freshDb();
		won(db, 'Watched', 1, 2, 5);
		for (const week of [5, 6]) ensureWeek(db, week);
		addFilm(db, 'Still waiting', 'bartek', 2);
		addFilm(db, 'Newer', 'celina', 5);

		expect(screenStats(db)!.waiting.map((film) => [film.title, film.value])).toEqual([
			['Still waiting', 4],
			['Newer', 1]
		]);
	});

	it('says nothing at all before the app has resolved a night', () => {
		const { db } = freshDb();
		addFilm(db, 'Up for it', 'ala', 1);
		expect(screenStats(db)).toBeNull();
	});
});

describe('the canon\'s extremes', () => {
	it('names the longest, the shortest and the oldest', () => {
		const facts = filmFacts([
			film({ id: 1, title: 'Epic', runtime: 183, year: 1979 }),
			film({ id: 2, title: 'Brief', runtime: 71, year: 1985 }),
			film({ id: 3, title: 'Ancient', runtime: 120, year: 1953 })
		]);
		expect(facts.longest).toMatchObject({ title: 'Epic', value: 183 });
		expect(facts.shortest).toMatchObject({ title: 'Brief', value: 71 });
		expect(facts.oldest).toMatchObject({ title: 'Ancient', value: 1953 });
	});

	/** TMDB has given us everything so far, but a hand-added film need not have */
	it('skips the films missing the figure it is looking for', () => {
		const facts = filmFacts([
			film({ id: 1, title: 'Timed', runtime: 100, year: null }),
			film({ id: 2, title: 'Untimed', runtime: null, year: 1960 })
		]);
		expect(facts.longest).toMatchObject({ title: 'Timed' });
		expect(facts.shortest).toMatchObject({ title: 'Timed' });
		expect(facts.oldest).toMatchObject({ title: 'Untimed' });
	});

	it('says nothing at all about an empty canon', () => {
		expect(filmFacts([])).toEqual({ longest: null, shortest: null, oldest: null });
	});
});
