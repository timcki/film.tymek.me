export type Person = {
	id: string;
	name: string;
	colour: string;
	token: string;
	active: number;
	created_at: string;
};

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
	tmdb_id: number | null;
	poster_url: string | null;
	overview: string | null;
	added_by: string;
	added_week: number;
	status: FilmStatus;
	watched_week: number | null;
	final_score: number | null;
	/** cache of the current score, rebuilt by rescoreAll() */
	score: number;
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

export type Backer = { person_id: string; name: string; colour: string; points: number };

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

/** a mutation rejected by the rules; surfaced to the client as a 409 */
export class RuleError extends Error {
	readonly status = 409;
	constructor(message: string) {
		super(message);
		this.name = 'RuleError';
	}
}
