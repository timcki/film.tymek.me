import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedPoster, posterSource } from '../src/lib/server/poster-cache.js';
import { lookUpFilm, search } from '../src/lib/server/tmdb.js';
import { posterSrc } from '../src/lib/poster-src.js';
import { addFilm, freshDb } from './helpers.js';

const POSTER = 'https://image.tmdb.org/t/p/w342/abc123.jpg';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const MOVIE = {
	runtime: 163,
	release_date: '1972-03-20',
	original_language: 'ru',
	genres: [{ id: 878, name: 'Science Fiction' }],
	credits: { crew: [{ job: 'Director', name: 'Andrei Tarkovsky', gender: 2 }] },
	production_countries: [{ iso_3166_1: 'SU' }]
};

let dir: string;
const fetchMock = vi.fn();

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'filmnight-'));
	vi.stubEnv('DATABASE_PATH', join(dir, 'filmnight.db'));
	vi.stubEnv('TMDB_READ_TOKEN', 'test');
	vi.stubGlobal('fetch', fetchMock);
	fetchMock.mockReset();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	rmSync(dir, { recursive: true, force: true });
});

/**
 * Twenty-odd phones share one TMDB key, so a film's details and its poster are
 * asked of TMDB once and then come from our side.
 */
describe('film details', () => {
	it('are asked for once and then read back', async () => {
		const { db } = freshDb();
		fetchMock.mockResolvedValue(Response.json(MOVIE));
		const first = await lookUpFilm(db, 593);
		const second = await lookUpFilm(db, 593);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(second).toEqual(first);
		expect(first.details.director).toBe('Andrei Tarkovsky');
	});

	it('are not kept when the lookup failed, so the next one tries again', async () => {
		const { db } = freshDb();
		fetchMock.mockResolvedValueOnce(new Response('', { status: 429 }));
		expect((await lookUpFilm(db, 593)).facts).toBeNull();
		fetchMock.mockResolvedValueOnce(Response.json(MOVIE));
		expect((await lookUpFilm(db, 593)).facts).not.toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('fall back to a stale copy when TMDB is down', async () => {
		const { db } = freshDb();
		fetchMock.mockResolvedValueOnce(Response.json(MOVIE));
		await lookUpFilm(db, 593, new Date('2026-06-01T10:00:00Z'));
		fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
		const later = await lookUpFilm(db, 593);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(later.details.director).toBe('Andrei Tarkovsky');
	});
});

describe('search titles', () => {
	const RESULTS = {
		results: [
			{ id: 19673, title: 'Sexmission', original_title: 'Seksmisja', original_language: 'pl' },
			{ id: 1398, title: 'Stalker', original_title: 'Сталкер', original_language: 'ru' }
		]
	};

	it('give a Polish film its Polish title and leave the rest in English', async () => {
		const { db } = freshDb();
		fetchMock.mockImplementation(async () => Response.json(RESULTS));
		for (const query of ['Sexmission', 'Seksmisja']) {
			const { results } = await search(db, query);
			expect(results.map((r) => r.title)).toEqual(['Seksmisja', 'Stalker']);
		}
		expect(String(fetchMock.mock.calls[0][0])).toContain('query=sexmission');
	});

	it('are not served from a search cached before titles changed', async () => {
		const { db } = freshDb();
		db.prepare('INSERT INTO tmdb_cache (query, body, fetched_at) VALUES (?, ?, ?)').run(
			'sexmission',
			JSON.stringify({ results: [{ tmdbId: 19673, title: 'Sexmission' }] }),
			new Date().toISOString()
		);
		fetchMock.mockImplementation(async () => Response.json(RESULTS));
		expect((await search(db, 'Sexmission')).results[0].title).toBe('Seksmisja');
	});
});

describe('posters', () => {
	it('route TMDB images through our cache and leave anything else alone', () => {
		expect(posterSrc(POSTER)).toBe('/poster/w342/abc123.jpg');
		expect(posterSrc('/avatar/ala')).toBe('/avatar/ala');
		expect(posterSrc(null)).toBeNull();
	});

	it('serve only the shape of a TMDB poster', () => {
		const { db } = freshDb();
		for (const [size, file] of [
			['w342', '../filmnight.db'],
			['w342', 'abc.svg'],
			['w342', 'abc.jpg?x=1'],
			['../..', 'abc.jpg'],
			['w9999', 'abc.jpg']
		]) {
			expect(posterSource(db, size, file)).toBeNull();
		}
	});

	it('cache only posters our own films wear', () => {
		const { db } = freshDb();
		addFilm(db, 'Solaris', 'ala', 1, { posterUrl: POSTER });
		expect(posterSource(db, 'w342', 'abc123.jpg')).toEqual({ url: POSTER, ours: true });
		expect(posterSource(db, 'w92', 'abc123.jpg')).toEqual({
			url: 'https://image.tmdb.org/t/p/w92/abc123.jpg',
			ours: false
		});
	});

	it('are fetched once, however many phones ask at the same moment', async () => {
		fetchMock.mockImplementation(
			async () => new Response(JPEG, { headers: { 'content-type': 'image/jpeg' } })
		);
		const bodies = await Promise.all([1, 2, 3].map(() => cachedPoster('w342', 'abc123.jpg', POSTER)));
		expect(await cachedPoster('w342', 'abc123.jpg', POSTER)).toEqual(Buffer.from(JPEG));
		expect(bodies.every((body) => body?.equals(Buffer.from(JPEG)))).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(readdirSync(join(dir, 'posters'))).toEqual(['w342-abc123.jpg']);
	});

	it('keep nothing when TMDB sends something that is not an image', async () => {
		fetchMock.mockResolvedValue(new Response('<html>', { headers: { 'content-type': 'text/html' } }));
		expect(await cachedPoster('w342', 'abc123.jpg', POSTER)).toBeNull();
		expect(readdirSync(dir)).not.toContain('posters');
	});
});
