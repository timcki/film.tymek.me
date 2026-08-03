import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { avatarOf } from '$lib/server/people';

/**
 * Profile pictures are addressed by person id with a `?v=` cache-buster, so the
 * body itself can be cached hard. Still behind the personal-link gate: a face
 * with a name attached is exactly the sort of thing that should not be public.
 */
export const GET: RequestHandler = async ({ params, request }) => {
	const picture = avatarOf(getDb(), params.id);
	if (!picture) error(404, 'no picture');

	const etag = `"${Date.parse(picture.updatedAt)}-${picture.bytes.length}"`;
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers: { etag } });
	}

	return new Response(new Uint8Array(picture.bytes), {
		headers: {
			'content-type': picture.mime,
			'content-length': String(picture.bytes.length),
			etag,
			'cache-control': 'private, max-age=31536000, immutable'
		}
	});
};
