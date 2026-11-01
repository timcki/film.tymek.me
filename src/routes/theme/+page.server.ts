import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { accentOf, bananaOf, themeOf } from '$lib/themes';
import { ACCENT_COOKIE, BANANA_COOKIE, THEME_COOKIE, COOKIE_MAX_AGE } from '../../hooks.server';

export const load: PageServerLoad = async () => {
	redirect(303, '/');
};

export const actions: Actions = {
	set: async ({ request, cookies, url }) => {
		const form = await request.formData();
		cookies.set(THEME_COOKIE, themeOf(String(form.get('theme') ?? '')), {
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'lax',
			path: '/',
			maxAge: COOKIE_MAX_AGE
		});
		// only ever back into this app, never to a URL someone else supplied
		const to = String(form.get('to') ?? '/');
		redirect(303, to.startsWith('/') && !to.startsWith('//') ? to : '/');
	},
	// a toggle rather than a choice: the form says what it should become
	banana: async ({ request, cookies, url }) => {
		const form = await request.formData();
		cookies.set(BANANA_COOKIE, bananaOf(String(form.get('banana') ?? '')) ? '1' : '0', {
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'lax',
			path: '/',
			maxAge: COOKIE_MAX_AGE
		});
		const to = String(form.get('to') ?? '/');
		redirect(303, to.startsWith('/') && !to.startsWith('//') ? to : '/');
	},
	accent: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const keep = {
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'lax' as const,
			path: '/',
			maxAge: COOKIE_MAX_AGE
		};
		cookies.set(ACCENT_COOKIE, accentOf(String(form.get('accent') ?? '')), keep);
		// bananas are the switch's last dot, so a colour picked puts them away
		cookies.set(BANANA_COOKIE, '0', keep);
		const to = String(form.get('to') ?? '/');
		redirect(303, to.startsWith('/') && !to.startsWith('//') ? to : '/');
	}
};
