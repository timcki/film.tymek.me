import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { attended, checkIn } from '$lib/server/attendance';
import { allPeople, faceOf } from '$lib/server/people';
import { decidedOnPoints, flashVote, isExpired, myRanking, publicTally, runoffByCode, runoffFilms, turnout } from '$lib/server/runoffs';
import { resultPublic } from '$lib/reveal';
import { seenCounts } from '$lib/server/seen';
import { ruleFail } from '$lib/server/respond';
import { newDeviceId } from '$lib/server/tokens';
import { DEVICE_COOKIE } from '../../../hooks.server';

/** §7.2: reachable without a personal link. Being in the room is the credential. */
export const load: PageServerLoad = async ({ params, locals, cookies, depends, url }) => {
	depends('app:room');
	const db = getDb();
	const runoff = runoffByCode(db, params.code);
	if (!runoff) error(404, 'no runoff with that code');

	// §7.4: scanning the code with your own phone is the whole check-in ceremony.
	// Late arrivals count too: the film may be picked, but the night is still on
	if (locals.person && !isExpired(runoff)) {
		checkIn(db, runoff.week_number, locals.person.id);
	}

	if (runoff.closed_at) {
		const n = turnout(db, runoff.id);
		// §7.2: the room learns the winner from the screen. Until the host's count
		// has run, a phone knows the vote is over and nothing else
		const pending = !resultPublic(runoff, n, decidedOnPoints(db, runoff), new Date());
		const rows = pending
			? runoffFilms(db, runoff.id).sort((a, b) => a.id - b.id).map((film) => ({
				film, votes: null, points: null, beatsAll: null, comparisons: null
			}))
			: publicTally(db, runoff);
		return {
			decided: true,
			pending,
			code: runoff.code,
			tally: rows,
			seen: seenCounts(db, rows.map((row) => row.film.id)),
			winnerFilmId: pending ? null : runoff.winner_film_id,
			people: [],
			myRanking: [],
			turnout: n,
			// the face for the bar, when the phone that scanned belongs to somebody
			me: locals.person ? { ...faceOf(locals.person), xp: locals.person.xp } : null,
			identified: locals.person ? locals.person.name : null,
			checkedIn: Boolean(locals.person && attended(db, runoff.week_number, locals.person.id))
		};
	}
	if (isExpired(runoff)) error(410, 'this runoff has expired');

	// a device cookie means a returning phone is recognised, and lets a guest vote
	let deviceId = cookies.get(DEVICE_COOKIE);
	if (!deviceId) {
		deviceId = newDeviceId();
		cookies.set(DEVICE_COOKIE, deviceId, {
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'lax',
			path: '/',
			maxAge: 60 * 60 * 24
		});
	}

	const voterKey = locals.person?.id ?? deviceId;
	const rows = publicTally(db, runoff);
	return {
		decided: false,
		pending: false,
		code: runoff.code,
		tally: rows,
		seen: seenCounts(db, rows.map((row) => row.film.id)),
		winnerFilmId: null,
		people: locals.person ? [] : allPeople(db).map((p) => ({ id: p.id, name: p.name })),
		myRanking: myRanking(db, runoff.id, voterKey),
		turnout: turnout(db, runoff.id),
		// the face for the bar, when the phone that scanned belongs to somebody
		me: locals.person ? { ...faceOf(locals.person), xp: locals.person.xp } : null,
		identified: locals.person ? locals.person.name : null,
		checkedIn: Boolean(locals.person && attended(db, runoff.week_number, locals.person.id))
	};
};

export const actions: Actions = {
	flashVote: async ({ params, request, locals, cookies, url }) => {
		const db = getDb();
		const runoff = runoffByCode(db, params.code);
		if (!runoff) return fail(404, { message: 'no runoff with that code' });

		const form = await request.formData();
		const ranking = form.getAll('filmId').map(Number);
		const claimed = String(form.get('personId') ?? '');

		// a person picked from the list identifies the vote; otherwise it is a device vote
		const personId = locals.person?.id ?? (claimed || null);
		const deviceId = cookies.get(DEVICE_COOKIE) ?? newDeviceId();
		const voterKey = personId ?? deviceId;
		cookies.set(DEVICE_COOKIE, deviceId, {
			httpOnly: true, secure: url.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24
		});

		try {
			flashVote(db, runoff.id, voterKey, personId, ranking);
			return { ok: true };
		} catch (err) {
			return ruleFail(err);
		}
	},

	// a name picked on a shared phone checks that person in even if they never vote
	checkIn: async ({ params, request }) => {
		const db = getDb();
		const runoff = runoffByCode(db, params.code);
		if (!runoff) return fail(404, { message: 'no runoff with that code' });
		if (isExpired(runoff)) return fail(410, { message: 'this runoff has expired' });

		const form = await request.formData();
		const personId = String(form.get('personId') ?? '');
		if (personId) checkIn(db, runoff.week_number, personId);
		return { checkedInAs: personId || null };
	}
};
