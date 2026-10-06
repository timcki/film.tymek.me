import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generation } from '$lib/server/live';

/**
 * What the list polls while it is open: one short string that changes whenever
 * anything has been written. The page reloads its own data only when it does,
 * so twenty-odd phones asking every few seconds cost next to nothing.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.person) error(401, 'open your personal link first');
	return json({ gen: generation() }, { headers: { 'cache-control': 'no-store' } });
};
