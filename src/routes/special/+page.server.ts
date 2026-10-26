import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { activeRules } from '$lib/server/config';
import { currentWeek } from '$lib/server/weeks';
import {
	nominateSpecial,
	picksUsed,
	setApproval,
	specialPicks,
	specialTurnout
} from '$lib/server/specials';
import { seenOf, toggleSeen } from '$lib/server/seen';
import { addComment, commentsOf, reactComment } from '$lib/server/comments';
import { ruleFail } from '$lib/server/respond';
import { detailsOf } from '$lib/server/tmdb';
import { generation } from '$lib/server/live';
import { specialOf } from '$lib/specials';

/**
 * §3.6: the special round's own page, which stands in for the list while the
 * list is asleep. Only the viewer's own ticks are in here; the counts stay on the
 * server until the room.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const db = getDb();
	const person = locals.person!;
	const live = generation();
	const week = currentWeek(db);
	const special = specialOf(week?.special);
	if (!week || !special) redirect(303, '/');

	const picks = specialPicks(db, week, person.id);
	const seen = seenOf(
		db,
		picks.map((pick) => pick.id)
	);
	const comments = commentsOf(
		db,
		picks.map((pick) => pick.id),
		person.id
	);
	return {
		live,
		special: {
			id: special.id,
			picksPerPerson: special.picksPerPerson,
			shortlistSize: special.shortlistSize
		},
		picks: picks.map((pick) => {
			const faces = seen.get(pick.id) ?? [];
			return {
				...pick,
				seen: faces,
				seenMine: faces.some((face) => face.id === person.id),
				comments: comments.get(pick.id) ?? []
			};
		}),
		used: picksUsed(db, week, person.id),
		turnout: specialTurnout(db, week)
	};
};

export const actions: Actions = {
	nominate: async ({ request, locals }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const tmdbIdRaw = form.get('tmdbId');
		const tmdbId = tmdbIdRaw ? Number(tmdbIdRaw) : null;
		const yearRaw = form.get('year');

		if (!title) return fail(400, { code: 'no_title', params: {}, message: 'type a title first' });

		// §8.2: one details request per pick, as for a nomination
		const details = tmdbId
			? await detailsOf(tmdbId)
			: { director: null, genre: null, runtime: null };

		try {
			nominateSpecial(getDb(), activeRules(), locals.person!.id, {
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

	approve: async ({ request, locals }) => {
		const form = await request.formData();
		const on = form.get('on') === '1';
		const title = String(form.get('title') ?? '');
		try {
			setApproval(getDb(), activeRules(), locals.person!.id, Number(form.get('filmId')), on);
			return on ? { approved: title } : { unapproved: title };
		} catch (error) {
			return ruleFail(error);
		}
	},

	// the same thread the list's films have, said about a pick
	comment: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			addComment(getDb(), locals.person!.id, Number(form.get('filmId')), String(form.get('body') ?? ''));
			return { commented: true };
		} catch (error) {
			return ruleFail(error);
		}
	},

	react: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			reactComment(getDb(), locals.person!.id, Number(form.get('commentId')), String(form.get('emoji') ?? ''));
			return { reacted: true };
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
	}
};
