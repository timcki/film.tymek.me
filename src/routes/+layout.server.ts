import type { LayoutServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { activeRules } from '$lib/server/config';
import { currentWeek } from '$lib/server/weeks';
import { openRunoff } from '$lib/server/runoffs';
import { avatarUrl, bankBalance, spentInWeek } from '$lib/server/people';
import { langOf } from '$lib/i18n';
import { LANG_COOKIE } from '../hooks.server';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const db = getDb();
	const rules = activeRules();
	const week = currentWeek(db);
	const runoff = openRunoff(db);
	const person = locals.person;

	// §10: a rule-set change is announced for the week it happened in
	const lastChange = db
		.prepare('SELECT rules_id, week_number FROM rules_change ORDER BY id DESC LIMIT 1')
		.get() as { rules_id: string; week_number: number } | undefined;
	const rulesJustChanged = Boolean(
		lastChange && week && lastChange.week_number === week.number && lastChange.week_number > 1
	);

	const balance = person ? bankBalance(db, person.id) : 0;
	const spent = person && week ? spentInWeek(db, person.id, week.number) : 0;
	const budget = rules.banking ? balance : rules.pointsPerWeek;

	return {
		lang: langOf(cookies.get(LANG_COOKIE)),
		rulesJustChanged,
		person: person
			? {
					id: person.id,
					name: person.name,
					colour: person.colour,
					avatar: avatarUrl(person.id, person.avatar_updated_at),
					isAdmin: Boolean(person.is_admin),
					budget,
					spent,
					left: budget - spent
				}
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
			nominationsPerWeek: rules.nominationsPerWeek,
			shortlistSize: rules.shortlistSize
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
