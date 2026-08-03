import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/admin';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.person);
	redirect(307, '/admin/calendar');
};
