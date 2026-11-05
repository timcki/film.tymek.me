import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { cachedPoster, contentTypeOf, posterSource } from '$lib/server/poster-cache';

/**
 * A film's poster, through the server's cache. Open, because guests in the room
 * see posters too (§7.2); what it serves is TMDB's own public images and nothing
 * else, so being open lends nobody anything.
 */
export const GET: RequestHandler = async ({ params }) => {
	const source = posterSource(getDb(), params.size, params.file);
	if (!source) error(404, 'no such poster');
	if (!source.ours) redirect(302, source.url);
	const body = await cachedPoster(params.size, params.file, source.url);
	// our fetch failed; the phone may still reach TMDB itself
	if (!body) redirect(302, source.url);
	return new Response(new Uint8Array(body), {
		headers: {
			'content-type': contentTypeOf(params.file),
			// a TMDB poster path names one image forever, so a phone never needs to ask twice
			'cache-control': 'public, max-age=31536000, immutable'
		}
	});
};
