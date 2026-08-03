import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { activeRules } from '$lib/server/config';
import { currentWeek } from '$lib/server/weeks';
import {
	filmsByStatus,
	nominate,
	renominate,
	setNote,
	setPoints,
	standings
} from '$lib/server/films';
import { ruleFail } from '$lib/server/respond';
import { detailsOf } from '$lib/server/tmdb';

export const load: PageServerLoad = async ({ locals }) => {
	const db = getDb();
	const rules = activeRules();
	const week = currentWeek(db);
	const person = locals.person!;
	if (!week) {
		return { films: [], archived: [], dropped: [], shortlistCount: 0, nominatedThisWeek: null };
	}

	const nominatedThisWeek = db
		.prepare('SELECT id, title FROM film WHERE added_by = ? AND added_week = ?')
		.get(person.id, week.number) as { id: number; title: string } | undefined;

	const films = standings(db, rules, week.number, person.id);

	// the films that would go to the room if the week closed now. They sort first
	// under §3.2, so this is only a count of how many leading rows to set apart.
	const backed = films.filter((film) => film.score > 0).length;
	const shortlistCount = Math.min(rules.shortlistSize, backed);

	return {
		films,
		archived: standings(db, rules, week.number, person.id, 'archived'),
		dropped: filmsByStatus(db, 'dropped'),
		shortlistCount: shortlistCount > 1 ? shortlistCount : 0,
		nominatedThisWeek: nominatedThisWeek ?? null
	};
};

export const actions: Actions = {
	setPoints: async ({ request, locals }) => {
		const form = await request.formData();
		const filmId = Number(form.get('filmId'));
		const points = Number(form.get('points'));
		try {
			setPoints(getDb(), activeRules(), locals.person!.id, filmId, points);
			return { ok: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	nominate: async ({ request, locals }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const tmdbIdRaw = form.get('tmdbId');
		const tmdbId = tmdbIdRaw ? Number(tmdbIdRaw) : null;
		const yearRaw = form.get('year');

		if (!title) return fail(400, { code: 'no_title', params: {}, message: 'type a title first' });

		// §8.2: the details cost one request per nomination, not seven per keystroke
		const details = tmdbId
			? await detailsOf(tmdbId)
			: { director: null, genre: null, runtime: null };

		try {
			nominate(getDb(), activeRules(), locals.person!.id, {
				title,
				year: yearRaw ? Number(yearRaw) : null,
				director: details.director,
				genre: details.genre,
				runtime: details.runtime,
				tmdbId,
				posterUrl: (form.get('poster') as string) || null,
				overview: (form.get('overview') as string) || null,
				note: (form.get('note') as string) || null
			});
			return { nominated: title };
		} catch (error) {
			return ruleFail(error);
		}
	},

	renominate: async ({ request, locals }) => {
		const form = await request.formData();
		const filmId = Number(form.get('filmId'));
		try {
			renominate(getDb(), activeRules(), locals.person!.id, filmId);
			return { renominated: String(form.get('title') ?? '') };
		} catch (error) {
			return ruleFail(error);
		}
	},

	setNote: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			setNote(
				getDb(),
				locals.person!.id,
				Number(form.get('filmId')),
				String(form.get('note') ?? '')
			);
			return { noteSaved: true };
		} catch (error) {
			return ruleFail(error);
		}
	}
};
