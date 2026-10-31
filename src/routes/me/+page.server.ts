import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { activeRules, isDemo, origin } from '$lib/server/config';
import { bankBalance, clearAvatar, rotateToken, setAvatar } from '$lib/server/people';
import { currentWeek } from '$lib/server/weeks';
import { listClock } from '$lib/server/scoring';
import { XP, xpBreakdown } from '$lib/server/xp';
import { qrSvg } from '$lib/server/qr';
import { ruleFail } from '$lib/server/respond';
import { RuleError } from '$lib/server/types';
import { COOKIE_MAX_AGE, PERSON_COOKIE } from '../../hooks.server';

function personalLink(token: string): string {
	return `${origin().replace(/\/$/, '')}/u/${token}`;
}

export const load: PageServerLoad = async ({ locals }) => {
	const db = getDb();
	const person = locals.person!;
	const rules = activeRules();
	const week = currentWeek(db);

	const spent = (
		db
			.prepare('SELECT COALESCE(SUM(points), 0) AS total FROM ballot WHERE person_id = ?')
			.get(person.id) as { total: number }
	).total;

	const nominatedWatched = (
		db
			.prepare(
				`SELECT COUNT(*) AS n FROM film WHERE added_by = ? AND status = 'watched' AND outing IS NULL`
			)
			.get(person.id) as { n: number }
	).n;

	const nominatedThisWeek = week
		? Boolean(
				db
					.prepare('SELECT 1 FROM film WHERE added_by = ? AND added_week = ? AND special IS NULL')
					.get(person.id, week.number)
			)
		: false;

	// the longest run of consecutive weeks this person kept points on one film,
	// on the list's clock, so sleeping through a special round (§3.6) is no break
	const clock = listClock(db);
	const rows = db
		.prepare('SELECT film_id, week_number FROM ballot WHERE person_id = ?')
		.all(person.id) as { film_id: number; week_number: number }[];
	const byFilm = new Map<number, Set<number>>();
	for (const row of rows) {
		const weeks = byFilm.get(row.film_id) ?? new Set<number>();
		weeks.add(clock(row.week_number));
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
			nominatedThisWeek,
			bank: rules.banking ? bankBalance(db, person.id) : null
		},
		// derived live for the one person looking; the cached column serves lists
		xp: xpBreakdown(db, person.id),
		xpRates: XP
	};
};

export const actions: Actions = {
	// §5.3: invalidates the old link everywhere, and re-authenticates this device
	rotate: async ({ locals, cookies, url }) => {
		// the demo's people are shared, so rotating one is not a person securing
		// their own link: it takes everybody else reading over that shoulder back
		// to the default persona, and there is no lost link to replace anyway
		if (isDemo()) return ruleFail(new RuleError('demo_no_rotate', 'the demo has no links to roll'));
		const token = rotateToken(getDb(), locals.person!.id);
		cookies.set(PERSON_COOKIE, token, {
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'lax',
			path: '/',
			maxAge: COOKIE_MAX_AGE
		});
		return { rotated: true };
	},

	avatar: async ({ request, locals }) => {
		const form = await request.formData();
		const file = form.get('picture');
		try {
			// the demo is a public door, and whatever a stranger uploads would sit on
			// somebody else's face until the next hourly rebuild
			if (isDemo()) throw new RuleError('demo_no_upload', 'the demo does not take uploads');
			if (!(file instanceof File)) throw new RuleError('empty_file', 'no file was sent');
			setAvatar(getDb(), locals.person!.id, new Uint8Array(await file.arrayBuffer()));
			return { avatarSaved: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	removeAvatar: async ({ locals }) => {
		clearAvatar(getDb(), locals.person!.id);
		return { avatarRemoved: true };
	}
};
