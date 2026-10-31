import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { wallPosters } from '$lib/server/posters';

/** the PRL wall's list of posters, which PosterWall.svelte deals from */
export const GET: RequestHandler = () =>
	json(wallPosters(), { headers: { 'cache-control': 'private, max-age=3600' } });
