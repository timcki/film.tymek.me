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
import type { Film } from './types.js';
import { SUCCESSOR } from './tmdb.js';
import { avatarUrl } from './people.js';
import type { TimePoint } from '../trend.js';
import { filmEvenings } from './evenings.js';
import { listClock } from './scoring.js';
import { ROUNDS_VOTED } from './xp.js';

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
	/**
	 * film nights inside the window: what turning up is counted out of. An outing
	 * has no room code to scan, so counting it would mark everybody absent from it
	 */
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
			`SELECT COUNT(*) AS n FROM film
			 WHERE status = 'watched' AND outing IS NULL AND watched_week BETWEEN ? AND ?`,
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
			// §3.6: a special round's ticks are its votes, as they are for XP
			`SELECT w.number AS week,
			        (SELECT COUNT(DISTINCT person_id) FROM (${ROUNDS_VOTED}) v
			           WHERE v.week_number = w.number) AS voters,
			        (SELECT COUNT(*) FROM attendance a WHERE a.week_number = w.number) AS attended,
			        (SELECT f.title FROM film f
			           WHERE f.status = 'watched' AND f.outing IS NULL AND f.watched_week = w.number
			           ORDER BY f.id LIMIT 1) AS winnerTitle
			 FROM week w
			 WHERE w.number BETWEEN ? AND ?
			 ORDER BY w.number`
		)
		.all(window.from, window.to) as RoundRow[];
}

/* ---------------------------------------------------------------- people -- */

/** one film somebody spent on, and whether spending on it was open or not */
export type SpendRow = {
	id: number;
	title: string;
	mine: boolean;
	points: number;
};

export type OpennessRow = {
	person: PersonCard;
	/** points spent on films this person nominated */
	own: number;
	/** points spent on everybody else's, which is what the figure is a share of */
	others: number;
	/**
	 * Every film the points went on, biggest first. A percentage on its own is
	 * something to be taken on trust; this is the arithmetic behind it, so the
	 * card that reports the figure can also show its working.
	 */
	films: SpendRow[];
};

/**
 * How much of what somebody spends goes to films that are not theirs.
 *
 * Somebody who has never nominated scores a clean hundred per cent, which is
 * the plain truth about them: every point they have spent went to somebody
 * else's film. An earlier version counted only the rounds where a person had a
 * nomination of their own on the list, on the grounds that you cannot resist a
 * temptation you never had, and left everybody else out of the ranking. That
 * bought a fairness nobody asked for at the price of a chart that could not
 * place half the room.
 */
export function openness(db: DB, window: Window): OpennessRow[] {
	const cards = people(db);
	// grouped per film rather than per person, so the same rows serve the total
	// and the working behind it
	const rows = db
		.prepare(
			`SELECT b.person_id, f.id, f.title, SUM(b.points) AS points,
			        (f.added_by = b.person_id) AS mine
			 FROM ballot b JOIN film f ON f.id = b.film_id
			 WHERE b.week_number BETWEEN ? AND ?
			 GROUP BY b.person_id, f.id
			 ORDER BY points DESC, f.title`
		)
		.all(window.from, window.to) as {
		person_id: string;
		id: number;
		title: string;
		points: number;
		mine: number;
	}[];

	const out = new Map<string, OpennessRow>();
	for (const row of rows) {
		const person = cards.get(row.person_id);
		if (!person) continue;
		let entry = out.get(row.person_id);
		if (!entry) out.set(row.person_id, (entry = { person, own: 0, others: 0, films: [] }));
		const mine = Boolean(row.mine);
		if (mine) entry.own += row.points;
		else entry.others += row.points;
		entry.films.push({ id: row.id, title: row.title, mine, points: row.points });
	}

	return [...out.values()].sort(
		(a, b) => openShare(b) - openShare(a) || b.own + b.others - (a.own + a.others)
	);
}

/** the headline number: what went to other people, out of everything they spent */
export function openShare(row: OpennessRow): number {
	const total = row.own + row.others;
	return total ? row.others / total : 0;
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
 * them out would credit nobody for two thirds of the canon. An outing does not:
 * no rule set chose it, so it says nothing about whether one is fair.
 */
export function whoseNights(db: DB, window: Window): NightsRow[] {
	const cards = people(db);
	const rows = db
		.prepare(
			`SELECT added_by, COUNT(*) AS nights FROM film
			 WHERE status = 'watched' AND outing IS NULL AND watched_week BETWEEN ? AND ?
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

	const spent = new Map(
		(
			db
				.prepare(
					`SELECT person_id, SUM(points) AS points
					 FROM ballot WHERE week_number BETWEEN ? AND ? GROUP BY person_id`
				)
				.all(from, to) as { person_id: string; points: number }[]
		).map((row) => [row.person_id, row.points])
	);
	// §3.6: a special round's ticks are its votes, as they are for XP
	const voted = new Map(
		(
			db
				.prepare(
					`SELECT person_id, COUNT(*) AS rounds FROM (${ROUNDS_VOTED})
					 WHERE week_number BETWEEN ? AND ? GROUP BY person_id`
				)
				.all(from, to) as { person_id: string; rounds: number }[]
		).map((row) => [row.person_id, row.rounds])
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
	// points on the winner in the list round it won, which a special round
	// before the night (§3.6) can have split across two weeks
	const clock = listClock(db);
	const backing = db
		.prepare(
			`SELECT DISTINCT b.person_id, f.id, f.watched_week, b.week_number
			 FROM film f JOIN ballot b ON b.film_id = f.id AND b.week_number <= f.watched_week
			 WHERE f.status = 'watched' AND f.watched_week BETWEEN ? AND ?`
		)
		.all(from, to) as { person_id: string; id: number; watched_week: number; week_number: number }[];
	const backedFilms = new Map<string, Set<number>>();
	for (const row of backing) {
		if (clock(row.week_number) !== clock(row.watched_week)) continue;
		let films = backedFilms.get(row.person_id);
		if (!films) backedFilms.set(row.person_id, (films = new Set()));
		films.add(row.id);
	}

	return [...cards.values()]
		.map((person) => ({
			person,
			roundsVoted: voted.get(person.id) ?? 0,
			points: spent.get(person.id) ?? 0,
			nightsAttended: attended.get(person.id) ?? 0,
			winnersBacked: backedFilms.get(person.id)?.size ?? 0
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

export type Rewatches = {
	/** evenings in the window, outings included: what every row is a share of */
	evenings: number;
	rows: { person: PersonCard; seen: number }[];
};

/**
 * Who had already seen the most of what we watched: a film marked as seen
 * before its evening came round. A mark made afterwards says nothing, since by
 * then everybody in the room had seen it.
 */
export function rewatches(db: DB, window: Window): Rewatches {
	const cards = people(db);
	const { evenings } = db
		.prepare(
			`SELECT COUNT(*) AS evenings FROM film
			 WHERE status = 'watched' AND watched_week BETWEEN ? AND ?`
		)
		.get(window.from, window.to) as { evenings: number };
	const rows = db
		.prepare(
			`SELECT s.person_id, COUNT(*) AS seen
			 FROM film_seen s
			 JOIN film f ON f.id = s.film_id
			 JOIN week w ON w.number = f.watched_week
			 WHERE f.status = 'watched' AND f.watched_week BETWEEN ? AND ?
			   AND s.created_at <= COALESCE(f.watched_at, w.closes_at)
			 GROUP BY s.person_id`
		)
		.all(window.from, window.to) as { person_id: string; seen: number }[];

	return {
		evenings,
		rows: rows
			.flatMap((row) => {
				const person = cards.get(row.person_id);
				return person ? [{ person, seen: row.seen }] : [];
			})
			.sort((a, b) => b.seen - a.seen || a.person.name.localeCompare(b.person.name))
	};
}

/** what one person has spent on another's nominations, over the whole window */
export type BackLink = { from: string; to: string; points: number };

export type Backing = {
	/** everybody who backed or was backed, the busiest first */
	people: PersonCard[];
	links: BackLink[];
};

/**
 * Who backs whom: every point somebody spent on a film somebody else nominated,
 * from the one to the other. A person's own films are left out, since that is
 * what the openness chart is for; here a link is always between two people. A
 * pair backing each other is two links, one each way, and neither is netted
 * against the other.
 */
export function backing(db: DB, window: Window): Backing {
	const cards = people(db);
	const rows = db
		.prepare(
			`SELECT b.person_id AS "from", f.added_by AS "to", SUM(b.points) AS points
			 FROM ballot b JOIN film f ON f.id = b.film_id
			 WHERE b.week_number BETWEEN ? AND ? AND f.added_by != b.person_id
			 GROUP BY b.person_id, f.added_by
			 HAVING points > 0`
		)
		.all(window.from, window.to) as BackLink[];

	const links = rows.filter((row) => cards.has(row.from) && cards.has(row.to));
	const total = new Map<string, number>();
	for (const link of links) {
		total.set(link.from, (total.get(link.from) ?? 0) + link.points);
		total.set(link.to, (total.get(link.to) ?? 0) + link.points);
	}
	return {
		people: [...total.keys()]
			.map((id) => cards.get(id)!)
			.sort((a, b) => total.get(b.id)! - total.get(a.id)! || a.name.localeCompare(b.name)),
		links: links.sort((a, b) => b.points - a.points)
	};
}

/* ----------------------------------------------------------------- films -- */

export type WatchedFilm = {
	id: number;
	title: string;
	year: number | null;
	director: string | null;
	genre: string | null;
	runtime: number | null;
	/** ISO alpha-2 production countries, empty until TMDB said */
	countries: string[];
	posterUrl: string | null;
	evening: number;
	/** when it was watched, ISO */
	at: string;
	addedBy: string;
	addedByName: string;
};

/**
 * Every evening on record, whatever era it belongs to, outings included. The
 * canon is what the group has watched, and half of it predates the first ballot;
 * narrowing it to the rounds with votes in them would leave two films and nothing
 * to look at.
 */
export function watchedFilms(db: DB): WatchedFilm[] {
	const rows = db
		.prepare(
			`SELECT f.id, f.title, f.year, f.director, f.genre, f.runtime, f.countries, f.poster_url,
			        f.watched_week, f.added_by, p.name AS added_by_name,
			        COALESCE(f.watched_at, fw.closes_at) AS at
			 FROM film f JOIN person p ON p.id = f.added_by JOIN week fw ON fw.number = f.watched_week
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
		countries: string | null;
		poster_url: string | null;
		watched_week: number;
		added_by: string;
		added_by_name: string;
		at: string;
	}[];

	const evenings = filmEvenings(db);
	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		year: row.year,
		director: row.director,
		genre: row.genre,
		runtime: row.runtime,
		countries: row.countries ? row.countries.split(',') : [],
		posterUrl: row.poster_url,
		evening: evenings.get(row.id) ?? 0,
		at: row.at,
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

/** a co-production belongs to every country that made it, so a film can count more than once */
export function byCountry(films: WatchedFilm[]): Bucket[] {
	const out = new Map<string, number[]>();
	for (const film of films) {
		for (const code of new Set(film.countries.map((c) => SUCCESSOR[c] ?? c))) {
			const ids = out.get(code) ?? [];
			ids.push(film.id);
			out.set(code, ids);
		}
	}
	return [...out.entries()]
		.map(([code, ids]) => ({ key: `c:${code}`, label: code, films: ids }))
		.sort((a, b) => b.films.length - a.films.length || a.label.localeCompare(b.label));
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

/** one film as a bar: its poster is the label, the number is the length */
export type FilmBar = {
	id: number;
	title: string;
	posterUrl: string | null;
	value: number;
};

export type ScreenStats = {
	/**
	 * Nights the app itself resolved, which is the only honest basis for any of
	 * this. A backfilled record was written down as nominated and watched in the
	 * same week and carries no score, so counting those would put the typical
	 * wait at nothing and the typical winner at no points at all. A special
	 * round's night (§3.6) is out for the same reason: its film was put up that
	 * week and won on ticks, not points.
	 */
	nights: number;
	/** rounds each of them spent on the list before reaching the screen */
	waits: FilmBar[];
	meanWait: number;
	/** what each of them won with */
	scores: FilmBar[];
	meanScore: number;
	/** films still on the list, and how long each has been on it */
	waiting: FilmBar[];
};

export type FilmFacts = {
	longest: FilmBar | null;
	shortest: FilmBar | null;
	oldest: FilmBar | null;
};

/**
 * The canon's extremes. The charts below them draw distributions; these are
 * the facts a distribution cannot say, which is the ones with a film's name
 * attached.
 */
export function filmFacts(films: WatchedFilm[]): FilmFacts {
	const bar = (film: WatchedFilm, value: number): FilmBar => ({
		id: film.id,
		title: film.title,
		posterUrl: film.posterUrl,
		value
	});
	const pick = (
		rows: WatchedFilm[],
		of: (film: WatchedFilm) => number | null,
		beats: (a: number, b: number) => boolean
	) => {
		let best: { film: WatchedFilm; value: number } | null = null;
		for (const film of rows) {
			const value = of(film);
			if (value === null || value <= 0) continue;
			if (!best || beats(value, best.value)) best = { film, value };
		}
		return best ? bar(best.film, best.value) : null;
	};

	return {
		longest: pick(films, (film) => film.runtime, (a, b) => a > b),
		shortest: pick(films, (film) => film.runtime, (a, b) => a < b),
		oldest: pick(films, (film) => film.year, (a, b) => a < b)
	};
}

/** what it takes for a film to get watched: how long it waits and what it wins with */
export function screenStats(db: DB): ScreenStats | null {
	const won = db
		.prepare(
			`SELECT id, title, poster_url, added_week, watched_week, final_score FROM film
			 WHERE status = 'watched' AND final_score IS NOT NULL AND watched_week IS NOT NULL
			   AND special IS NULL`
		)
		.all() as {
		id: number;
		title: string;
		poster_url: string | null;
		added_week: number;
		watched_week: number;
		final_score: number;
	}[];
	if (!won.length) return null;

	const mean = (values: number[]) => values.reduce((sum, n) => sum + n, 0) / values.length;
	const longest = (a: FilmBar, b: FilmBar) => b.value - a.value || a.title.localeCompare(b.title);

	const waits = won
		.map((film) => ({
			id: film.id,
			title: film.title,
			posterUrl: film.poster_url,
			value: Math.max(0, film.watched_week - film.added_week)
		}))
		.sort(longest);
	const scores = won
		.map((film) => ({
			id: film.id,
			title: film.title,
			posterUrl: film.poster_url,
			value: film.final_score
		}))
		.sort(longest);

	// still on the list, measured against the round that is open now
	const now = latestWeek(db);
	const waiting = (
		db
			.prepare(
				`SELECT id, title, poster_url, added_week FROM film
				 WHERE status = 'active' AND archival = 0 AND special IS NULL`
			)
			.all() as { id: number; title: string; poster_url: string | null; added_week: number }[]
	)
		.map((film) => ({
			id: film.id,
			title: film.title,
			posterUrl: film.poster_url,
			value: Math.max(0, now - film.added_week)
		}))
		.sort(longest);

	return {
		nights: won.length,
		waits,
		meanWait: mean(waits.map((film) => film.value)),
		scores,
		meanScore: mean(scores.map((film) => film.value)),
		waiting
	};
}

export type PassedOver = FilmBar & { status: Exclude<Film['status'], 'watched'> };

/**
 * Films the room has seen at least twice and turned down every time, which have
 * not been watched since. `value` is how many rooms. Read off the closed rooms
 * themselves, so it is retroactive to the first one, and not windowed like the
 * canon around it: a room is a night of its own, not a round of the era switch.
 * A special night's pick is out, since it is put up for one room and never again.
 */
export function bridesmaids(db: DB): PassedOver[] {
	return (
		db
			.prepare(
				`SELECT f.id, f.title, f.poster_url, f.status, COUNT(*) AS n
				 FROM runoff_film rf
				 JOIN runoff r ON r.id = rf.runoff_id
				 JOIN film f ON f.id = rf.film_id
				 WHERE r.closed_at IS NOT NULL AND r.winner_film_id != f.id
				   AND f.special IS NULL AND f.status != 'watched'
				 GROUP BY f.id
				 HAVING n >= 2 AND NOT EXISTS (SELECT 1 FROM runoff w WHERE w.winner_film_id = f.id)
				 ORDER BY n DESC, f.title`
			)
			.all() as {
			id: number;
			title: string;
			poster_url: string | null;
			status: PassedOver['status'];
			n: number;
		}[]
	).map((row) => ({
		id: row.id,
		title: row.title,
		posterUrl: row.poster_url,
		value: row.n,
		status: row.status
	}));
}

export type Comeback = {
	id: number;
	title: string;
	posterUrl: string | null;
	/** how many times it had dropped off before this one */
	drops: number;
	/** rounds between the first nomination and the one it came back in */
	weeks: number;
	/** the evening it was watched on, or null while it is still on the list */
	evening: number | null;
};

/**
 * Films that dropped off the list and were nominated again (§4.1: a dropped
 * film comes back as a new row), which are on the list or on the screen now.
 * The old row is the evidence, matched to the new one the way the duplicate
 * check matches them. A special night's pick is out: the list film it came from
 * is dropped when the pick wins, and that is not a film coming back.
 */
export function comebacks(db: DB): Comeback[] {
	const evenings = filmEvenings(db);
	return (
		db
			.prepare(
				`SELECT o.id, o.title, o.poster_url, o.status, o.added_week,
				        COUNT(d.id) AS drops, MIN(d.added_week) AS first_week
				 FROM film o JOIN film d ON d.id < o.id
				   AND d.status = 'dropped' AND d.archival = 0 AND d.special IS NULL
				   AND (d.title_key = o.title_key OR (o.tmdb_id IS NOT NULL AND d.tmdb_id = o.tmdb_id))
				 WHERE o.status IN ('active', 'watched') AND o.archival = 0 AND o.special IS NULL
				 GROUP BY o.id
				 ORDER BY o.id DESC`
			)
			.all() as {
			id: number;
			title: string;
			poster_url: string | null;
			status: Film['status'];
			added_week: number;
			drops: number;
			first_week: number;
		}[]
	).map((row) => ({
		id: row.id,
		title: row.title,
		posterUrl: row.poster_url,
		drops: row.drops,
		weeks: Math.max(0, row.added_week - row.first_week),
		evening: row.status === 'watched' ? (evenings.get(row.id) ?? null) : null
	}));
}

/** fewer films than this make a line out of noise */
const MIN_TIMELINE = 8;

/**
 * Whether what we watch is changing over time: each film's release year and
 * running time against the day it was watched, one dot a film. The days are the
 * real ones, so the year the app was not around shows as the gap it was. A film
 * with no year (or no runtime) is missing from that series only. Too few films
 * is no trend, so a series with fewer than MIN_TIMELINE dots is empty.
 */
export function timelines(films: WatchedFilm[]): { year: TimePoint[]; runtime: TimePoint[] } {
	const ordered = [...films].sort((a, b) => a.evening - b.evening);
	const series = (value: (film: WatchedFilm) => number | null): TimePoint[] => {
		const points = ordered.flatMap((film) => {
			const v = value(film);
			return v === null ? [] : [{ title: film.title, day: Math.floor(Date.parse(film.at) / 86_400_000), value: v }];
		});
		return points.length < MIN_TIMELINE ? [] : points;
	};
	return { year: series((film) => film.year), runtime: series((film) => film.runtime) };
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
