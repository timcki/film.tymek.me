import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { logAdmin, requireAdmin } from '$lib/server/admin';
import {
	addNight,
	allNights,
	deleteNight,
	moveNight,
	nextNight,
	setNightStatus
} from '$lib/server/schedule';
import { currentWeek, syncOpenWeek } from '$lib/server/weeks';
import { ruleFail } from '$lib/server/respond';
import { RuleError } from '$lib/server/types';
import { fromLocalInput, iso, nextDeadline } from '$lib/server/time';
import { toLocalInput } from '$lib/datetime';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.person);
	const db = getDb();
	const week = syncOpenWeek(db) ?? currentWeek(db);
	const nights = allNights(db);

	// which row, if any, is the one the current round will actually close on
	const closesAt = week?.closes_at ?? null;
	const drivingId = nights.find((n) => n.at === closesAt && n.status === 'planned')?.id ?? null;

	return {
		week: week ? { number: week.number, status: week.status, closesAt: week.closes_at } : null,
		drivingId,
		nights,
		// what the round would fall back to with nothing planned
		fallback: week ? iso(nextDeadline(new Date(week.opens_at))) : null,
		// the picker opens on the next Thursday at 20:00, the old default
		suggested: toLocalInput(nextNight(db, new Date()))
	};
};

function whenFrom(form: FormData): Date {
	try {
		return fromLocalInput(String(form.get('at') ?? ''));
	} catch {
		throw new RuleError('bad_date', 'give a date and a time');
	}
}

/** every calendar edit repoints the open round before it returns */
function afterEdit(): void {
	syncOpenWeek(getDb());
}

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const note = String(form.get('note') ?? '');
		try {
			const at = whenFrom(form);
			addNight(getDb(), at, note);
			logAdmin(getDb(), person.id, 'night.add', iso(at), note || null);
			afterEdit();
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
			moveNight(getDb(), id, at, note);
			logAdmin(getDb(), person.id, 'night.move', iso(at), note || null);
			afterEdit();
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
			setNightStatus(getDb(), id, restore ? 'planned' : 'skipped');
			logAdmin(getDb(), person.id, restore ? 'night.restore' : 'night.skip', String(id));
			afterEdit();
			return { skipped: !restore };
		} catch (error) {
			return ruleFail(error);
		}
	},

	remove: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = Number(form.get('id'));
		try {
			deleteNight(getDb(), id);
			logAdmin(getDb(), person.id, 'night.delete', String(id));
			afterEdit();
			return { removed: true };
		} catch (error) {
			return ruleFail(error);
		}
	}
};
