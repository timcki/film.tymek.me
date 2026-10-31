import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { wallPoster } from '$lib/server/posters';

/**
 * One poster off the PRL wall. Behind the personal-link gate because these are
 * somebody else's work still in copyright, put up for the group and nobody
 * else; a poster never changes under its name, so it is cached hard.
 */
export const GET: RequestHandler = async ({ params }) => {
	const bytes = await wallPoster(params.name);
	if (!bytes) error(404, 'no poster');
	return new Response(new Uint8Array(bytes), {
		headers: {
			'content-type': 'image/jpeg',
			'content-length': String(bytes.length),
			'cache-control': 'private, max-age=31536000, immutable'
		}
	});
};
