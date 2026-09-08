import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { isDemo } from '$lib/server/config';
import { limiter } from '$lib/server/ratelimit';
import { search } from '$lib/server/tmdb';

/**
 * On the real app this is twenty-two people behind a personal link, and the
 * TMDB cache absorbs most of it. The demo is a public door onto the same key, so
 * there it gets a ceiling: a burst per address per minute.
 */
const SEARCHES_PER_MINUTE = 20;
const overRate = limiter(SEARCHES_PER_MINUTE);

/** §8.2: server-side proxy so the TMDB key never reaches the browser */
export const GET: RequestHandler = async ({ url, locals, getClientAddress }) => {
	if (!locals.person) error(401, 'open your personal link first');
	if (isDemo() && overRate(getClientAddress(), Date.now())) {
		error(429, 'too many searches; give it a minute');
	}
	const query = url.searchParams.get('q') ?? '';
	return json(await search(getDb(), query));
};
