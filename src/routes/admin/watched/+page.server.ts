import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { logAdmin, requireAdmin } from '$lib/server/admin';
import {
	deleteFilm,
	editFilm,
	filmEditLookedUp,
	moveWatched,
	reassignFilm,
	recordWatched,
	watchedRecord
} from '$lib/server/manage';
import { allPeople, avatarUrl } from '$lib/server/people';
import { detailsOf, NO_DETAILS } from '$lib/server/tmdb';
import { fromLocalInput } from '$lib/server/time';
import { ruleFail } from '$lib/server/respond';
import { RuleError } from '$lib/server/types';
import { toLocalInput } from '$lib/datetime';
import { isOuting } from '$lib/outings';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.person);
	const db = getDb();
	return {
		films: watchedRecord(db),
		// inactive people stay pickable: the stand-in account holding the backlog is
		// one of them, and a film cannot be taken off it without showing it first
		people: allPeople(db).map((person) => ({
			id: person.id,
			name: person.name,
			colour: person.colour,
			active: person.active,
			avatar: avatarUrl(person.id, person.avatar_updated_at)
		})),
		now: toLocalInput(new Date())
	};
};

const num = (form: FormData, key: string): number | null => {
	const raw = String(form.get(key) ?? '').trim();
	return raw ? Number(raw) : null;
};

function whenFrom(form: FormData): Date {
	try {
		return fromLocalInput(String(form.get('at') ?? ''));
	} catch {
		throw new RuleError('bad_date', 'give a date and a time');
	}
}

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const tmdbId = num(form, 'tmdbId');
		const where = String(form.get('outing') ?? '');
		try {
			const at = whenFrom(form);
			// §8.2: fetched once, when the film is actually written down
			const details = tmdbId ? await detailsOf(tmdbId) : NO_DETAILS;
			const id = recordWatched(getDb(), {
				title: String(form.get('title') ?? ''),
				year: num(form, 'year'),
				...details,
				tmdbId,
				posterUrl: String(form.get('poster') ?? '') || null,
				overview: String(form.get('overview') ?? '') || null,
				personId: String(form.get('personId') ?? ''),
				at,
				outing: isOuting(where) ? where : null,
				allowDuplicate: form.get('allowDuplicate') === 'yes'
			});
			logAdmin(
				getDb(),
				person.id,
				'film.record',
				String(id),
				`${String(form.get('title') ?? '')}, ${isOuting(where) ? where : 'night'}`
			);
			return { added: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	edit: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = Number(form.get('id'));
		try {
			editFilm(getDb(), id, await filmEditLookedUp(form));
			logAdmin(getDb(), person.id, 'film.edit', String(id), String(form.get('title') ?? ''));
			return { saved: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	move: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const where = String(form.get('outing') ?? '');
		try {
			const outing = isOuting(where) ? where : null;
			moveWatched(getDb(), id, whenFrom(form), outing);
			logAdmin(getDb(), person.id, 'film.move', String(id), outing ?? 'night');
			return { saved: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	credit: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const to = String(form.get('personId') ?? '');
		try {
			reassignFilm(getDb(), id, to);
			logAdmin(getDb(), person.id, 'film.reassign', String(id), to);
			return { saved: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	remove: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = Number(form.get('id'));
		try {
			deleteFilm(getDb(), id);
			logAdmin(getDb(), person.id, 'film.delete', String(id));
			return { saved: true };
		} catch (error) {
			return ruleFail(error);
		}
	}
};
