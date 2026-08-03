import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { activeRules, origin } from '$lib/server/config';
import { bankBalance, rotateToken } from '$lib/server/people';
import { qrSvg } from '$lib/server/qr';
import { COOKIE_MAX_AGE, PERSON_COOKIE } from '../../hooks.server';

function personalLink(token: string): string {
	return `${origin().replace(/\/$/, '')}/u/${token}`;
}

export const load: PageServerLoad = async ({ locals }) => {
	const db = getDb();
	const person = locals.person!;
	const rules = activeRules();

	const spent = (
		db
			.prepare('SELECT COALESCE(SUM(points), 0) AS total FROM ballot WHERE person_id = ?')
			.get(person.id) as { total: number }
	).total;

	const nominatedWatched = (
		db
			.prepare(
				`SELECT COUNT(*) AS n FROM film WHERE added_by = ? AND status = 'watched'`
			)
			.get(person.id) as { n: number }
	).n;

	// the longest run of consecutive weeks this person kept points on one film
	const rows = db
		.prepare('SELECT film_id, week_number FROM ballot WHERE person_id = ?')
		.all(person.id) as { film_id: number; week_number: number }[];
	const byFilm = new Map<number, Set<number>>();
	for (const row of rows) {
		const weeks = byFilm.get(row.film_id) ?? new Set<number>();
		weeks.add(row.week_number);
		byFilm.set(row.film_id, weeks);
	}
	let longestCampaign = 0;
	for (const weeks of byFilm.values()) {
		for (const start of weeks) {
			let run = 0;
			while (weeks.has(start + run)) run++;
			if (run > longestCampaign) longestCampaign = run;
		}
	}

	return {
		link: personalLink(person.token),
		qr: await qrSvg(personalLink(person.token), 260),
		stats: {
			spent,
			nominatedWatched,
			longestCampaign,
			bank: rules.banking ? bankBalance(db, person.id) : null
		}
	};
};

export const actions: Actions = {
	// §5.3: invalidates the old link everywhere, and re-authenticates this device
	rotate: async ({ locals, cookies, url }) => {
		const token = rotateToken(getDb(), locals.person!.id);
		cookies.set(PERSON_COOKIE, token, {
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'lax',
			path: '/',
			maxAge: COOKIE_MAX_AGE
		});
		return { rotated: true };
	}
};
