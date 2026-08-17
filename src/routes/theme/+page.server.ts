import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { themeOf } from '$lib/themes';
import { THEME_COOKIE, COOKIE_MAX_AGE } from '../../hooks.server';

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
	}
};
