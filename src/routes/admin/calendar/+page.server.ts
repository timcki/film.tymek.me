import type { Actions, PageServerLoad } from './$types';
import { getDb, immediate, type DB } from '$lib/server/db';
import { logAdmin, requireAdmin } from '$lib/server/admin';
import {
	addNight,
	allNights,
	deleteNight,
	moveNight,
	nextNight,
	setNightStatus
} from '$lib/server/schedule';
import { currentWeek, deadlineAnchor, syncOpenWeek } from '$lib/server/weeks';
import { ruleFail } from '$lib/server/respond';
import { RuleError } from '$lib/server/types';
import { fromLocalInput, iso, nextDeadline } from '$lib/server/time';
import { toLocalInput } from '$lib/datetime';
import { activeRules } from '$lib/server/config';
import { editSpecial, startExtraNight, startSpecial, stopSpecial } from '$lib/server/specials';
import { cleanCustom } from '$lib/server/custom-weeks';
import type { CustomWeek } from '$lib/custom-weeks';
import { customOf } from '$lib/custom-weeks';
import { lookAt, setLook } from '$lib/server/looks';
import { NOTICE_MAX, noticeAt, setNotice } from '$lib/server/notice';
import { isSpecialId, SPECIALS, specialOf } from '$lib/specials';
import { isLook, LOOKS } from '$lib/themes';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.person);
	const db = getDb();
	const week = immediate(db, () => syncOpenWeek(db)) ?? currentWeek(db);
	const nights = allNights(db);

	// which row, if any, is the one the current round will actually close on
	const closesAt = week?.closes_at ?? null;
	const drivingId = nights.find((n) => n.at === closesAt && n.status === 'planned')?.id ?? null;

	return {
		week: week
			? {
					number: week.number,
					status: week.status,
					closesAt: week.closes_at,
					special: specialOf(week.special)?.id ?? null,
					custom: customOf(week.custom)
				}
			: null,
		// §3.6: what an open round could be given over to, and whether it still can be taken back
		specials: Object.keys(SPECIALS),
		// §3.6: what the whole site could be made to wear, and what it wears now
		looks: [...LOOKS],
		look: lookAt(db),
		notice: noticeAt(db),
		noticeMax: NOTICE_MAX,
		specialPicks: week?.special
			? (
					db
						.prepare('SELECT COUNT(*) AS n FROM film WHERE special = ? AND added_week = ?')
						.get(week.special, week.number) as { n: number }
				).n
			: 0,
		drivingId,
		nights,
		// what the round would fall back to with nothing planned
		fallback: week
			? iso(nextDeadline(deadlineAnchor(db, week.number, new Date(week.opens_at))))
			: null,
		// the picker opens on the next Thursday at 20:00, the old default
		suggested: toLocalInput(nextNight(db, new Date()))
	};
};

function whenFrom(form: FormData, key = 'at'): Date {
	try {
		return fromLocalInput(String(form.get(key) ?? ''));
	} catch {
		throw new RuleError('bad_date', 'give a date and a time');
	}
}

/** every calendar edit repoints the open round in the same transaction */
function edit(fn: (db: DB) => void): void {
	const db = getDb();
	immediate(db, () => {
		fn(db);
		syncOpenWeek(db);
	});
}

/** §3.7: the setup form, read the same way to start a week and to put one right */
function customFrom(form: FormData): CustomWeek {
	const text = (key: string) => String(form.get(key) ?? '');
	const all = (key: string) => form.getAll(key).map(String);
	return cleanCustom({
		name: text('name'),
		about: text('about'),
		picks: text('picks'),
		countries: all('countries'),
		languages: all('languages'),
		genres: all('genres'),
		yearFrom: text('yearFrom'),
		yearTo: text('yearTo'),
		runtimeMin: text('runtimeMin'),
		runtimeMax: text('runtimeMax'),
		directors: text('directors'),
		coded: all('coded')
	});
}

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const note = String(form.get('note') ?? '');
		try {
			const at = whenFrom(form);
			edit((db) => {
				addNight(db, at, note);
				logAdmin(db, person.id, 'night.add', iso(at), note || null);
			});
			return { added: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	move: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const note = String(form.get('note') ?? '');
		try {
			const at = whenFrom(form);
			edit((db) => {
				moveNight(db, id, at, note);
				logAdmin(db, person.id, 'night.move', iso(at), note || null);
			});
			return { moved: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	skip: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const restore = form.get('restore') === '1';
		try {
			edit((db) => {
				setNightStatus(db, id, restore ? 'planned' : 'skipped');
				logAdmin(db, person.id, restore ? 'night.restore' : 'night.skip', String(id));
			});
			return { skipped: !restore };
		} catch (error) {
			return ruleFail(error);
		}
	},

	// §3.6: one picker for how the round votes; the empty choice is the list
	special: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = String(form.get('special') ?? '');
		try {
			if (!id) {
				const week = currentWeek(getDb());
				stopSpecial(getDb(), activeRules());
				logAdmin(getDb(), person.id, 'round.unspecial', String(week?.number ?? ''));
				return { unspecial: true };
			}
			if (!isSpecialId(id)) throw new RuleError('no_special', 'no such special round');
			const custom = customFrom(form);
			const extra = form.get('extra') ? whenFrom(form, 'extra') : null;
			const week = extra
				? startExtraNight(getDb(), activeRules(), id, custom, extra)
				: startSpecial(getDb(), activeRules(), id, custom);
			if (extra) logAdmin(getDb(), person.id, 'night.add', iso(extra), custom.name ?? null);
			logAdmin(getDb(), person.id, 'round.special', String(week.number), custom.name ?? id);
			return { special: id };
		} catch (error) {
			return ruleFail(error);
		}
	},

	// §3.7: a running week's name and numbers; its rules come along only while they are offered
	customize: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		try {
			const db = getDb();
			let custom = customFrom(form);
			if (!form.has('rules')) {
				custom = { ...custom, rules: customOf(currentWeek(db)?.custom)?.rules ?? {} };
			}
			const week = editSpecial(db, custom);
			logAdmin(db, person.id, 'round.customize', String(week.number), custom.name);
			return { customized: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	// §3.6: what the whole site wears, whatever the round votes by
	look: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const look = String(form.get('look') ?? '');
		try {
			if (look && !isLook(look)) throw new RuleError('no_look', 'no such look');
			setLook(getDb(), isLook(look) ? look : null);
			logAdmin(getDb(), person.id, 'site.look', look || 'default');
			return { look: look || null };
		} catch (error) {
			return ruleFail(error);
		}
	},

	notice: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		try {
			const notice = setNotice(getDb(), String(form.get('notice') ?? ''));
			logAdmin(getDb(), person.id, 'site.notice', null, notice);
			return { notice };
		} catch (error) {
			return ruleFail(error);
		}
	},

	remove: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = Number(form.get('id'));
		try {
			edit((db) => {
				deleteNight(db, id);
				logAdmin(db, person.id, 'night.delete', String(id));
			});
			return { removed: true };
		} catch (error) {
			return ruleFail(error);
		}
	}
};
