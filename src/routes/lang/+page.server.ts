import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { backTo } from '$lib/server/respond';
import { langOf } from '$lib/i18n';
import { LANG_COOKIE, COOKIE_MAX_AGE } from '../../hooks.server';

export const load: PageServerLoad = async () => {
	redirect(303, '/');
};

export const actions: Actions = {
	set: async ({ request, cookies, url }) => {
		const form = await request.formData();
		cookies.set(LANG_COOKIE, langOf(String(form.get('lang') ?? '')), {
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'lax',
			path: '/',
			maxAge: COOKIE_MAX_AGE
		});
		redirect(303, backTo(form.get('to'), url));
	}
};
