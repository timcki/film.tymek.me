import type { DB } from './db.js';
import { iso } from './time.js';
import { TMDB_TOKEN } from './config.js';

const API = 'https://api.themoviedb.org/3';
const IMAGE = 'https://image.tmdb.org/t/p';
const CACHE_HOURS = 24;
const MAX_RESULTS = 7;

export type SearchResult = {
	tmdbId: number;
	title: string;
	year: number | null;
	poster: string | null;
	thumb: string | null;
	overview: string;
};

export type SearchResponse = { results: SearchResult[]; degraded?: boolean };

function normaliseQuery(q: string): string {
	return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function tmdbFetch(path: string): Promise<unknown> {
	const token = TMDB_TOKEN();
	if (!token) throw new Error('TMDB_READ_TOKEN is not set');
	const response = await fetch(`${API}${path}`, {
		headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
		signal: AbortSignal.timeout(6000)
	});
	if (!response.ok) throw new Error(`TMDB responded ${response.status}`);
	return response.json();
}

type RawMovie = {
	id: number;
	title: string;
	release_date?: string;
	poster_path?: string | null;
	overview?: string;
};

function mapMovie(movie: RawMovie): SearchResult {
	const year = movie.release_date ? Number(movie.release_date.slice(0, 4)) : null;
	return {
		tmdbId: movie.id,
		title: movie.title,
		year: Number.isFinite(year) ? year : null,
		poster: movie.poster_path ? `${IMAGE}/w342${movie.poster_path}` : null,
		thumb: movie.poster_path ? `${IMAGE}/w92${movie.poster_path}` : null,
		overview: movie.overview ?? ''
	};
}

/**
 * §8.2. Cached for 24 hours on the normalised query. Any TMDB failure degrades to
 * an empty list rather than blocking a nomination; you can always type a title.
 */
export async function search(db: DB, query: string): Promise<SearchResponse> {
	const key = normaliseQuery(query);
	if (!key) return { results: [] };

	const cached = db.prepare('SELECT body, fetched_at FROM tmdb_cache WHERE query = ?').get(key) as
		| { body: string; fetched_at: string }
		| undefined;
	if (cached) {
		const age = Date.now() - new Date(cached.fetched_at).getTime();
		if (age < CACHE_HOURS * 3600 * 1000) return JSON.parse(cached.body) as SearchResponse;
	}

	try {
		const raw = (await tmdbFetch(
			`/search/movie?include_adult=false&language=en-US&query=${encodeURIComponent(key)}`
		)) as { results?: RawMovie[] };
		const payload: SearchResponse = {
			results: (raw.results ?? []).slice(0, MAX_RESULTS).map(mapMovie)
		};
		db.prepare(
			`INSERT INTO tmdb_cache (query, body, fetched_at) VALUES (?, ?, ?)
			 ON CONFLICT(query) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at`
		).run(key, JSON.stringify(payload), iso());
		return payload;
	} catch (error) {
		console.warn('[tmdb] search failed:', (error as Error).message);
		// a stale cache entry beats nothing
		if (cached) return JSON.parse(cached.body) as SearchResponse;
		return { results: [], degraded: true };
	}
}

export type Details = {
	director: string | null;
	genre: string | null;
	runtime: number | null;
	/** ISO 3166-1 alpha-2 production countries, comma-separated, in TMDB's order */
	countries: string | null;
};

export const NO_DETAILS: Details = { director: null, genre: null, runtime: null, countries: null };

export function countriesOf(list: { iso_3166_1?: string }[] | undefined): string | null {
	const codes = (list ?? [])
		.map((c) => c.iso_3166_1?.toUpperCase())
		.filter((code): code is string => Boolean(code && /^[A-Z]{2}$/.test(code)));
	return codes.length ? [...new Set(codes)].join(',') : null;
}

/**
 * §8.2: fetched once, when a film is actually nominated, not per keystroke.
 * append_to_response folds the credits into the same request. Failure is not
 * fatal: the film goes on the list with a title and nothing else.
 */
export async function detailsOf(tmdbId: number): Promise<Details> {
	try {
		const movie = (await tmdbFetch(`/movie/${tmdbId}?append_to_response=credits`)) as {
			runtime?: number | null;
			genres?: { name?: string }[];
			credits?: { crew?: { job?: string; name?: string }[] };
			production_countries?: { iso_3166_1?: string }[];
		};
		const director = movie.credits?.crew?.find((member) => member.job === 'Director');
		const genre = (movie.genres ?? [])
			.slice(0, 2)
			.map((g) => g.name)
			.filter(Boolean)
			.join(' / ');
		return {
			director: director?.name ?? null,
			genre: genre || null,
			runtime: movie.runtime ?? null,
			countries: countriesOf(movie.production_countries)
		};
	} catch (error) {
		console.warn('[tmdb] details failed:', (error as Error).message);
		return NO_DETAILS;
	}
}
