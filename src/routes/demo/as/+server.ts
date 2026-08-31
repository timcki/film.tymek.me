import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { isDemo } from '$lib/server/config';
import { isPersonaKind, personas } from '$lib/server/demo';
import { COOKIE_MAX_AGE, PERSON_COOKIE } from '../../../hooks.server';

/**
 * The demo's persona switch, and 404 everywhere else: on the real app there is
 * nobody to switch to, and the personal link is the only way in by design.
 *
 * A plain link rather than a form, because the bar it hangs off has to work on a
 * page that has not booted yet, and because being somebody else in a demo is not
 * a mutation worth protecting.
 */
export const GET: RequestHandler = ({ url, cookies }) => {
	if (!isDemo()) error(404, 'Not found');

	const who = url.searchParams.get('who');
	if (!isPersonaKind(who)) error(404, 'Not found');
	const person = personas(getDb())[who];
	if (!person) error(404, 'Not found');

	cookies.set(PERSON_COOKIE, person.token, {
		httpOnly: true,
		secure: url.protocol === 'https:',
		sameSite: 'lax',
		path: '/',
		maxAge: COOKIE_MAX_AGE
	});

	// back to the page they were on, and only ever to a page of this app
	const to = url.searchParams.get('to');
	redirect(303, to && to.startsWith('/') && !to.startsWith('//') ? to : '/');
};
