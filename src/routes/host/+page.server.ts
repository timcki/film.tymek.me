import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { activeRules, origin } from '$lib/server/config';
import { allPeople } from '$lib/server/people';
import { qrSvg } from '$lib/server/qr';
import { closeWeek, currentWeek } from '$lib/server/weeks';
import { closeRunoff, flashVote, openRunoff, tally } from '$lib/server/runoffs';
import { RuleError } from '$lib/server/types';

function roomLink(code: string): string {
	return `${origin().replace(/\/$/, '')}/f/${code}`;
}

export const load: PageServerLoad = async () => {
	const db = getDb();
	const runoff = openRunoff(db);
	const week = currentWeek(db);

	return {
		runoff: runoff
			? {
					code: runoff.code,
					expiresAt: runoff.expires_at,
					link: roomLink(runoff.code),
					qr: await qrSvg(roomLink(runoff.code), 360),
					tally: tally(db, runoff.id)
				}
			: null,
		weekStatus: week?.status ?? null,
		people: allPeople(db).map((p) => ({ id: p.id, name: p.name }))
	};
};

function toast(error: unknown) {
	if (error instanceof RuleError) return fail(409, { message: error.message });
	console.error(error);
	return fail(500, { message: 'something went wrong on the server' });
}

export const actions: Actions = {
	// §10: all six are equal, anyone can close a week early
	close: async () => {
		const result = closeWeek(getDb(), activeRules());
		return { closed: result.kind };
	},

	closeRunoff: async () => {
		const db = getDb();
		const runoff = openRunoff(db);
		if (!runoff) return fail(409, { message: 'no runoff is open' });
		const result = closeRunoff(db, activeRules(), runoff.id);
		return { closedRunoff: result.kind };
	},

	// the host casts on behalf of someone whose phone is dead
	voteFor: async ({ request }) => {
		const db = getDb();
		const runoff = openRunoff(db);
		if (!runoff) return fail(409, { message: 'no runoff is open' });
		const form = await request.formData();
		const personId = String(form.get('personId') ?? '');
		const filmId = Number(form.get('filmId'));
		try {
			flashVote(db, runoff.id, personId, personId, filmId);
			return { ok: true };
		} catch (error) {
			return toast(error);
		}
	}
};
