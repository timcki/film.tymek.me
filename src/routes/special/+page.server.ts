import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { activeRules } from '$lib/server/config';
import { currentWeek } from '$lib/server/weeks';
import {
	nominateSpecial,
	picksAllowed,
	picksUsed,
	setApproval,
	specialPicks,
	specialTurnout
} from '$lib/server/specials';
import { seenOf, toggleSeen } from '$lib/server/seen';
import { setNote } from '$lib/server/films';
import { addComment, commentsOf, deleteComment, reactComment } from '$lib/server/comments';
import { logAdmin, requireAdmin } from '$lib/server/admin';
import { ruleFail } from '$lib/server/respond';
import { lookUpFilm, NO_DETAILS } from '$lib/server/tmdb';
import { generation } from '$lib/server/live';
import { specialOf } from '$lib/specials';
import { customOf } from '$lib/custom-weeks';

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
			picksPerPerson: picksAllowed(week),
			shortlistSize: special.shortlistSize,
			custom: customOf(week.custom)
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

		// §8.2: one details request per pick, as for a nomination; §3.7: the same
		// request is what a custom week's rules are checked against
		const { details, facts } = tmdbId ? await lookUpFilm(tmdbId) : { details: NO_DETAILS, facts: null };

		try {
			nominateSpecial(getDb(), activeRules(), locals.person!.id, {
				title,
				year: yearRaw ? Number(yearRaw) : null,
				...details,
				tmdbId,
				posterUrl: (form.get('poster') as string) || null,
				overview: (form.get('overview') as string) || null,
				note: (form.get('note') as string) || null
			}, facts);
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

	// the pitch under a pick, written or rewritten by whoever put it up
	setNote: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			setNote(getDb(), locals.person!.id, Number(form.get('filmId')), String(form.get('note') ?? ''));
			return { noteSaved: true };
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
	}
};
