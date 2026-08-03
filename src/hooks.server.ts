import type { Handle } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { personByToken } from '$lib/server/people';
import { startScheduler } from '$lib/server/scheduler';

export const PERSON_COOKIE = 'fn_person';
export const DEVICE_COOKIE = 'fn_device';
/** the browser cap; re-set on every request so regular visitors never expire */
export const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

startScheduler();

/** the runoff is reachable without a personal link: being in the room is the credential */
function isOpenRoute(pathname: string): boolean {
	return pathname.startsWith('/u/') || pathname.startsWith('/f/') || pathname === '/favicon.ico';
}

const LOCKED_OUT = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Film Night</title>
<style>
 body{background:#0d0c10;color:#eceaf2;font:16px/1.6 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;
      display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;padding:24px}
 main{max-width:34rem} h1{font-size:1.6rem;margin:0 0 .6rem} p{color:#9d99ac;margin:0}
</style></head>
<body><main>
<h1>Film Night</h1>
<p>Open your personal link to get in. Ask Tymek if you have lost it.</p>
</main></body></html>`;

export const handle: Handle = async ({ event, resolve }) => {
	const db = getDb();
	const token = event.cookies.get(PERSON_COOKIE);
	const person = token ? (personByToken(db, token) ?? null) : null;
	event.locals.person = person;
	event.locals.deviceId = event.cookies.get(DEVICE_COOKIE) ?? null;

	if (person) {
		event.cookies.set(PERSON_COOKIE, person.token, {
			httpOnly: true,
			secure: event.url.protocol === 'https:',
			sameSite: 'lax',
			path: '/',
			maxAge: COOKIE_MAX_AGE
		});
	}

	if (!person && !isOpenRoute(event.url.pathname)) {
		return new Response(LOCKED_OUT, {
			status: 401,
			headers: { 'content-type': 'text/html; charset=utf-8' }
		});
	}

	return resolve(event);
};
