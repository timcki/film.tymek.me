import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import type { DB } from '$lib/server/db';
import { activeRules, origin } from '$lib/server/config';
import { allPeople, avatarUrl, faceOf, personById } from '$lib/server/people';
import { qrSvg } from '$lib/server/qr';
import { closeWeek, currentWeek } from '$lib/server/weeks';
import { closeRunoff, flashVote, latestDecidedRunoff, openRunoff, publicTally, revealedRankings, startReveal, turnout } from '$lib/server/runoffs';
import { commentsOf } from '$lib/server/comments';
import { heldIn } from '$lib/server/holds';
import { seenCounts } from '$lib/server/seen';
import { filmById } from '$lib/server/films';
import { ruleFail } from '$lib/server/respond';

function roomLink(code: string): string {
	return `${origin().replace(/\/$/, '')}/f/${code}`;
}

// celebrate all evening; tomorrow the screen is a host screen again
const WINNER_FRESH_MS = 12 * 60 * 60 * 1000;

// only the current room's QR is retained, not one entry per historical room
let roomQr: { link: string; svg: Promise<string> } | undefined;

/**
 * The freshly decided night, for the celebration screen. closeRunoff hands the
 * week straight to finish(), which opens the next round, so this has to come
 * from the runoff row itself rather than the week status.
 */
function freshWinner(db: DB) {
	const decided = latestDecidedRunoff(db);
	if (!decided || Date.now() - new Date(decided.closed_at!).getTime() >= WINNER_FRESH_MS) {
		return null;
	}
	const film = filmById(db, decided.winner_film_id!);
	if (!film) return null;
	const nominator = personById(db, film.added_by);
	return {
		film: {
			id: film.id,
			title: film.title,
			year: film.year,
			runtime: film.runtime,
			posterUrl: film.poster_url,
			overview: film.overview,
			note: film.note
		},
		nominator: nominator ? { ...faceOf(nominator), xp: nominator.xp } : null,
		comments: commentsOf(db, [film.id]).get(film.id) ?? [],
		code: decided.code,
		revealedAt: decided.revealed_at,
		results: publicTally(db, decided),
		rankings: revealedRankings(db, decided.id),
		turnout: turnout(db, decided.id),
		seen: seenCounts(db, [film.id])[film.id] ?? 0
	};
}

export const load: PageServerLoad = async ({ depends }) => {
	depends('app:room');
	const db = getDb();
	const runoff = openRunoff(db);
	const week = currentWeek(db);
	const link = runoff ? roomLink(runoff.code) : null;
	if (link && roomQr?.link !== link) roomQr = { link, svg: qrSvg(link, 360) };

	const rows = runoff ? publicTally(db, runoff) : [];

	// §3.5: before the close it tells the host what will not be on the screen,
	// after it, why the obvious leader is missing from the shortlist
	const held = week
		? [...heldIn(db, week.number).values()].flatMap((hold) => {
				const film = filmById(db, hold.film_id);
				const who = personById(db, hold.person_id);
				return film ? [{ title: film.title, name: who?.name ?? hold.person_id }] : [];
			})
		: [];

	return {
		held,
		runoff: runoff
			? {
					code: runoff.code,
					expiresAt: runoff.expires_at,
					link: link!,
					qr: await roomQr!.svg,
					tally: rows,
					seen: seenCounts(db, rows.map((row) => row.film.id)),
					turnout: turnout(db, runoff.id)
				}
			: null,
		winner: runoff ? null : freshWinner(db),
		weekStatus: week?.status ?? null,
		people: allPeople(db).map((p) => ({
			id: p.id,
			name: p.name,
			colour: p.colour,
			avatar: avatarUrl(p.id, p.avatar_updated_at),
			xp: p.xp
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

	// §7.2: the count on the projector, and the clock the phones wait on
	reveal: async () => {
		const db = getDb();
		const decided = latestDecidedRunoff(db);
		if (!decided) {
			return fail(409, { code: 'no_runoff', params: {}, message: 'no room vote is open' });
		}
		startReveal(db, decided.id);
		return { revealed: true };
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
		const ranking = form.getAll('filmId').map(Number);
		try {
			flashVote(db, runoff.id, personId, personId, ranking);
			return { ok: true };
		} catch (error) {
			return ruleFail(error);
		}
	}
};
