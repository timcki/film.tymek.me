import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { search } from '$lib/server/tmdb';

/** §8.2: server-side proxy so the TMDB key never reaches the browser */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.person) error(401, 'open your personal link first');
	const query = url.searchParams.get('q') ?? '';
	return json(await search(getDb(), query));
};
