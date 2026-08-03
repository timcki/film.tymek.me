import type { LayoutServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { activeRules } from '$lib/server/config';
import { currentWeek } from '$lib/server/weeks';
import { openRunoff } from '$lib/server/runoffs';

export const load: LayoutServerLoad = async ({ locals }) => {
	const db = getDb();
	const rules = activeRules();
	const week = currentWeek(db);
	const runoff = openRunoff(db);

	// §10: a rule-set change is announced for the week it happened in
	const lastChange = db
		.prepare('SELECT rules_id, week_number FROM rules_change ORDER BY id DESC LIMIT 1')
		.get() as { rules_id: string; week_number: number } | undefined;
	const rulesJustChanged = Boolean(
		lastChange && week && lastChange.week_number === week.number && lastChange.week_number > 1
	);

	return {
		rulesJustChanged,
		person: locals.person
			? { id: locals.person.id, name: locals.person.name, colour: locals.person.colour }
			: null,
		rules: {
			id: rules.id,
			label: rules.label,
			pointsPerWeek: rules.pointsPerWeek,
			banking: rules.banking,
			bankCap: rules.bankCap,
			scoring: rules.scoring,
			decayFactor: rules.decayFactor,
			attrition: rules.attrition,
			nominationsPerWeek: rules.nominationsPerWeek
		},
		week: week
			? {
					number: week.number,
					status: week.status,
					closesAt: week.closes_at
				}
			: null,
		runoffCode: runoff && !runoff.closed_at ? runoff.code : null
	};
};
