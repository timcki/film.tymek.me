import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { isDemo } from '$lib/server/config';
import { logAdmin, requireAdmin } from '$lib/server/admin';
import { iso } from '$lib/server/time';

/**
 * The whole database as one file, for an admin to keep. It holds every
 * personal link, so it is an admin's alone, and the demo has none to give.
 */
export const GET: RequestHandler = ({ locals }) => {
	const person = requireAdmin(locals.person);
	if (isDemo()) error(404, 'Not found');
	const db = getDb();
	logAdmin(db, person.id, 'site.backup');
	const file = new Uint8Array(db.serialize());
	return new Response(file, {
		headers: {
			'content-type': 'application/vnd.sqlite3',
			'content-disposition': `attachment; filename="filmnight-${iso(new Date()).slice(0, 10)}.db"`,
			'cache-control': 'no-store'
		}
	});
};
