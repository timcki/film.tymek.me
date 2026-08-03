import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { personByToken } from '$lib/server/people';
import { COOKIE_MAX_AGE, PERSON_COOKIE } from '../../../hooks.server';

/** §5.1: the personal link. Sets the cookie and drops you on the list. */
export const GET: RequestHandler = ({ params, cookies, url }) => {
	const person = personByToken(getDb(), params.token);
	if (!person) error(404, "this link isn't valid");

	cookies.set(PERSON_COOKIE, person.token, {
		httpOnly: true,
		secure: url.protocol === 'https:',
		sameSite: 'lax',
		path: '/',
		maxAge: COOKIE_MAX_AGE
	});

	redirect(303, '/');
};
