import type { LayoutServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { activeRules, demoHome, isDemo } from '$lib/server/config';
import { PERSONAS, personas, type PersonaKind } from '$lib/server/demo';
import { currentWeek } from '$lib/server/weeks';
import { roundEvenings } from '$lib/server/evenings';
import { openRunoff } from '$lib/server/runoffs';
import { lookAt } from '$lib/server/looks';
import { noticeAt } from '$lib/server/notice';
import { avatarUrl, bankBalance, spentInRound } from '$lib/server/people';
import { langOf } from '$lib/i18n';
import { unseenChangelog } from '$lib/changelog';
import { LOOK_THEME, accentOf, bananaOf, themeOf } from '$lib/themes';
import { ACCENT_COOKIE, BANANA_COOKIE, LANG_COOKIE, THEME_COOKIE } from '../hooks.server';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const db = getDb();
	const rules = activeRules();
	const week = currentWeek(db);
	const runoff = openRunoff(db);
	const person = locals.person;

	const balance = person ? bankBalance(db, person.id) : 0;
	const budget = rules.banking ? balance : rules.pointsPerWeek;
	// the bar draws a ticket for each point there is, so it never draws more than
	// the budget: a round that carries what an earlier special night had spent,
	// on top of votes cast before that carrying existed, can come to more
	const spent = person && week ? Math.min(budget, spentInRound(db, person.id, week.number)) : 0;

	const lang = langOf(cookies.get(LANG_COOKIE), isDemo() ? 'en' : 'pl');

	// the demo's bar has to say who you currently are, which means naming the
	// three it can offer and which of them is holding the phone
	const cast = isDemo() ? personas(db) : null;
	const demo = cast
		? {
				home: demoHome(),
				who: (PERSONAS.find((kind) => cast[kind]?.id === person?.id) ?? null) as PersonaKind | null,
				offer: PERSONAS.filter((kind) => cast[kind]).map((kind) => ({
					kind,
					name: cast[kind]!.name
				}))
			}
		: null;

	// §3.6: the admin's look already on <html>, for the few things drawn rather than coloured
	const look = lookAt(db);
	return {
		lang,
		demo,
		// the palette is already on <html>; the layout only needs it to know
		// which half of the switch is lit. A special look brings its own, as in
		// hooks.server.ts
		theme: look ? LOOK_THEME[look] : themeOf(cookies.get(THEME_COOKIE)),
		banana: bananaOf(cookies.get(BANANA_COOKIE)),
		accent: accentOf(cookies.get(ACCENT_COOKIE)),
		look,
		notice: person ? noticeAt(db) : null,
		// news this person has not dismissed yet, already said in their language
		changelog: person
			? unseenChangelog(person.changelog_seen).map((entry) => ({
					id: entry.id,
					date: entry.date,
					title: entry.title[lang],
					body: entry.body[lang]
				}))
			: [],
		person: person
			? {
					id: person.id,
					name: person.name,
					colour: person.colour,
					avatar: avatarUrl(person.id, person.avatar_updated_at),
					isAdmin: Boolean(person.is_admin),
					xp: person.xp,
					budget,
					spent,
					// a round put to sleep and woken can carry more than a fresh budget
					left: Math.max(0, budget - spent)
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
			shortlistSize: rules.shortlistSize,
			voteGraceSeconds: rules.voteGraceSeconds
		},
		week: week
			? {
					number: week.number,
					status: week.status,
					special: week.special,
					custom: week.custom,
					// both ends, so the header can draw how much of the round is gone
					opensAt: week.opens_at,
					closesAt: week.closes_at
				}
			: null,
		runoffCode: runoff && !runoff.closed_at ? runoff.code : null,
		// what each round is called on screen, by week number
		evenings: roundEvenings(db)
	};
};
