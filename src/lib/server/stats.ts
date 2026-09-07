/**
 * Every figure the statistics screen draws, derived from tables that already
 * exist. Nothing here is cached and nothing here is written: a stat is a query
 * over the ballot, attendance, film and week tables, so all of it is retroactive
 * to week 1 for free and none of it can drift the way a stored counter would.
 *
 * Each function takes the window it is computed over rather than reading one,
 * because the group's history has two halves that must never be averaged
 * together: the nights that predate the app, which have a winner and a
 * nominator but no ballots at all, and the rounds since, which have everything.
 */
import type { DB } from './db.js';
import { avatarUrl } from './people.js';

/** 'app' starts at the first round anybody voted in; 'all' starts at week 1 */
export type Era = 'app' | 'all';

export function isEra(value: string | undefined | null): value is Era {
	return value === 'app' || value === 'all';
}

export function eraOf(value: string | undefined | null): Era {
	return isEra(value) ? value : 'app';
}

/** the inclusive span of rounds a figure is computed over */
export type Window = { from: number; to: number };

/** everything a face needs, plus the XP its ring is drawn from */
export type PersonCard = {
	id: string;
	name: string;
	colour: string;
	avatar: string | null;
	xp: number;
};

type PersonRow = {
	id: string;
	name: string;
	colour: string;
	avatar_updated_at: string | null;
	xp: number;
};

function cardOf(row: PersonRow): PersonCard {
	return {
		id: row.id,
		name: row.name,
		colour: row.colour,
		avatar: avatarUrl(row.id, row.avatar_updated_at),
		xp: row.xp
	};
}

function people(db: DB): Map<string, PersonCard> {
	const rows = db
		.prepare(
			'SELECT id, name, colour, avatar_updated_at, xp FROM person WHERE active = 1 ORDER BY name COLLATE NOCASE'
		)
		.all() as PersonRow[];
	return new Map(rows.map((row) => [row.id, cardOf(row)]));
}

function median(values: number[]): number | null {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function scalar(db: DB, sql: string, ...params: unknown[]): number {
	return (db.prepare(sql).get(...params) as { n: number }).n;
}

/** the first round anybody cast a ballot in, or null while nobody has */
export function firstBallotWeek(db: DB): number | null {
	const row = db.prepare('SELECT MIN(week_number) AS n FROM ballot').get() as { n: number | null };
	return row.n;
}

export function latestWeek(db: DB): number {
	const row = db.prepare('SELECT MAX(number) AS n FROM week').get() as { n: number | null };
	return row.n ?? 1;
}

/**
 * The span an era covers. 'app' is the honest default: 38 of the 40 nights on
 * record predate the first ballot, so an average taken over all of them is an
 * average of a different group doing a different thing.
 */
export function windowFor(db: DB, era: Era): Window {
	const to = latestWeek(db);
	if (era === 'all') return { from: 1, to };
	return { from: firstBallotWeek(db) ?? to, to };
}

/* ------------------------------------------------------------------ room -- */

export type Counts = {
	/** films watched inside the window: what turning up is counted out of */
	nights: number;
	/** rounds in the window: what voting is counted out of */
	rounds: number;
	roster: number;
	/** nothing that counts ballots has anything to say until this is above zero */
	ballots: number;
};

/** the denominators every other figure on the screen is read against */
export function counts(db: DB, window: Window): Counts {
	const { from, to } = window;
	return {
		nights: scalar(
			db,
			`SELECT COUNT(*) AS n FROM film WHERE status = 'watched' AND watched_week BETWEEN ? AND ?`,
			from,
			to
		),
		rounds: scalar(db, 'SELECT COUNT(*) AS n FROM week WHERE number BETWEEN ? AND ?', from, to),
		roster: scalar(db, 'SELECT COUNT(*) AS n FROM person WHERE active = 1'),
		ballots: scalar(db, 'SELECT COUNT(*) AS n FROM ballot WHERE week_number BETWEEN ? AND ?', from, to)
	};
}

export type RoundRow = {
	week: number;
	voters: number;
	attended: number;
	/** null while the round is still running, or where it went by without a film */
	winnerTitle: string | null;
};

export function roundRows(db: DB, window: Window): RoundRow[] {
	return db
		.prepare(
			`SELECT w.number AS week,
			        (SELECT COUNT(DISTINCT person_id) FROM ballot b WHERE b.week_number = w.number) AS voters,
			        (SELECT COUNT(*) FROM attendance a WHERE a.week_number = w.number) AS attended,
			        (SELECT f.title FROM film f
			           WHERE f.status = 'watched' AND f.watched_week = w.number
			           ORDER BY f.id LIMIT 1) AS winnerTitle
			 FROM week w
			 WHERE w.number BETWEEN ? AND ?
			 ORDER BY w.number`
		)
		.all(window.from, window.to) as RoundRow[];
}

/* ---------------------------------------------------------------- people -- */

export type OpennessRow = {
	person: PersonCard;
	/** points spent on films this person nominated, over every round in the window */
	own: number;
	/** points spent on everybody else's, which is what the figure is a share of */
	others: number;
	/**
	 * The same split, but counting only the rounds where a film of their own was
	 * actually on the list. Somebody who has never nominated cannot vote for
	 * themselves, and scoring them a spotless zero against everybody who has
	 * would be a ranking of who nominates, not of who is loyal to their own.
	 */
	ownWhenLive: number;
	othersWhenLive: number;
	/**
	 * False for somebody who never had a nomination of their own on the list
	 * while they were voting. They cannot back themselves, so a flawless zero
	 * says nothing about them and they are kept out of the ranking rather than
	 * given a score they did not earn.
	 */
	eligible: boolean;
};

/**
 * Rounds in the window where this person had a nomination of their own on the
 * list: added by then, and not yet watched. Attrition is not replayed, because
 * nothing records the round a film was dropped in; a film that was dropped only
 * widens the denominator, which errs towards nobody looking worse than they are.
 */
function liveRoundsByPerson(db: DB, window: Window): Map<string, Set<number>> {
	const films = db
		.prepare(
			`SELECT added_by, added_week, watched_week FROM film WHERE archival = 0`
		)
		.all() as { added_by: string; added_week: number; watched_week: number | null }[];

	const out = new Map<string, Set<number>>();
	for (const film of films) {
		let weeks = out.get(film.added_by);
		if (!weeks) out.set(film.added_by, (weeks = new Set()));
		const last = film.watched_week ?? window.to;
		for (let week = Math.max(film.added_week, window.from); week <= Math.min(last, window.to); week++) {
			weeks.add(week);
		}
	}
	return out;
}

export function openness(db: DB, window: Window): OpennessRow[] {
	const cards = people(db);
	const live = liveRoundsByPerson(db, window);
	const rows = db
		.prepare(
			`SELECT b.person_id, b.week_number, b.points, f.added_by
			 FROM ballot b JOIN film f ON f.id = b.film_id
			 WHERE b.week_number BETWEEN ? AND ?`
		)
		.all(window.from, window.to) as {
		person_id: string;
		week_number: number;
		points: number;
		added_by: string;
	}[];

	const out = new Map<string, OpennessRow>();
	for (const row of rows) {
		const person = cards.get(row.person_id);
		if (!person) continue;
		let entry = out.get(row.person_id);
		if (!entry) {
			out.set(
				row.person_id,
				(entry = {
					person,
					own: 0,
					others: 0,
					ownWhenLive: 0,
					othersWhenLive: 0,
					eligible: false
				})
			);
		}
		const mine = row.added_by === row.person_id;
		if (mine) entry.own += row.points;
		else entry.others += row.points;
		if (live.get(row.person_id)?.has(row.week_number)) {
			entry.eligible = true;
			if (mine) entry.ownWhenLive += row.points;
			else entry.othersWhenLive += row.points;
		}
	}

	// the rankable people first, then everyone the figure has nothing to say about
	return [...out.values()].sort(
		(a, b) =>
			Number(b.eligible) - Number(a.eligible) ||
			openShare(b) - openShare(a) ||
			b.own + b.others - (a.own + a.others)
	);
}

/** the headline number: what went to other people, out of what could have gone anywhere */
export function openShare(row: OpennessRow): number {
	const total = row.ownWhenLive + row.othersWhenLive;
	return total ? row.othersWhenLive / total : 0;
}

export type NightsRow = {
	person: PersonCard;
	/** nights in the window that were this person's nomination */
	nights: number;
};

/**
 * Whose films the group actually watches: the share of the nights that were
 * each person's nomination. The group's own check on whether the rule set is
 * being fair, which is a question about nights and not about nominations, so it
 * counts by watched_week rather than by the week the film was put up: a film
 * nominated one round and watched the next belongs to the night, not to the
 * round it was proposed in.
 *
 * Backfilled records count here. They are archival because they are not
 * nominations in play, but they are nights the group sat through, and leaving
 * them out would credit nobody for two thirds of the canon.
 */
export function whoseNights(db: DB, window: Window): NightsRow[] {
	const cards = people(db);
	const rows = db
		.prepare(
			`SELECT added_by, COUNT(*) AS nights FROM film
			 WHERE status = 'watched' AND watched_week BETWEEN ? AND ?
			 GROUP BY added_by`
		)
		.all(window.from, window.to) as { added_by: string; nights: number }[];

	return rows
		.flatMap((row) => {
			const person = cards.get(row.added_by);
			return person ? [{ person, nights: row.nights }] : [];
		})
		.sort((a, b) => b.nights - a.nights || a.person.name.localeCompare(b.person.name));
}

export type EngagementRow = {
	person: PersonCard;
	roundsVoted: number;
	nightsAttended: number;
	points: number;
	/** rounds whose winner this person had points on, in the round it won */
	winnersBacked: number;
};

export function engagement(db: DB, window: Window): EngagementRow[] {
	const cards = people(db);
	const { from, to } = window;

	const voted = new Map(
		(
			db
				.prepare(
					`SELECT person_id, COUNT(DISTINCT week_number) AS rounds, SUM(points) AS points
					 FROM ballot WHERE week_number BETWEEN ? AND ? GROUP BY person_id`
				)
				.all(from, to) as { person_id: string; rounds: number; points: number }[]
		).map((row) => [row.person_id, row])
	);
	const attended = new Map(
		(
			db
				.prepare(
					'SELECT person_id, COUNT(*) AS n FROM attendance WHERE week_number BETWEEN ? AND ? GROUP BY person_id'
				)
				.all(from, to) as { person_id: string; n: number }[]
		).map((row) => [row.person_id, row.n])
	);
	const backed = new Map(
		(
			db
				.prepare(
					`SELECT b.person_id, COUNT(DISTINCT w.number) AS n
					 FROM week w JOIN ballot b ON b.week_number = w.number AND b.film_id = w.winner_film_id
					 WHERE w.number BETWEEN ? AND ? GROUP BY b.person_id`
				)
				.all(from, to) as { person_id: string; n: number }[]
		).map((row) => [row.person_id, row.n])
	);

	return [...cards.values()]
		.map((person) => ({
			person,
			roundsVoted: voted.get(person.id)?.rounds ?? 0,
			points: voted.get(person.id)?.points ?? 0,
			nightsAttended: attended.get(person.id) ?? 0,
			winnersBacked: backed.get(person.id) ?? 0
		}))
		.sort(
			(a, b) =>
				b.nightsAttended + b.roundsVoted - (a.nightsAttended + a.roundsVoted) ||
				a.person.name.localeCompare(b.person.name)
		);
}

export type TimingRow = {
	person: PersonCard;
	/** where each ballot landed in its round: 0 the minute it opened, 1 the buzzer */
	marks: number[];
	median: number | null;
};

/**
 * When in the round people vote. ballot.updated_at is the last time the vote
 * moved rather than the moment it was cast, which for a raised vote reads later
 * than the first spend; that is the honest thing to plot anyway, since a raise
 * is the round's real decision.
 */
export function timing(db: DB, window: Window): TimingRow[] {
	const cards = people(db);
	const weeks = new Map(
		(
			db
				.prepare('SELECT number, opens_at, closes_at FROM week WHERE number BETWEEN ? AND ?')
				.all(window.from, window.to) as { number: number; opens_at: string; closes_at: string }[]
		).map((row) => [row.number, row])
	);
	const rows = db
		.prepare(
			'SELECT person_id, week_number, updated_at FROM ballot WHERE week_number BETWEEN ? AND ?'
		)
		.all(window.from, window.to) as {
		person_id: string;
		week_number: number;
		updated_at: string;
	}[];

	const out = new Map<string, number[]>();
	for (const row of rows) {
		const week = weeks.get(row.week_number);
		if (!week) continue;
		const opens = Date.parse(week.opens_at);
		const closes = Date.parse(week.closes_at);
		if (!(closes > opens)) continue;
		const at = (Date.parse(row.updated_at) - opens) / (closes - opens);
		// a vote can land after the buzzer when a round was closed late by hand
		const marks = out.get(row.person_id) ?? [];
		marks.push(Math.min(1, Math.max(0, at)));
		out.set(row.person_id, marks);
	}

	return [...out.entries()]
		.flatMap(([id, marks]) => {
			const person = cards.get(id);
			return person ? [{ person, marks, median: median(marks) }] : [];
		})
		.sort((a, b) => (a.median ?? 0) - (b.median ?? 0));
}

/* ----------------------------------------------------------------- films -- */

export type WatchedFilm = {
	id: number;
	title: string;
	year: number | null;
	director: string | null;
	genre: string | null;
	runtime: number | null;
	posterUrl: string | null;
	week: number;
	addedBy: string;
	addedByName: string;
};

/**
 * Every night on record, whatever era it belongs to. The canon is what the
 * group has watched, and half of it predates the first ballot; narrowing it to
 * the rounds with votes in them would leave two films and nothing to look at.
 */
export function watchedFilms(db: DB): WatchedFilm[] {
	const rows = db
		.prepare(
			`SELECT f.id, f.title, f.year, f.director, f.genre, f.runtime, f.poster_url,
			        f.watched_week, f.added_by, p.name AS added_by_name
			 FROM film f JOIN person p ON p.id = f.added_by
			 WHERE f.status = 'watched' AND f.watched_week IS NOT NULL
			 ORDER BY f.watched_week DESC, f.id DESC`
		)
		.all() as {
		id: number;
		title: string;
		year: number | null;
		director: string | null;
		genre: string | null;
		runtime: number | null;
		poster_url: string | null;
		watched_week: number;
		added_by: string;
		added_by_name: string;
	}[];

	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		year: row.year,
		director: row.director,
		genre: row.genre,
		runtime: row.runtime,
		posterUrl: row.poster_url,
		week: row.watched_week,
		addedBy: row.added_by,
		addedByName: row.added_by_name
	}));
}

export type Bucket = { key: string; label: string; films: number[] };

/** one bar per decade, with the empty ones kept so the shape of the run reads */
export function byDecade(films: WatchedFilm[]): Bucket[] {
	const dated = films.filter((film) => film.year !== null);
	if (!dated.length) return [];
	const decade = (year: number) => Math.floor(year / 10) * 10;
	const first = Math.min(...dated.map((f) => decade(f.year as number)));
	const last = Math.max(...dated.map((f) => decade(f.year as number)));
	const out: Bucket[] = [];
	for (let d = first; d <= last; d += 10) {
		out.push({
			key: String(d),
			label: `${String(d).slice(2)}s`,
			films: dated.filter((f) => decade(f.year as number) === d).map((f) => f.id)
		});
	}
	return out;
}

/** TMDB hands genres over as "Crime / Drama"; both halves are the film's genre */
export function byGenre(films: WatchedFilm[]): Bucket[] {
	const out = new Map<string, number[]>();
	for (const film of films) {
		for (const raw of (film.genre ?? '').split('/')) {
			const tag = raw.trim();
			if (!tag) continue;
			const ids = out.get(tag) ?? [];
			ids.push(film.id);
			out.set(tag, ids);
		}
	}
	return [...out.entries()]
		.map(([tag, ids]) => ({ key: tag, label: tag, films: ids }))
		.sort((a, b) => b.films.length - a.films.length || a.label.localeCompare(b.label));
}

/** only the ones the group has come back to; a list of forty singletons says nothing */
export function byDirector(films: WatchedFilm[]): Bucket[] {
	const out = new Map<string, number[]>();
	for (const film of films) {
		const name = film.director?.trim();
		if (!name) continue;
		const ids = out.get(name) ?? [];
		ids.push(film.id);
		out.set(name, ids);
	}
	return [...out.entries()]
		.filter(([, ids]) => ids.length > 1)
		.map(([name, ids]) => ({ key: name, label: name, films: ids }))
		.sort((a, b) => b.films.length - a.films.length || a.label.localeCompare(b.label));
}

export type RuntimeSpread = {
	films: { id: number; runtime: number }[];
	min: number;
	max: number;
	mean: number;
	median: number;
};

export function runtimes(films: WatchedFilm[]): RuntimeSpread | null {
	const timed = films
		.filter((film) => film.runtime !== null && film.runtime > 0)
		.map((film) => ({ id: film.id, runtime: film.runtime as number }));
	if (!timed.length) return null;
	const values = timed.map((f) => f.runtime);
	return {
		films: timed,
		min: Math.min(...values),
		max: Math.max(...values),
		mean: values.reduce((sum, n) => sum + n, 0) / values.length,
		median: median(values) as number
	};
}

export type Named = { title: string; value: number };

export type ScreenStats = {
	/**
	 * Nights the app itself resolved, which is the only honest basis for any of
	 * this. A backfilled record was written down as nominated and watched in the
	 * same week, so counting those would put the typical wait at nothing and the
	 * typical winning score at zero.
	 */
	nights: number;
	/** rounds between a film going up and reaching the screen */
	meanWait: number;
	longestWait: Named | null;
	meanScore: number;
	bestScore: Named | null;
	/** the film that has been on the list longest without getting a night */
	waitingLongest: Named | null;
};

/** what it takes for a film to get watched: how long it waits and what it wins with */
export function screenStats(db: DB): ScreenStats | null {
	const won = db
		.prepare(
			`SELECT title, added_week, watched_week, final_score FROM film
			 WHERE status = 'watched' AND final_score IS NOT NULL AND watched_week IS NOT NULL
			 ORDER BY final_score DESC`
		)
		.all() as {
		title: string;
		added_week: number;
		watched_week: number;
		final_score: number;
	}[];
	if (!won.length) return null;

	const waits = won.map((film) => ({
		title: film.title,
		value: Math.max(0, film.watched_week - film.added_week)
	}));
	const mean = (values: number[]) => values.reduce((sum, n) => sum + n, 0) / values.length;

	// the oldest film still on the list, measured against the round now open
	const now = latestWeek(db);
	const oldest = db
		.prepare(
			`SELECT title, added_week FROM film
			 WHERE status = 'active' AND archival = 0
			 ORDER BY added_week, id LIMIT 1`
		)
		.get() as { title: string; added_week: number } | undefined;

	return {
		nights: won.length,
		meanWait: mean(waits.map((w) => w.value)),
		longestWait: waits.reduce((top, w) => (w.value > top.value ? w : top), waits[0]),
		meanScore: mean(won.map((film) => film.final_score)),
		bestScore: { title: won[0].title, value: won[0].final_score },
		waitingLongest: oldest
			? { title: oldest.title, value: Math.max(0, now - oldest.added_week) }
			: null
	};
}

/* ------------------------------------------------------------------ lens -- */

/**
 * Which of the three views is open. It lives in the query string rather than in
 * component state so the tabs work with no JavaScript and a view can be sent to
 * somebody exactly as it was read.
 */
export type Lens = 'people' | 'films';

export function lensOf(value: string | undefined | null): Lens {
	return value === 'films' ? 'films' : 'people';
}
