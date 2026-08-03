import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { activeRules } from '$lib/server/config';
import { currentWeek } from '$lib/server/weeks';
import { filmsByStatus, nominate, renominate, setPoints, standings } from '$lib/server/films';
import { bankBalance, spentInWeek } from '$lib/server/people';
import { RuleError } from '$lib/server/types';
import { directorOf } from '$lib/server/tmdb';

export const load: PageServerLoad = async ({ locals }) => {
	const db = getDb();
	const rules = activeRules();
	const week = currentWeek(db);
	const person = locals.person!;
	if (!week) return { films: [], archived: [], dropped: [], watched: [], me: null };

	const spent = spentInWeek(db, person.id, week.number);
	const balance = bankBalance(db, person.id);
	const nominatedThisWeek = db
		.prepare('SELECT id, title FROM film WHERE added_by = ? AND added_week = ?')
		.get(person.id, week.number) as { id: number; title: string } | undefined;

	const watched = db
		.prepare(
			`SELECT f.*, p.name AS added_by_name FROM film f
			 JOIN person p ON p.id = f.added_by
			 WHERE f.status = 'watched' ORDER BY f.watched_week DESC LIMIT 8`
		)
		.all() as Record<string, unknown>[];

	return {
		films: standings(db, rules, week.number, person.id),
		archived: standings(db, rules, week.number, person.id, 'archived'),
		dropped: filmsByStatus(db, 'dropped'),
		watched,
		me: {
			spent,
			balance,
			budget: rules.banking ? balance : rules.pointsPerWeek,
			nominatedThisWeek: nominatedThisWeek ?? null
		}
	};
};

function toast(error: unknown) {
	if (error instanceof RuleError) return fail(409, { message: error.message });
	console.error(error);
	return fail(500, { message: 'something went wrong on the server' });
}

export const actions: Actions = {
	setPoints: async ({ request, locals }) => {
		const form = await request.formData();
		const filmId = Number(form.get('filmId'));
		const points = Number(form.get('points'));
		try {
			setPoints(getDb(), activeRules(), locals.person!.id, filmId, points);
			return { ok: true };
		} catch (error) {
			return toast(error);
		}
	},

	nominate: async ({ request, locals }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const tmdbIdRaw = form.get('tmdbId');
		const tmdbId = tmdbIdRaw ? Number(tmdbIdRaw) : null;
		const yearRaw = form.get('year');

		if (!title) return fail(400, { message: 'type a title first' });

		// §8.2: the director costs one request per nomination, not seven per keystroke
		const director = tmdbId ? await directorOf(tmdbId) : null;

		try {
			nominate(getDb(), activeRules(), locals.person!.id, {
				title,
				year: yearRaw ? Number(yearRaw) : null,
				director,
				tmdbId,
				posterUrl: (form.get('poster') as string) || null,
				overview: (form.get('overview') as string) || null
			});
		} catch (error) {
			return toast(error);
		}
		redirect(303, '/');
	},

	renominate: async ({ request, locals }) => {
		const form = await request.formData();
		const filmId = Number(form.get('filmId'));
		try {
			renominate(getDb(), activeRules(), locals.person!.id, filmId);
		} catch (error) {
			return toast(error);
		}
		redirect(303, '/');
	}
};
