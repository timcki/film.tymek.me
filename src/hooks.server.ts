import type { Handle } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { isAdmin, seedAdmins } from '$lib/server/admin';
import { personByToken } from '$lib/server/people';
import { startScheduler } from '$lib/server/scheduler';

export const PERSON_COOKIE = 'fn_person';
export const DEVICE_COOKIE = 'fn_device';
export const LANG_COOKIE = 'fn_lang';
/** the browser cap; re-set on every request so regular visitors never expire */
export const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

// the build imports this module to analyse the routes, with no database to open,
// which is the same reason startScheduler swallows its own first failure
try {
	seedAdmins(getDb());
} catch (error) {
	console.error('[admin] could not seed the admin flags', error);
}
startScheduler();

/** the runoff is reachable without a personal link: being in the room is the credential */
function isOpenRoute(pathname: string): boolean {
	return pathname.startsWith('/u/') || pathname.startsWith('/f/') || pathname === '/favicon.ico';
}

const LOCKED_OUT = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wieczorki filmowe</title>
<style>
 body{background:#0f1012;color:#eef0f3;font:16px/1.6 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;
      display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;padding:24px}
 main{max-width:34rem} h1{font-size:1.6rem;margin:0 0 .6rem} p{color:#8b909a;margin:0 0 .4rem}
</style></head>
<body><main>
<h1>Wieczorki filmowe</h1>
<p>Otwórz swój prywatny link, żeby wejść. Jeśli go zgubiłeś, napisz do Tymka.</p>
<p>Open your personal link to get in.</p>
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

	// nobody else needs to learn that /admin is a page; each route checks again
	if (event.url.pathname.startsWith('/admin') && !isAdmin(person)) {
		return new Response('Not found', { status: 404 });
	}

	return resolve(event);
};
