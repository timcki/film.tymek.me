import type { DB } from './db.js';
import { iso } from './time.js';
import { TMDB_TOKEN } from './config.js';

const API = 'https://api.themoviedb.org/3';
const IMAGE = 'https://image.tmdb.org/t/p';
/** a search's results; new releases do turn up, so not forever */
const CACHE_HOURS = 24 * 7;
/** a film's details, which TMDB all but never changes once a film is out */
const MOVIE_CACHE_DAYS = 30;
const MAX_RESULTS = 7;

export type SearchResult = {
	tmdbId: number;
	title: string;
	year: number | null;
	poster: string | null;
	thumb: string | null;
	overview: string;
	/** §3.7: enough to tell some of a custom week's rules before the pick */
	language: string | null;
	genres: number[];
};

export type SearchResponse = { results: SearchResult[]; degraded?: boolean };

/**
 * Changed whenever what a result says changes, so a week of cached searches
 * from before stops being read rather than being served as it was
 */
const CACHE_KEY = 'v2:';

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
	original_title?: string;
	release_date?: string;
	poster_path?: string | null;
	overview?: string;
	original_language?: string;
	genre_ids?: number[];
};

function mapMovie(movie: RawMovie): SearchResult {
	const year = movie.release_date ? Number(movie.release_date.slice(0, 4)) : null;
	return {
		tmdbId: movie.id,
		// a Polish film goes by its own title here rather than TMDB's English one;
		// TMDB matches a query against both, so either still finds it
		title: (movie.original_language === 'pl' && movie.original_title) || movie.title,
		year: Number.isFinite(year) ? year : null,
		poster: movie.poster_path ? `${IMAGE}/w342${movie.poster_path}` : null,
		thumb: movie.poster_path ? `${IMAGE}/w92${movie.poster_path}` : null,
		overview: movie.overview ?? '',
		language: movie.original_language || null,
		genres: movie.genre_ids ?? []
	};
}

/**
 * §8.2. Cached for a week on the normalised query. Any TMDB failure degrades to
 * an empty list rather than blocking a nomination; you can always type a title.
 */
export async function search(db: DB, query: string): Promise<SearchResponse> {
	const normalised = normaliseQuery(query);
	if (!normalised) return { results: [] };
	const key = CACHE_KEY + normalised;

	const cached = db.prepare('SELECT body, fetched_at FROM tmdb_cache WHERE query = ?').get(key) as
		| { body: string; fetched_at: string }
		| undefined;
	if (cached) {
		const age = Date.now() - new Date(cached.fetched_at).getTime();
		if (age < CACHE_HOURS * 3600 * 1000) return JSON.parse(cached.body) as SearchResponse;
	}

	try {
		const raw = (await tmdbFetch(
			`/search/movie?include_adult=false&language=en-US&query=${encodeURIComponent(normalised)}`
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

/** countries TMDB still files films under that no map has any more, read as today's */
export const SUCCESSOR: Record<string, string> = { SU: 'RU', XC: 'CZ', CS: 'RS', YU: 'RS', DD: 'DE' };

/**
 * §3.7: what a custom week's rules are checked against, taken from TMDB at the
 * moment of the pick rather than from what the film row keeps, which is less:
 * every genre rather than the first two, the original language, and who directed
 * it with their gender.
 */
export type Facts = {
	year: number | null;
	runtime: number | null;
	countries: string[];
	language: string | null;
	genres: number[];
	directors: { name: string; gender: number | null }[];
};

type LookedUp = { details: Details; facts: Facts | null };

/**
 * §8.2: fetched when a film is actually nominated, not per keystroke, and kept
 * for MOVIE_CACHE_DAYS so the same film is not asked for twice. Failure is not
 * fatal: the film goes on the list with a title and nothing else, and no facts.
 */
export async function lookUpFilm(db: DB, tmdbId: number, now = new Date()): Promise<LookedUp> {
	const cached = db.prepare('SELECT body, fetched_at FROM tmdb_movie WHERE tmdb_id = ?').get(tmdbId) as
		| { body: string; fetched_at: string }
		| undefined;
	if (cached && now.getTime() - new Date(cached.fetched_at).getTime() < MOVIE_CACHE_DAYS * 86_400_000) {
		return JSON.parse(cached.body) as LookedUp;
	}
	const fresh = await fetchFilm(tmdbId);
	if (fresh.facts) {
		db.prepare(
			`INSERT INTO tmdb_movie (tmdb_id, body, fetched_at) VALUES (?, ?, ?)
			 ON CONFLICT(tmdb_id) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at`
		).run(tmdbId, JSON.stringify(fresh), iso(now));
		return fresh;
	}
	// a stale copy beats nothing, the way it does for search
	return cached ? (JSON.parse(cached.body) as LookedUp) : fresh;
}

/** append_to_response folds the credits into the same request */
async function fetchFilm(tmdbId: number): Promise<LookedUp> {
	try {
		const movie = (await tmdbFetch(`/movie/${tmdbId}?append_to_response=credits`)) as {
			runtime?: number | null;
			release_date?: string;
			original_language?: string;
			genres?: { id?: number; name?: string }[];
			credits?: { crew?: { job?: string; name?: string; gender?: number }[] };
			production_countries?: { iso_3166_1?: string }[];
		};
		const directors = (movie.credits?.crew ?? []).filter(
			(member) => member.job === 'Director' && member.name
		);
		const genre = (movie.genres ?? [])
			.slice(0, 2)
			.map((g) => g.name)
			.filter(Boolean)
			.join(' / ');
		const countries = countriesOf(movie.production_countries);
		const year = Number(movie.release_date?.slice(0, 4));
		return {
			details: {
				director: directors[0]?.name ?? null,
				genre: genre || null,
				runtime: movie.runtime ?? null,
				countries
			},
			facts: {
				year: Number.isFinite(year) && year > 0 ? year : null,
				runtime: movie.runtime || null,
				countries: countries ? countries.split(',') : [],
				language: movie.original_language || null,
				genres: (movie.genres ?? []).map((g) => g.id).filter((id): id is number => Number.isInteger(id)),
				directors: directors.map((d) => ({ name: d.name as string, gender: d.gender ?? null }))
			}
		};
	} catch (error) {
		console.warn('[tmdb] details failed:', (error as Error).message);
		return { details: NO_DETAILS, facts: null };
	}
}

export async function detailsOf(db: DB, tmdbId: number): Promise<Details> {
	return (await lookUpFilm(db, tmdbId)).details;
}
