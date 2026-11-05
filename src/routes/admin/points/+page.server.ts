import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { activeRules } from '$lib/server/config';
import { requireAdmin } from '$lib/server/admin';
import { pointsRoster } from '$lib/server/manage';
import { participation, votingHabits, windowFor } from '$lib/server/stats';
import { currentWeek } from '$lib/server/weeks';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.person);
	const db = getDb();
	const week = currentWeek(db);
	return {
		week: week ? { closesAt: week.closes_at, special: week.special } : null,
		people: week ? pointsRoster(db, activeRules(), week.number) : [],
		history: participation(db, windowFor(db, 'app')),
		habits: votingHabits(db, windowFor(db, 'app'))
	};
};
