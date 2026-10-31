import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { activeRules, isDemo, origin } from '$lib/server/config';
import { logAdmin, recentAudit, requireAdmin } from '$lib/server/admin';
import {
	createPerson,
	managedPeople,
	renamePerson,
	setBank,
	setPersonActive,
	setPersonAdmin
} from '$lib/server/manage';
import { personById, rotateToken } from '$lib/server/people';
import { COLOURS } from '$lib/server/roster';
import { ruleFail } from '$lib/server/respond';

function linkFor(token: string): string {
	return `${origin().replace(/\/$/, '')}/u/${token}`;
}

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.person);
	const db = getDb();
	return {
		people: managedPeople(db),
		colours: COLOURS,
		banking: activeRules().banking,
		bankCap: activeRules().bankCap,
		audit: recentAudit(db, 15),
		demo: isDemo()
	};
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		try {
			const id = createPerson(getDb(), activeRules(), name, String(form.get('colour') ?? '#6fa8dc'));
			logAdmin(getDb(), person.id, 'person.add', id);
			// the link is shown once, here, and never again in any list
			const created = personById(getDb(), id)!;
			return { created: { name: created.name, link: linkFor(created.token) } };
		} catch (error) {
			return ruleFail(error);
		}
	},

	rename: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		try {
			renamePerson(getDb(), id, String(form.get('name') ?? ''), String(form.get('colour') ?? ''));
			logAdmin(getDb(), person.id, 'person.rename', id, String(form.get('name') ?? ''));
			return { saved: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	active: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const on = form.get('on') === '1';
		try {
			setPersonActive(getDb(), id, on);
			logAdmin(getDb(), person.id, on ? 'person.activate' : 'person.deactivate', id);
			return { saved: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	admin: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const on = form.get('on') === '1';
		try {
			setPersonAdmin(getDb(), person.id, id, on);
			logAdmin(getDb(), person.id, on ? 'person.grant_admin' : 'person.revoke_admin', id);
			return { saved: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	bank: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const balance = Number(form.get('balance'));
		try {
			setBank(getDb(), activeRules(), id, balance);
			logAdmin(getDb(), person.id, 'person.bank', id, String(balance));
			return { saved: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	rotate: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const target = personById(getDb(), id);
		if (!target) return ruleFail(new Error('no such person'));
		const token = rotateToken(getDb(), id);
		logAdmin(getDb(), person.id, 'person.rotate', id);
		return { created: { name: target.name, link: linkFor(token) } };
	}
};
