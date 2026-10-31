import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb, immediate } from '$lib/server/db';
import { backTo } from '$lib/server/respond';
import { latestChangelogId } from '$lib/changelog';

export const load: PageServerLoad = async () => {
	redirect(303, '/');
};

export const actions: Actions = {
	// dismissing records the newest id, so every entry is shown exactly once
	dismiss: async ({ request, locals, url }) => {
		const person = locals.person;
		if (person) {
			const db = getDb();
			immediate(db, () =>
				db
					.prepare('UPDATE person SET changelog_seen = ? WHERE id = ?')
					.run(latestChangelogId(), person.id)
			);
		}
		const form = await request.formData();
		redirect(303, backTo(form.get('to'), url));
	}
};
