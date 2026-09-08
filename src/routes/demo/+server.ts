import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { isDemo } from '$lib/server/config';
import { demoDefault } from '$lib/server/demo';
import { COOKIE_MAX_AGE, PERSON_COOKIE } from '../../hooks.server';

/**
 * The demo's front door, and 404 on the real app, where the only way in is a
 * personal link and there is nobody to hand out.
 *
 * A visitor arriving with nothing is handed one of the made-up people here and
 * nowhere else, so the gate at the root stays a real gate: what a stranger sees
 * of this app is the first thing the demo has to show. Somebody already carrying
 * a persona keeps it, since this is a door rather than a reset, and the bar is
 * what swaps who you are.
 */
export const GET: RequestHandler = ({ url, cookies, locals }) => {
	if (!isDemo()) error(404, 'Not found');

	if (!locals.person) {
		const person = demoDefault(getDb());
		if (!person) error(404, 'Not found');
		cookies.set(PERSON_COOKIE, person.token, {
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'lax',
			path: '/',
			maxAge: COOKIE_MAX_AGE
		});
	}

	redirect(303, '/');
};
