import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { activeRules, isDemo, revision } from '$lib/server/config';

/**
 * The two facts a deploy can get wrong, said out loud: which commit this process
 * was built from and which rule set it is running. Both were previously only
 * answerable by grepping the store path on the box, which is how a deploy that
 * quietly did not happen went unnoticed for a fortnight.
 *
 * Open to anybody, like the personal links and the runoff are, because neither
 * fact is a secret: the repository is public, and the rule set is already
 * written out in full on the rules screen. Nothing here counts or names a
 * person, and nothing here reads the clock, so it stays cheap enough to poll.
 */
export const GET: RequestHandler = () => {
	// the app is only as up as the database it opens, and adapter-node will
	// happily keep answering after the file has gone
	let db = 'ok';
	try {
		getDb().prepare('select 1').get();
	} catch {
		db = 'unreachable';
	}

	return json(
		{ ok: db === 'ok', rev: revision(), rules: activeRules().id, demo: isDemo(), db },
		{
			status: db === 'ok' ? 200 : 503,
			headers: { 'cache-control': 'no-store' }
		}
	);
};
