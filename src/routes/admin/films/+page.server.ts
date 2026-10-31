import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { activeRules } from '$lib/server/config';
import { logAdmin, requireAdmin } from '$lib/server/admin';
import {
	deleteFilm,
	editFilm,
	filmEditFrom,
	reassignFilm,
	roundFilms,
	setFilmStatus
} from '$lib/server/manage';
import { filmById, holdFilm, releaseFilm } from '$lib/server/films';
import { heldIn } from '$lib/server/holds';
import { allPeople } from '$lib/server/people';
import { currentWeek } from '$lib/server/weeks';
import { customOf } from '$lib/custom-weeks';
import { ruleFail } from '$lib/server/respond';
import type { FilmStatus } from '$lib/server/types';

const SETTABLE: FilmStatus[] = ['active', 'archived', 'dropped'];

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.person);
	const db = getDb();
	const week = currentWeek(db);
	// §3.6: a special round's picks are its own, and they are what keeps it from being called off
	const isPick = (film: { special: string | null; added_week: number }) =>
		!!week?.special && film.special === week.special && film.added_week === week.number;
	const films = roundFilms(db);
	return {
		// watched films live on /admin/watched
		films: films.filter((film) => !isPick(film)),
		picks: films.filter(isPick),
		special: week?.special ? { id: week.special, name: customOf(week.custom)?.name ?? null } : null,
		people: allPeople(db).map((p) => ({ id: p.id, name: p.name })),
		closesAt: week?.closes_at ?? null,
		held: week ? [...heldIn(db, week.number).keys()] : []
	};
};

/** the week the score cache should be rebuilt against after any edit */
function nowWeek(): number {
	return currentWeek(getDb())?.number ?? 1;
}

export const actions: Actions = {
	status: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const status = String(form.get('status') ?? '') as FilmStatus;
		if (!SETTABLE.includes(status)) {
			return ruleFail(new Error(`refusing to set status ${status}`));
		}
		try {
			setFilmStatus(getDb(), activeRules(), id, status, nowWeek());
			logAdmin(getDb(), person.id, `film.${status}`, String(id));
			return { saved: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	edit: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = Number(form.get('id'));
		try {
			editFilm(getDb(), id, filmEditFrom(form));
			logAdmin(getDb(), person.id, 'film.edit', String(id), String(form.get('title') ?? ''));
			return { saved: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	reassign: async ({ request, locals }) => {
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

	/**
	 * §3.5 on somebody's behalf: the ask usually arrives in the group chat from
	 * whoever is not coming, and they may never open the site. The hold is still
	 * theirs, spent from their one for the round; the audit row says who pressed.
	 */
	hold: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const on = form.get('on') !== null;
		try {
			const db = getDb();
			const film = filmById(db, id);
			if (!film) return ruleFail(new Error('no such film'));
			if (on) holdFilm(db, film.added_by, id, (form.get('reason') as string) || null);
			else releaseFilm(db, film.added_by, id);
			logAdmin(db, person.id, on ? 'film.hold' : 'film.release', String(id), film.added_by);
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
