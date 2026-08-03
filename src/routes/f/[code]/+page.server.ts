import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { allPeople } from '$lib/server/people';
import { flashVote, isExpired, runoffByCode, tally } from '$lib/server/runoffs';
import { RuleError } from '$lib/server/types';
import { newDeviceId } from '$lib/server/tokens';
import { DEVICE_COOKIE } from '../../../hooks.server';

/** §7.2: reachable without a personal link. Being in the room is the credential. */
export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const db = getDb();
	const runoff = runoffByCode(db, params.code);
	if (!runoff) error(404, 'no runoff with that code');
	if (runoff.closed_at) {
		return {
			decided: true,
			code: runoff.code,
			tally: tally(db, runoff.id),
			winnerFilmId: runoff.winner_film_id,
			people: [],
			myVote: null,
			identified: null
		};
	}
	if (isExpired(runoff)) error(410, 'this runoff has expired');

	// a device cookie means a returning phone is recognised, and lets a guest vote
	let deviceId = cookies.get(DEVICE_COOKIE);
	if (!deviceId) {
		deviceId = newDeviceId();
		cookies.set(DEVICE_COOKIE, deviceId, {
			httpOnly: true,
			sameSite: 'lax',
			path: '/',
			maxAge: 60 * 60 * 24
		});
	}

	const voterKey = locals.person?.id ?? deviceId;
	const myVote = db
		.prepare('SELECT film_id FROM runoff_ballot WHERE runoff_id = ? AND voter_key = ?')
		.get(runoff.id, voterKey) as { film_id: number } | undefined;

	return {
		decided: false,
		code: runoff.code,
		tally: tally(db, runoff.id),
		winnerFilmId: null,
		people: locals.person ? [] : allPeople(db).map((p) => ({ id: p.id, name: p.name })),
		myVote: myVote?.film_id ?? null,
		identified: locals.person ? locals.person.name : null
	};
};

export const actions: Actions = {
	flashVote: async ({ params, request, locals, cookies }) => {
		const db = getDb();
		const runoff = runoffByCode(db, params.code);
		if (!runoff) return fail(404, { message: 'no runoff with that code' });

		const form = await request.formData();
		const filmId = Number(form.get('filmId'));
		const claimed = String(form.get('personId') ?? '');

		// a person picked from the list identifies the vote; otherwise it is a device vote
		const personId = locals.person?.id ?? (claimed || null);
		const deviceId = cookies.get(DEVICE_COOKIE) ?? newDeviceId();
		const voterKey = personId ?? deviceId;

		try {
			flashVote(db, runoff.id, voterKey, personId, filmId);
			return { ok: true };
		} catch (err) {
			if (err instanceof RuleError) return fail(409, { message: err.message });
			console.error(err);
			return fail(500, { message: 'something went wrong on the server' });
		}
	}
};
