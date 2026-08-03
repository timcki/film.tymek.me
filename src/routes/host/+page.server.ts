import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { activeRules, origin } from '$lib/server/config';
import { allPeople, avatarUrl } from '$lib/server/people';
import { qrSvg } from '$lib/server/qr';
import { closeWeek, currentWeek } from '$lib/server/weeks';
import { closeRunoff, flashVote, openRunoff, tally } from '$lib/server/runoffs';
import { ruleFail } from '$lib/server/respond';

function roomLink(code: string): string {
	return `${origin().replace(/\/$/, '')}/f/${code}`;
}

export const load: PageServerLoad = async () => {
	const db = getDb();
	const runoff = openRunoff(db);
	const week = currentWeek(db);

	// who has already voted, so the host can see the room fill up
	const voted = runoff
		? new Set(
				(
					db
						.prepare(
							'SELECT person_id FROM runoff_ballot WHERE runoff_id = ? AND person_id IS NOT NULL'
						)
						.all(runoff.id) as { person_id: string }[]
				).map((row) => row.person_id)
			)
		: new Set<string>();

	return {
		runoff: runoff
			? {
					code: runoff.code,
					expiresAt: runoff.expires_at,
					link: roomLink(runoff.code),
					qr: await qrSvg(roomLink(runoff.code), 360),
					tally: tally(db, runoff.id),
					turnout: (
						db
							.prepare('SELECT COUNT(*) AS n FROM runoff_ballot WHERE runoff_id = ?')
							.get(runoff.id) as { n: number }
					).n
				}
			: null,
		weekStatus: week?.status ?? null,
		people: allPeople(db).map((p) => ({
			id: p.id,
			name: p.name,
			colour: p.colour,
			avatar: avatarUrl(p.id, p.avatar_updated_at),
			voted: voted.has(p.id)
		}))
	};
};

export const actions: Actions = {
	// §10: everyone is equal, anyone can close a week early
	close: async () => {
		const result = closeWeek(getDb(), activeRules());
		return { closed: result.kind };
	},

	closeRunoff: async () => {
		const db = getDb();
		const runoff = openRunoff(db);
		if (!runoff) {
			return fail(409, { code: 'no_runoff', params: {}, message: 'no room vote is open' });
		}
		const result = closeRunoff(db, activeRules(), runoff.id);
		return { closedRunoff: result.kind };
	},

	// the host casts on behalf of someone whose phone is dead
	voteFor: async ({ request }) => {
		const db = getDb();
		const runoff = openRunoff(db);
		if (!runoff) {
			return fail(409, { code: 'no_runoff', params: {}, message: 'no room vote is open' });
		}
		const form = await request.formData();
		const personId = String(form.get('personId') ?? '');
		const filmId = Number(form.get('filmId'));
		try {
			flashVote(db, runoff.id, personId, personId, filmId);
			return { ok: true };
		} catch (error) {
			return ruleFail(error);
		}
	}
};
