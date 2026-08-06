import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { logAdmin, requireAdmin } from '$lib/server/admin';
import {
	addArchivalFilm,
	archiveByWeek,
	deleteFilm,
	setFilmAttribution,
	unattributedCount
} from '$lib/server/manage';
import { allPeople, avatarUrl } from '$lib/server/people';
import { detailsOf } from '$lib/server/tmdb';
import { ruleFail } from '$lib/server/respond';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.person);
	const db = getDb();
	return {
		weeks: archiveByWeek(db),
		// inactive people stay pickable: the stand-in account holding the backlog is
		// one of them, and a film cannot be taken off it without showing it first
		people: allPeople(db).map((person) => ({
			id: person.id,
			name: person.name,
			colour: person.colour,
			active: person.active,
			avatar: avatarUrl(person.id, person.avatar_updated_at)
		})),
		progress: unattributedCount(db)
	};
};

const num = (form: FormData, key: string): number | null => {
	const raw = String(form.get(key) ?? '').trim();
	return raw ? Number(raw) : null;
};

export const actions: Actions = {
	/** who suggested it and which night it was, saved together */
	attribute: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const to = String(form.get('personId') ?? '');
		const week = Number(form.get('week'));
		try {
			setFilmAttribution(getDb(), id, to, week);
			logAdmin(getDb(), person.id, 'film.attribute', String(id), `${to}, week ${week}`);
			return { saved: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	add: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const tmdbId = num(form, 'tmdbId');
		// §8.2: fetched once, when the film is actually written down
		const details = tmdbId
			? await detailsOf(tmdbId)
			: { director: null, genre: null, runtime: null };
		try {
			const id = addArchivalFilm(getDb(), {
				title: String(form.get('title') ?? ''),
				year: num(form, 'year'),
				director: details.director,
				genre: details.genre,
				runtime: details.runtime,
				tmdbId,
				posterUrl: String(form.get('poster') ?? '') || null,
				overview: String(form.get('overview') ?? '') || null,
				personId: String(form.get('personId') ?? ''),
				week: Number(form.get('week')),
				watched: form.get('watched') === 'on',
				allowDuplicate: form.get('allowDuplicate') === 'yes'
			});
			logAdmin(
				getDb(),
				person.id,
				'film.archive.add',
				String(id),
				`${String(form.get('title') ?? '')}, week ${String(form.get('week') ?? '')}`
			);
			return { added: true };
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
			logAdmin(getDb(), person.id, 'film.archive.delete', String(id));
			return { saved: true };
		} catch (error) {
			return ruleFail(error);
		}
	}
};
