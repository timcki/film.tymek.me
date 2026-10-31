import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { activeRules } from '$lib/server/config';
import { currentWeek } from '$lib/server/weeks';
import {
	castOrder,
	filmsByStatus,
	holdFilm,
	nominate,
	releaseFilm,
	renominate,
	setNote,
	setPoints,
	standings
} from '$lib/server/films';
import { holdOf } from '$lib/server/holds';
import { addComment, commentsOf, deleteComment, reactComment } from '$lib/server/comments';
import { logAdmin, requireAdmin } from '$lib/server/admin';
import { seenOf, toggleSeen } from '$lib/server/seen';
import { ruleFail } from '$lib/server/respond';
import { detailsOf } from '$lib/server/tmdb';
import { generation } from '$lib/server/live';

export const load: PageServerLoad = async ({ locals }) => {
	const db = getDb();
	const rules = activeRules();
	const week = currentWeek(db);
	const person = locals.person!;
	// read before anything else the page shows, so a write landing mid-load
	// leaves this behind the data and the next poll reloads, never the reverse
	const live = generation();
	// §3.6: the list is asleep for a special round, which has a page of its own
	if (week?.special) redirect(303, '/special');
	if (!week) {
		return {
			live,
			films: [],
			archived: [],
			dropped: [],
			shortlistIds: [],
			nominatedThisWeek: null,
			myCastOrder: [],
			myHold: null
		};
	}

	const nominatedThisWeek = db
		.prepare('SELECT id, title FROM film WHERE added_by = ? AND added_week = ? AND special IS NULL')
		.get(person.id, week.number) as { id: number; title: string } | undefined;

	const films = standings(db, rules, week.number, person.id);

	// the films that would go to the room if the week closed now, by the same
	// arithmetic closeWeek uses: a held film is no candidate, and where every
	// candidate is held none of them is. Ids rather than a count, because a held
	// film keeps its place in the ranking and the band reaches past it
	const candidates = films.filter((film) => film.score > 0);
	const awake = candidates.filter((film) => !film.held);
	const shortlistIds = (awake.length ? awake : candidates)
		.slice(0, rules.shortlistSize)
		.map((film) => film.id);

	// attached at the route level so Standing stays a scoring concern
	const withComments = <T extends { id: number }>(rows: T[]) => {
		const ids = rows.map((row) => row.id);
		const byFilm = commentsOf(db, ids, person.id);
		const seenByFilm = seenOf(db, ids);
		return rows.map((row) => {
			const seen = seenByFilm.get(row.id) ?? [];
			return {
				...row,
				comments: byFilm.get(row.id) ?? [],
				seen,
				seenMine: seen.some((face) => face.id === person.id)
			};
		});
	};

	return {
		live,
		films: withComments(films),
		archived: withComments(standings(db, rules, week.number, person.id, 'archived')),
		dropped: filmsByStatus(db, 'dropped'),
		// one leading card needs no divider to explain itself
		shortlistIds: shortlistIds.length > 1 ? shortlistIds : [],
		nominatedThisWeek: nominatedThisWeek ?? null,
		myCastOrder: castOrder(db, person.id, week.number),
		myHold: holdOf(db, week.number, person.id)?.film_id ?? null
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

	hold: async ({ request, locals }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '');
		try {
			holdFilm(
				getDb(),
				locals.person!.id,
				Number(form.get('filmId')),
				(form.get('reason') as string) || null
			);
			return { held: title };
		} catch (error) {
			return ruleFail(error);
		}
	},

	release: async ({ request, locals }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '');
		try {
			releaseFilm(getDb(), locals.person!.id, Number(form.get('filmId')));
			return { released: title };
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
	},

	comment: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			addComment(
				getDb(),
				locals.person!.id,
				Number(form.get('filmId')),
				String(form.get('body') ?? '')
			);
			return { commented: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	uncomment: async ({ request, locals }) => {
		const person = requireAdmin(locals.person);
		const form = await request.formData();
		const id = Number(form.get('commentId'));
		try {
			logAdmin(getDb(), person.id, 'comment.delete', String(id), deleteComment(getDb(), id));
			return { uncommented: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	seen: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			toggleSeen(getDb(), locals.person!.id, Number(form.get('filmId')));
			return { seenToggled: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	react: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			reactComment(
				getDb(),
				locals.person!.id,
				Number(form.get('commentId')),
				String(form.get('emoji') ?? '')
			);
			return { reacted: true };
		} catch (error) {
			return ruleFail(error);
		}
	}
};
