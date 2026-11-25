import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { isDemo } from '$lib/server/config';
import { demoDefault } from '$lib/server/demo';
import { COOKIE_MAX_AGE, PERSON_COOKIE } from '../../hooks.server';

/**
 * The demo's old front door, and 404 on the real app, where the only way in is
 * a personal link and there is nobody to hand out.
 *
 * The demo now hands a visitor a persona on any page (hooks.server.ts), so this
 * is kept for the links that already point here. Somebody already carrying a
 * persona keeps it, since this is a door rather than a reset, and the bar is
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
