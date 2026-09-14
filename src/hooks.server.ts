import type { Handle } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { isAdmin, seedAdmins } from '$lib/server/admin';
import { isDemo } from '$lib/server/config';
import { personByToken } from '$lib/server/people';
import { limiter } from '$lib/server/ratelimit';
import { startScheduler } from '$lib/server/scheduler';
import { THEME_BG, themeOf } from '$lib/themes';

export const PERSON_COOKIE = 'fn_person';
export const DEVICE_COOKIE = 'fn_device';
export const LANG_COOKIE = 'fn_lang';
export const THEME_COOKIE = 'fn_theme';
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
	if (pathname.startsWith('/u/') || pathname.startsWith('/f/') || pathname === '/favicon.ico') {
		return true;
	}
	// what commit is deployed and which rule set it runs, which the gate has no
	// business withholding: both are public already, and a check only the people
	// behind the gate can make is one nobody makes
	if (pathname === '/healthz') return true;
	// the demo's own door, which is the one thing a visitor arrives holding nothing
	// for; everything behind it is the ordinary app reading an ordinary person
	return isDemo() && (pathname === '/demo' || pathname.startsWith('/demo/'));
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

/**
 * The same door, on the demo, where it is worth standing in front of: an invite
 * is how this app actually greets a stranger, and a showcase that skipped it
 * would be hiding the part that explains why the rest looks the way it does.
 * The way in is a link rather than a code, because there is nobody to ask.
 */
const DEMO_DOOR = LOCKED_OUT.replace(
	'</main>',
	`<p style="margin-top:1.4rem"><a href="/demo" style="color:#eef0f3">Open the demo &rarr;</a></p>
<p style="font-size:.85rem">No link needed, and nobody you meet inside is real.</p>
</main>`
);

/**
 * Everything a visitor writes in the demo is written under one of its made-up
 * people and stands until the next hourly rebuild, so the ceiling is on writing
 * at all rather than on any one action: a person clicking around comes nowhere
 * near it, and a script pointed at the door gives up well before the hour is out.
 */
const WRITES_PER_MINUTE = 40;
const overWriteRate = limiter(WRITES_PER_MINUTE);

/**
 * The demo is a public door, and a search engine indexing made-up people saying
 * made-up things about real films helps nobody. Set on every response, the early
 * ones included, rather than only on the pages that render.
 */
function unindexed(response: Response): Response {
	if (isDemo()) response.headers.set('X-Robots-Tag', 'noindex');
	return response;
}

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

	if (
		isDemo() &&
		event.request.method !== 'GET' &&
		event.request.method !== 'HEAD' &&
		overWriteRate(event.getClientAddress(), Date.now())
	) {
		return unindexed(new Response('Too many writes; give it a minute', { status: 429 }));
	}

	if (!person && !isOpenRoute(event.url.pathname)) {
		return unindexed(
			new Response(isDemo() ? DEMO_DOOR : LOCKED_OUT, {
				status: 401,
				headers: { 'content-type': 'text/html; charset=utf-8' }
			})
		);
	}

	// nobody else needs to learn that /admin is a page; each route checks again
	if (event.url.pathname.startsWith('/admin') && !isAdmin(person)) {
		return unindexed(new Response('Not found', { status: 404 }));
	}

	// the palette is dressed onto <html> here rather than by a script on the
	// client, so the first paint is already the right colour, and so is the
	// status bar tint iOS reads off the meta tag. On auto the tint is left to
	// the phone, which is what the media-scoped pair is for
	const theme = themeOf(event.cookies.get(THEME_COOKIE));
	const tint =
		theme === 'auto'
			? `<meta name="theme-color" content="${THEME_BG.dark}" media="(prefers-color-scheme: dark)" />
		<meta name="theme-color" content="${THEME_BG.light}" media="(prefers-color-scheme: light)" />`
			: `<meta name="theme-color" content="${THEME_BG[theme]}" />`;

	return unindexed(
		await resolve(event, {
			transformPageChunk: ({ html }) =>
				html
					.replaceAll('%fn.theme%', theme)
					.replace('%fn.scheme%', theme === 'auto' ? 'light dark' : theme)
					.replace('%fn.tint%', tint)
		})
	);
};
