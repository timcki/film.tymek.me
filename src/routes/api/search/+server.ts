import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { isDemo } from '$lib/server/config';
import { search } from '$lib/server/tmdb';

/**
 * On the real app this is twenty-two people behind a personal link, and the
 * TMDB cache absorbs most of it. The demo is a public door onto the same key, so
 * there it gets a ceiling: a burst per address per minute, held in memory
 * because the process is restarted hourly anyway and a table would outlive the
 * abuse it was written for.
 */
const SEARCHES_PER_MINUTE = 20;
const WINDOW_MS = 60_000;
const seen = new Map<string, { count: number; until: number }>();

function overRate(address: string, now: number): boolean {
	const bucket = seen.get(address);
	if (!bucket || now >= bucket.until) {
		// the map only ever holds addresses that asked in the last minute
		for (const [key, value] of seen) if (now >= value.until) seen.delete(key);
		seen.set(address, { count: 1, until: now + WINDOW_MS });
		return false;
	}
	bucket.count++;
	return bucket.count > SEARCHES_PER_MINUTE;
}

/** §8.2: server-side proxy so the TMDB key never reaches the browser */
export const GET: RequestHandler = async ({ url, locals, getClientAddress }) => {
	if (!locals.person) error(401, 'open your personal link first');
	if (isDemo() && overRate(getClientAddress(), Date.now())) {
		error(429, 'too many searches; give it a minute');
	}
	const query = url.searchParams.get('q') ?? '';
	return json(await search(getDb(), query));
};
