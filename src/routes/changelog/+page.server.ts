import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { latestChangelogId } from '$lib/changelog';

export const load: PageServerLoad = async () => {
	redirect(303, '/');
};

export const actions: Actions = {
	// dismissing records the newest id, so every entry is shown exactly once
	dismiss: async ({ request, locals }) => {
		if (locals.person) {
			getDb()
				.prepare('UPDATE person SET changelog_seen = ? WHERE id = ?')
				.run(latestChangelogId(), locals.person.id);
		}
		const form = await request.formData();
		const to = String(form.get('to') ?? '/');
		redirect(303, to.startsWith('/') && !to.startsWith('//') ? to : '/');
	}
};
