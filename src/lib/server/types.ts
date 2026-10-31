import type { Outing } from '../outings.js';

export type Person = {
	id: string;
	name: string;
	colour: string;
	token: string;
	active: number;
	created_at: string;
	avatar: Uint8Array | null;
	avatar_mime: string | null;
	avatar_updated_at: string | null;
	is_admin: number;
	/** cache of the person's XP, rebuilt by rexpAll() */
	xp: number;
	/** the newest changelog entry this person has dismissed */
	changelog_seen: number;
};

export type NightStatus = 'planned' | 'skipped' | 'used';

/** one film night: the instant voting closes and the room picks */
export type Night = {
	id: number;
	at: string;
	status: NightStatus;
	/** the round that actually closed on this night, set when it does */
	week_number: number | null;
	note: string | null;
	created_at: string;
};

/** everything a face needs: a picture if there is one, initials and a colour if not */
export type Face = { id: string; name: string; colour: string; avatar: string | null };

export type WeekStatus = 'open' | 'runoff' | 'closed';

export type Week = {
	number: number;
	opens_at: string;
	closes_at: string;
	status: WeekStatus;
	winner_film_id: number | null;
	resolved_at: string | null;
	/** §3.6: the special night this round is given over to, or null for a list round */
	special: string | null;
	/** §3.6: the look an admin put on the site this round, 'default' to take one off */
	look: string | null;
};

export type FilmStatus = 'active' | 'archived' | 'dropped' | 'watched';

export type Film = {
	id: number;
	title: string;
	title_key: string;
	year: number | null;
	director: string | null;
	genre: string | null;
	runtime: number | null;
	tmdb_id: number | null;
	poster_url: string | null;
	overview: string | null;
	/** the nominator's pitch; only they can edit it */
	note: string | null;
	added_by: string;
	added_week: number;
	status: FilmStatus;
	watched_week: number | null;
	final_score: number | null;
	/** cache of the current score, rebuilt by rescoreAll() */
	score: number;
	created_at: string;
	/**
	 * 1 for a record of a past night rather than a nomination in play: invisible to
	 * the list, untouched by attrition, unvotable, and outside the one-per-round index
	 */
	archival: number;
	/** §3.6: the special round this film is a pick for; null for the list's own films */
	special: string | null;
	/** where we watched it when it was not a film night; null for every film night */
	outing: Outing | null;
	/** when that outing was; null for a film night, whose evening is its round's night */
	watched_at: string | null;
};

export type Ballot = {
	week_number: number;
	person_id: string;
	film_id: number;
	points: number;
	/** §8.3: what the vote falls back to if undone within the grace window */
	prev_points: number;
	/** when the last raise happened; the grace window runs from here */
	updated_at: string;
};

export type Runoff = {
	id: number;
	week_number: number;
	code: string;
	created_at: string;
	expires_at: string;
	closed_at: string | null;
	winner_film_id: number | null;
	/** §7.2: when the host started the count; null until then */
	revealed_at: string | null;
};

export type Backer = {
	person_id: string;
	name: string;
	colour: string;
	points: number;
	/** the same points split by the week they were cast in, newest first */
	weekly: { week: number; points: number }[];
	/** the person's cached XP, for the level title on their face */
	xp: number;
	avatar: string | null;
};

export type Standing = Film & {
	score: number;
	backers: Backer[];
	myPoints: number;
	/** §8.3: the lowest value the viewer may set on this film right now */
	myFloor: number;
	/** when the viewer's undo window shuts, or null once the vote has set */
	myGraceUntil: string | null;
	addedByName: string;
	/** the nominator as a face, for the pill in the card's title line */
	nominator: Omit<Backer, 'points' | 'weekly'>;
	/** per-week point totals, oldest last, for the score-breakdown popup */
	weeklyPoints: { week: number; points: number; age: number }[];
	/** consecutive weeks a single person has backed this film, §9 badge */
	campaignWeeks: number;
	/** true when this film is one pointless week away from attrition */
	atRisk: boolean;
	/** §3.5: set while the film sits this round out at its nominator's request */
	held: { personId: string; name: string; reason: string | null } | null;
};

export type ErrorParams = Record<string, string | number>;

/**
 * A mutation rejected by the rules; surfaced to the client as a 409. Carries a
 * code and its parameters so the page can say it in the reader's language; the
 * message is the English fallback and what ends up in the logs.
 */
export class RuleError extends Error {
	readonly status = 409;
	constructor(
		readonly code: string,
		message: string,
		readonly params: ErrorParams = {}
	) {
		super(message);
		this.name = 'RuleError';
	}
}
