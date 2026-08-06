import type { DB } from './db.js';
import { immediate } from './db.js';
import type { Face, Film, FilmStatus } from './types.js';
import { RuleError } from './types.js';
import type { RuleSet } from './rules.js';
import { titleKey } from './rules.js';
import { iso } from './time.js';
import { newToken, slugify } from './tokens.js';
import { rescoreAll, scoreFor } from './scoring.js';
import { rexpAll } from './xp.js';
import { avatarUrl } from './people.js';

/**
 * Everything the admin screens can change. Kept apart from films.ts and
 * people.ts because these are the operations that bypass the rules rather than
 * enforce them: they exist to fix mistakes, and every one of them is logged.
 */

/* ------------------------------------------------------------------ people -- */

export type ManagedPerson = {
	id: string;
	name: string;
	colour: string;
	active: number;
	is_admin: number;
	avatar: string | null;
	balance: number;
	nominated: number;
	watched: number;
	created_at: string;
};

export function managedPeople(db: DB): ManagedPerson[] {
	const rows = db
		.prepare(
			`SELECT p.id, p.name, p.colour, p.active, p.is_admin, p.created_at, p.avatar_updated_at,
			        COALESCE(b.balance, 0) AS balance,
			        COUNT(f.id) AS nominated,
			        COUNT(f.id) FILTER (WHERE f.status = 'watched') AS watched
			 FROM person p
			 LEFT JOIN bank b ON b.person_id = p.id
			 LEFT JOIN film f ON f.added_by = p.id
			 GROUP BY p.id
			 ORDER BY p.active DESC, p.name COLLATE NOCASE`
		)
		.all() as (Omit<ManagedPerson, 'avatar'> & { avatar_updated_at: string | null })[];
	return rows.map(({ avatar_updated_at, ...person }) => ({
		...person,
		avatar: avatarUrl(person.id, avatar_updated_at)
	}));
}

const HEX = /^#[0-9a-f]{6}$/i;

function cleanName(name: string): string {
	const trimmed = name.trim().replace(/\s+/g, ' ');
	if (!trimmed) throw new RuleError('name_required', 'give them a name');
	if (trimmed.length > 60) throw new RuleError('name_too_long', 'that name is too long', { max: 60 });
	return trimmed;
}

function cleanColour(colour: string): string {
	if (!HEX.test(colour.trim())) throw new RuleError('bad_colour', 'that is not a #rrggbb colour');
	return colour.trim().toLowerCase();
}

/** a new person starts with one week's points, §3.3, exactly as the seed does */
export function createPerson(db: DB, rules: RuleSet, name: string, colour: string): string {
	return immediate(db, () => {
		const clean = cleanName(name);
		const id = slugify(clean);
		if (!id) throw new RuleError('name_required', 'that name has no letters in it');
		const taken = db.prepare('SELECT 1 FROM person WHERE id = ?').get(id);
		if (taken) throw new RuleError('person_exists', `${clean} is already on the roster`, { name: clean });
		db.prepare(
			`INSERT INTO person (id, name, colour, token, active, created_at) VALUES (?, ?, ?, ?, 1, ?)`
		).run(id, clean, cleanColour(colour), newToken(), iso());
		db.prepare(`INSERT INTO bank (person_id, balance, updated_at) VALUES (?, ?, ?)`).run(
			id,
			rules.pointsPerWeek,
			iso()
		);
		return id;
	});
}

/** the id is never rewritten: it is what every film and ballot points at */
export function renamePerson(db: DB, id: string, name: string, colour: string): void {
	const person = db.prepare('SELECT 1 FROM person WHERE id = ?').get(id);
	if (!person) throw new RuleError('no_person', 'no such person');
	db.prepare('UPDATE person SET name = ?, colour = ? WHERE id = ?').run(
		cleanName(name),
		cleanColour(colour),
		id
	);
}

/**
 * Deactivating hides someone from the roster and stops their link working, but
 * keeps every film and ballot they ever cast, so the history stays true.
 */
export function setPersonActive(db: DB, id: string, active: boolean): void {
	immediate(db, () => {
		const person = db.prepare('SELECT is_admin FROM person WHERE id = ?').get(id) as
			| { is_admin: number }
			| undefined;
		if (!person) throw new RuleError('no_person', 'no such person');
		if (!active && person.is_admin) assertNotLastAdmin(db, id);
		db.prepare('UPDATE person SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
	});
}

function assertNotLastAdmin(db: DB, id: string): void {
	const others = db
		.prepare('SELECT COUNT(*) AS n FROM person WHERE is_admin = 1 AND active = 1 AND id != ?')
		.get(id) as { n: number };
	if (others.n === 0) throw new RuleError('last_admin', 'that is the last admin; promote someone first');
}

export function setPersonAdmin(db: DB, actorId: string, id: string, admin: boolean): void {
	immediate(db, () => {
		const person = db.prepare('SELECT 1 FROM person WHERE id = ?').get(id);
		if (!person) throw new RuleError('no_person', 'no such person');
		if (!admin) {
			// locking yourself out is always a mistake, and so is emptying the room
			if (id === actorId) throw new RuleError('not_yourself', 'ask the other admin to do that');
			assertNotLastAdmin(db, id);
		}
		db.prepare('UPDATE person SET is_admin = ? WHERE id = ?').run(admin ? 1 : 0, id);
	});
}

export function setBank(db: DB, rules: RuleSet, id: string, balance: number): void {
	if (!Number.isInteger(balance) || balance < 0 || balance > rules.bankCap) {
		throw new RuleError('bad_balance', `a bank holds 0 to ${rules.bankCap} points`, {
			cap: rules.bankCap
		});
	}
	db.prepare(
		`INSERT INTO bank (person_id, balance, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(person_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at`
	).run(id, balance, iso());
}

/* ------------------------------------------------------------------- films -- */

export type ManagedFilm = Film & {
	added_by_name: string;
	added_by_face: Face;
	/**
	 * false while a film is still credited to somebody off the roster. The year of
	 * nights that predate the app all landed on one inactive stand-in account, and
	 * this is what counts down as they are handed back to the people who chose them
	 */
	attributed: boolean;
	ballots: number;
	raw_points: number;
};

type FilmRow = Omit<ManagedFilm, 'added_by_face' | 'attributed'> & {
	added_by_colour: string | null;
	added_by_avatar_at: string | null;
	added_by_active: number | null;
};

/** every column the two admin screens read, with the face already joined on */
const FILM_SELECT = `SELECT f.*, COALESCE(p.name, f.added_by) AS added_by_name,
        p.colour AS added_by_colour, p.avatar_updated_at AS added_by_avatar_at,
        p.active AS added_by_active,
        (SELECT COUNT(*) FROM ballot b WHERE b.film_id = f.id) AS ballots,
        (SELECT COALESCE(SUM(b.points), 0) FROM ballot b WHERE b.film_id = f.id) AS raw_points
 FROM film f LEFT JOIN person p ON p.id = f.added_by`;

function toManaged(row: FilmRow): ManagedFilm {
	const { added_by_colour, added_by_avatar_at, added_by_active, ...film } = row;
	return {
		...film,
		added_by_face: {
			id: film.added_by,
			name: film.added_by_name,
			colour: added_by_colour ?? '#6c7079',
			avatar: avatarUrl(film.added_by, added_by_avatar_at)
		},
		attributed: added_by_active === 1
	};
}

export type RoundFilm = ManagedFilm & { backers: Face[] };

/** the films in play: what the room is voting on, and what has fallen out of it */
export function roundFilms(db: DB): RoundFilm[] {
	const rows = db
		.prepare(
			`${FILM_SELECT}
			 WHERE f.archival = 0 AND f.status != 'watched'
			 ORDER BY CASE f.status WHEN 'active' THEN 0 WHEN 'archived' THEN 1 ELSE 2 END,
			          f.score DESC, f.title COLLATE NOCASE`
		)
		.all() as FilmRow[];
	const backers = backersFor(
		db,
		rows.map((row) => row.id)
	);
	return rows.map((row) => ({ ...toManaged(row), backers: backers.get(row.id) ?? [] }));
}

/** who is holding each of these films up, heaviest backer first */
function backersFor(db: DB, filmIds: number[]): Map<number, Face[]> {
	const faces = new Map<number, Face[]>();
	if (!filmIds.length) return faces;
	const rows = db
		.prepare(
			`SELECT b.film_id, p.id, p.name, p.colour, p.avatar_updated_at, SUM(b.points) AS points
			 FROM ballot b JOIN person p ON p.id = b.person_id
			 WHERE b.film_id IN (${filmIds.map(() => '?').join(',')})
			 GROUP BY b.film_id, p.id
			 HAVING points > 0
			 ORDER BY points DESC, p.name COLLATE NOCASE`
		)
		.all(...filmIds) as {
		film_id: number;
		id: string;
		name: string;
		colour: string;
		avatar_updated_at: string | null;
	}[];
	for (const row of rows) {
		const face: Face = {
			id: row.id,
			name: row.name,
			colour: row.colour,
			avatar: avatarUrl(row.id, row.avatar_updated_at)
		};
		faces.set(row.film_id, [...(faces.get(row.film_id) ?? []), face]);
	}
	return faces;
}

export type ArchiveWeek = {
	number: number;
	closes_at: string;
	/** the film the room watched that night, if the record knows one */
	winner: ManagedFilm | null;
	/** everything else written down against that night, never watched */
	proposed: ManagedFilm[];
};

/**
 * The record, a night at a time, newest first. Every week gets a card even with
 * nothing against it: a night nobody wrote down is exactly what the screen is
 * there to make visible.
 */
export function archiveByWeek(db: DB): ArchiveWeek[] {
	const weeks = db
		.prepare('SELECT number, closes_at FROM week ORDER BY number DESC')
		.all() as { number: number; closes_at: string }[];
	const rows = db
		.prepare(
			`${FILM_SELECT}
			 WHERE f.status = 'watched' OR f.archival = 1
			 ORDER BY f.title COLLATE NOCASE`
		)
		.all() as FilmRow[];

	const byNight = new Map<number, ManagedFilm[]>();
	for (const row of rows) {
		const film = toManaged(row);
		const night = nightOf(film);
		byNight.set(night, [...(byNight.get(night) ?? []), film]);
	}

	return weeks.map((week) => {
		const films = byNight.get(week.number) ?? [];
		return {
			number: week.number,
			closes_at: week.closes_at,
			winner: films.find((film) => film.status === 'watched') ?? null,
			proposed: films.filter((film) => film.status !== 'watched')
		};
	});
}

/** how much of the record is still sitting on a stand-in account */
export function unattributedCount(db: DB): { done: number; total: number } {
	const row = db
		.prepare(
			`SELECT COUNT(*) AS total,
			        COUNT(*) FILTER (WHERE p.active = 1) AS done
			 FROM film f LEFT JOIN person p ON p.id = f.added_by
			 WHERE f.status = 'watched' OR f.archival = 1`
		)
		.get() as { total: number; done: number };
	return row;
}

function filmOr404(db: DB, id: number): Film {
	const film = db.prepare('SELECT * FROM film WHERE id = ?').get(id) as Film | undefined;
	if (!film) throw new RuleError('no_film', 'no such film');
	return film;
}

export function setFilmStatus(db: DB, rules: RuleSet, id: number, status: FilmStatus, week: number): void {
	immediate(db, () => {
		const film = filmOr404(db, id);
		if (status === 'watched') {
			throw new RuleError('use_mark_watched', 'use "mark watched" so the week is recorded');
		}
		if (film.status === 'watched') {
			db.prepare('UPDATE week SET winner_film_id = NULL WHERE winner_film_id = ?').run(id);
		}
		db.prepare('UPDATE film SET status = ?, watched_week = NULL, final_score = NULL WHERE id = ?').run(
			status,
			id
		);
		rescoreAll(db, rules, week);
		rexpAll(db);
	});
}

/** for a night that happened before the app, or one somebody forgot to close */
export function markWatched(db: DB, rules: RuleSet, id: number, week: number, current: number): void {
	immediate(db, () => {
		filmOr404(db, id);
		// without this the second film to be marked silently orphans the first, which
		// keeps status 'watched' on a week it is no longer the winner of, and the
		// history page and the film list stop agreeing about that night
		assertWinnerFree(db, week, id);
		// and this releases the night it used to hold, for the same reason
		db.prepare('UPDATE week SET winner_film_id = NULL WHERE winner_film_id = ?').run(id);
		// the frozen score is a permanent record, so take it from the ballots rather
		// than trusting whatever the cache happened to hold
		const score = scoreFor(db, rules, id, week);
		db.prepare(
			`UPDATE film SET status = 'watched', watched_week = ?, final_score = ? WHERE id = ?`
		).run(week, score, id);
		db.prepare('UPDATE week SET winner_film_id = ? WHERE number = ?').run(id, week);
		rescoreAll(db, rules, current);
		rexpAll(db);
	});
}

export type FilmEdit = {
	title: string;
	year: number | null;
	director: string | null;
	genre: string | null;
	runtime: number | null;
	posterUrl: string | null;
	note: string | null;
};

export function editFilm(db: DB, id: number, edit: FilmEdit): void {
	immediate(db, () => {
		filmOr404(db, id);
		const title = edit.title.trim();
		if (!title) throw new RuleError('no_title', 'give the film a title');
		const clash = db
			.prepare(`SELECT id FROM film WHERE title_key = ? AND id != ? AND status != 'dropped'`)
			.get(titleKey(title), id) as { id: number } | undefined;
		if (clash) throw new RuleError('dup_active', `${title} is already on the list`, { title });
		db.prepare(
			`UPDATE film SET title = ?, title_key = ?, year = ?, director = ?, genre = ?, runtime = ?,
			                 poster_url = ?, note = ? WHERE id = ?`
		).run(
			title,
			titleKey(title),
			edit.year,
			edit.director?.trim() || null,
			edit.genre?.trim() || null,
			edit.runtime,
			edit.posterUrl?.trim() || null,
			edit.note?.trim() || null,
			id
		);
	});
}

/**
 * The night a film belongs to on the archive screen: when we watched it if we
 * did, otherwise the round it was put up for. The two are the same for every
 * backfilled row, and come apart for a film nominated in week 45 that won in 47.
 */
export function nightOf(film: Film): number {
	return film.watched_week ?? film.added_week;
}

function personOr404(db: DB, personId: string): void {
	const person = db.prepare('SELECT 1 FROM person WHERE id = ?').get(personId);
	if (!person) throw new RuleError('no_person', 'no such person');
}

function weekOr404(db: DB, week: number): { winner_film_id: number | null } {
	const row = db.prepare('SELECT winner_film_id FROM week WHERE number = ?').get(week) as
		| { winner_film_id: number | null }
		| undefined;
	if (!row) throw new RuleError('no_such_week', `there is no week ${week}`, { week });
	return row;
}

/** a week holds one night, so its winner slot is either free or somebody else's */
function assertWinnerFree(db: DB, week: number, filmId: number | null): void {
	const held = weekOr404(db, week).winner_film_id;
	if (held !== null && held !== filmId) {
		const film = filmOr404(db, held);
		throw new RuleError('week_has_winner', `week ${week} is already ${film.title}`, {
			week,
			title: film.title
		});
	}
}

function claimWinner(db: DB, week: number, filmId: number): void {
	assertWinnerFree(db, week, filmId);
	db.prepare('UPDATE week SET winner_film_id = ? WHERE number = ?').run(filmId, week);
}

/**
 * Both halves of "who suggested this, and which night was it": one call, because
 * the archive is rebuilt by correcting the two together and doing them in
 * sequence would trip the one-per-round index halfway.
 *
 * For a film we watched, the week given is the night it was shown. added_week
 * follows it only where the two already agreed, which is how every backfilled
 * row is written; a real nomination that won weeks later keeps the round it was
 * put up in.
 */
export function setFilmAttribution(db: DB, id: number, personId: string, week: number): void {
	immediate(db, () => {
		const film = filmOr404(db, id);
		personOr404(db, personId);
		weekOr404(db, week);

		const watched = film.status === 'watched';
		const addedWeek = watched && film.added_week !== film.watched_week ? film.added_week : week;

		// only rows the index covers can collide, so history rearranges freely
		if (!film.archival && !watched) {
			const clash = db
				.prepare(
					`SELECT id FROM film
					 WHERE added_by = ? AND added_week = ? AND id != ? AND archival = 0 AND status != 'watched'`
				)
				.get(personId, addedWeek, id) as { id: number } | undefined;
			if (clash) {
				throw new RuleError('nomination_clash', 'they already nominated something that week');
			}
		}

		if (watched && week !== film.watched_week) {
			// let go of the old night before claiming the new one, or moving a film
			// one week forward would collide with itself
			db.prepare('UPDATE week SET winner_film_id = NULL WHERE winner_film_id = ?').run(id);
			claimWinner(db, week, id);
		}

		db.prepare(
			`UPDATE film SET added_by = ?, added_week = ?, watched_week = ? WHERE id = ?`
		).run(personId, addedWeek, watched ? week : film.watched_week, id);
	});
}

/** moves a nomination to whoever actually suggested it, §4 fairness table included */
export function reassignFilm(db: DB, id: number, personId: string): void {
	setFilmAttribution(db, id, personId, nightOf(filmOr404(db, id)));
}

export type ArchivalFilm = {
	title: string;
	year: number | null;
	director: string | null;
	genre: string | null;
	runtime: number | null;
	tmdbId: number | null;
	posterUrl: string | null;
	overview: string | null;
	personId: string;
	week: number;
	/** true when the room watched it that night, false when it was only proposed */
	watched: boolean;
	/** set once the admin has been shown a clash and said to go ahead anyway */
	allowDuplicate?: boolean;
};

/**
 * Writes down something that already happened. Unlike nominate() this needs no
 * open week, spends nobody's nomination slot and cannot disturb a row that is
 * already there, which is what made filling gaps in the archive by hand so
 * dangerous before.
 */
export function addArchivalFilm(db: DB, film: ArchivalFilm): number {
	return immediate(db, () => {
		const title = film.title.trim();
		if (!title) throw new RuleError('no_title', 'give the film a title');
		personOr404(db, film.personId);
		weekOr404(db, film.week);

		if (!film.allowDuplicate) {
			const key = titleKey(title);
			const clash = db
				.prepare(
					`SELECT title, added_week, watched_week, status FROM film
					 WHERE (title_key = ? OR (tmdb_id IS NOT NULL AND tmdb_id = ?))
					   AND status != 'dropped' LIMIT 1`
				)
				.get(key, film.tmdbId) as
				| { title: string; added_week: number; watched_week: number | null; status: string }
				| undefined;
			if (clash) {
				// not fatal: the same film genuinely comes up at more than one night
				throw new RuleError('dup_archival', `${clash.title} is already written down`, {
					title: clash.title,
					week: clash.watched_week ?? clash.added_week
				});
			}
		}

		// checked before the insert so a taken night fails without leaving a row behind
		if (film.watched) assertWinnerFree(db, film.week, null);

		const result = db
			.prepare(
				`INSERT INTO film (title, title_key, year, director, genre, runtime, tmdb_id, poster_url,
				                   overview, note, added_by, added_week, status, watched_week, final_score,
				                   score, created_at, archival)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, 0, ?, 1)`
			)
			.run(
				title,
				titleKey(title),
				film.year,
				film.director,
				film.genre,
				film.runtime,
				film.tmdbId,
				film.posterUrl,
				film.overview,
				film.personId,
				film.week,
				film.watched ? 'watched' : 'active',
				film.watched ? film.week : null,
				iso()
			);

		const id = Number(result.lastInsertRowid);
		// final_score stays NULL: nobody spent points on a night that predates the app
		if (film.watched) {
			db.prepare('UPDATE week SET winner_film_id = ? WHERE number = ?').run(id, film.week);
		}
		return id;
	});
}

/**
 * Only for something nominated by mistake. Anything anyone has voted for, or that
 * the room has been shown, is history and gets archived instead of erased.
 */
export function deleteFilm(db: DB, id: number): void {
	immediate(db, () => {
		const film = filmOr404(db, id);
		// an archival row is a written record, and a record typed wrong has to be
		// removable; what it can never have is ballots, which the checks below cover
		if (film.status === 'watched' && !film.archival) {
			throw new RuleError('film_watched', 'we watched that one');
		}
		const votes = db.prepare('SELECT COUNT(*) AS n FROM ballot WHERE film_id = ?').get(id) as {
			n: number;
		};
		if (votes.n) throw new RuleError('film_has_ballots', 'people voted for it; archive it instead');
		const shown = db.prepare('SELECT COUNT(*) AS n FROM runoff_film WHERE film_id = ?').get(id) as {
			n: number;
		};
		if (shown.n) throw new RuleError('film_has_ballots', 'the room has seen it; archive it instead');
		// let go of the night first, or the week is left pointing at nothing
		db.prepare('UPDATE week SET winner_film_id = NULL WHERE winner_film_id = ?').run(id);
		db.prepare('DELETE FROM film WHERE id = ?').run(id);
		rexpAll(db);
	});
}
