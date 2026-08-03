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
	/** §3.5: everything this film has lost to pass-overs, subtracted from its ballots */
	penalty: number;
	/** the size of the most recent cut, kept so the card can show it for one week */
	last_penalty: number;
	last_penalty_week: number | null;
	created_at: string;
};

export type Ballot = {
	week_number: number;
	person_id: string;
	film_id: number;
	points: number;
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
};

export type Backer = {
	person_id: string;
	name: string;
	colour: string;
	points: number;
	avatar: string | null;
};

export type Standing = Film & {
	score: number;
	backers: Backer[];
	myPoints: number;
	addedByName: string;
	/** consecutive weeks a single person has backed this film, §9 badge */
	campaignWeeks: number;
	/** true when this film is one pointless week away from attrition */
	atRisk: boolean;
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
