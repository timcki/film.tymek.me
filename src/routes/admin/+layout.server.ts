import type { LayoutServerLoad } from './$types';
import { requireAdmin } from '$lib/server/admin';

export const load: LayoutServerLoad = async ({ locals }) => {
	// the hook already turned non-admins away; this is the check that matters
	const person = requireAdmin(locals.person);
	return { admin: { id: person.id, name: person.name } };
};
