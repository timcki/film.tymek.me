import type { DB } from './db.js';
import { immediate } from './db.js';
import type { Face, Film, FilmStatus } from './types.js';
import { RuleError } from './types.js';
import type { RuleSet } from './rules.js';
import { titleKey } from './rules.js';
import { iso } from './time.js';
import { newToken, slugify } from './tokens.js';
import { listRound, rescoreAll } from './scoring.js';
import { rexpAll } from './xp.js';
import { avatarUrl } from './people.js';
import { cleanNote, cleanOverview, cleanPoster, cleanTitle } from './films.js';
import { filmEvenings } from './evenings.js';
import type { Outing } from '../outings.js';

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
	immediate(db, () => {
		const person = db.prepare('SELECT 1 FROM person WHERE id = ?').get(id);
		if (!person) throw new RuleError('no_person', 'no such person');
		db.prepare('UPDATE person SET name = ?, colour = ? WHERE id = ?').run(
			cleanName(name),
			cleanColour(colour),
			id
		);
	});
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
	immediate(db, () => {
		if (!db.prepare('SELECT 1 FROM person WHERE id = ?').get(id)) {
			throw new RuleError('no_person', 'no such person');
		}
		db.prepare(
			`INSERT INTO bank (person_id, balance, updated_at) VALUES (?, ?, ?)
			 ON CONFLICT(person_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at`
		).run(id, balance, iso());
	});
}

/* ------------------------------------------------------------------- films -- */

export type ManagedFilm = Film & {
	added_by_name: string;
	added_by_face: Face;
	ballots: number;
	raw_points: number;
	/** §3.6: ticks on a special round's pick, which also keep it from being deleted */
	approvals: number;
};

type FilmRow = Omit<ManagedFilm, 'added_by_face'> & {
	added_by_colour: string | null;
	added_by_avatar_at: string | null;
};

/** every column the two admin screens read, with the face already joined on */
const FILM_SELECT = `SELECT f.*, COALESCE(p.name, f.added_by) AS added_by_name,
        p.colour AS added_by_colour, p.avatar_updated_at AS added_by_avatar_at,
        (SELECT COUNT(*) FROM ballot b WHERE b.film_id = f.id) AS ballots,
        (SELECT COALESCE(SUM(b.points), 0) FROM ballot b WHERE b.film_id = f.id) AS raw_points,
        (SELECT COUNT(*) FROM approval a WHERE a.film_id = f.id) AS approvals
 FROM film f LEFT JOIN person p ON p.id = f.added_by`;

function toManaged(row: FilmRow): ManagedFilm {
	const { added_by_colour, added_by_avatar_at, ...film } = row;
	return {
		...film,
		added_by_face: {
			id: film.added_by,
			name: film.added_by_name,
			colour: added_by_colour ?? '#6c7079',
			avatar: avatarUrl(film.added_by, added_by_avatar_at)
		}
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

export type WatchedEvening = RoundFilm & {
	evening: number;
	/** when the evening was: an outing's own date, or its round's night */
	at: string;
};

/**
 * Every film we have watched, newest evening first: the record the admin keeps,
 * and the wall everybody else looks at.
 */
export function watchedRecord(db: DB): WatchedEvening[] {
	const evenings = filmEvenings(db);
	const nights = new Map(
		(db.prepare('SELECT number, closes_at FROM week').all() as { number: number; closes_at: string }[]).map(
			(week) => [week.number, week.closes_at]
		)
	);
	const rows = db.prepare(`${FILM_SELECT} WHERE f.status = 'watched'`).all() as FilmRow[];
	const backers = backersFor(
		db,
		rows.map((row) => row.id)
	);
	return rows
		.map((row) => {
			const film = toManaged(row);
			return {
				...film,
				backers: backers.get(film.id) ?? [],
				evening: evenings.get(film.id) ?? 0,
				at: film.watched_at ?? nights.get(film.watched_week ?? 0) ?? film.created_at
			};
		})
		.sort((a, b) => b.evening - a.evening);
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
			throw new RuleError('use_mark_watched', 'a round decides what we watch, or it is written down as watched');
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

export type FilmEdit = {
	title: string;
	year: number | null;
	director: string | null;
	genre: string | null;
	runtime: number | null;
	posterUrl: string | null;
	note: string | null;
};

/** the admin film editor's fields, read the way editFilm takes them */
export function filmEditFrom(form: FormData): FilmEdit {
	const number = (key: string) => {
		const raw = String(form.get(key) ?? '').trim();
		return raw ? Number(raw) : null;
	};
	return {
		title: String(form.get('title') ?? ''),
		year: number('year'),
		director: String(form.get('director') ?? ''),
		genre: String(form.get('genre') ?? ''),
		runtime: number('runtime'),
		posterUrl: String(form.get('poster') ?? ''),
		note: String(form.get('note') ?? '')
	};
}

export function editFilm(db: DB, id: number, edit: FilmEdit): void {
	immediate(db, () => {
		const film = filmOr404(db, id);
		const title = cleanTitle(edit.title);
		// only a rename can collide: a rewatch written down on purpose shares its
		// title with the first watching and still needs its poster fixed
		const clash =
			titleKey(title) !== film.title_key &&
			(db
				.prepare(`SELECT id FROM film WHERE title_key = ? AND id != ? AND status != 'dropped'`)
				.get(titleKey(title), id) as { id: number } | undefined);
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
			cleanPoster(edit.posterUrl),
			cleanNote(edit.note),
			id
		);
	});
}

function personOr404(db: DB, personId: string): void {
	const person = db.prepare('SELECT 1 FROM person WHERE id = ?').get(personId);
	if (!person) throw new RuleError('no_person', 'no such person');
}

/**
 * Moves a film to whoever actually suggested it, §4 fairness table included.
 * XP is rebuilt with it: a nomination and its watching both earn, and they now
 * earn for somebody else.
 */
export function reassignFilm(db: DB, id: number, personId: string): void {
	immediate(db, () => {
		const film = filmOr404(db, id);
		personOr404(db, personId);

		// only rows the index covers can collide, so history rearranges freely
		// over the list's round (§3.6), which a special round can split into two weeks
		if (!film.archival && film.status !== 'watched' && film.special === null) {
			const round = listRound(db, film.added_week);
			const clash = db
				.prepare(
					`SELECT id FROM film
					 WHERE added_by = ? AND id != ? AND added_week IN (${round.map(() => '?').join(',')})
					   AND archival = 0 AND status != 'watched' AND special IS NULL`
				)
				.get(personId, id, ...round) as { id: number } | undefined;
			if (clash) {
				throw new RuleError('nomination_clash', 'they already nominated something that round');
			}
		}

		db.prepare('UPDATE film SET added_by = ? WHERE id = ?').run(personId, id);
		rexpAll(db);
	});
}

export type RecordedFilm = {
	title: string;
	year: number | null;
	director: string | null;
	genre: string | null;
	runtime: number | null;
	countries?: string | null;
	tmdbId: number | null;
	posterUrl: string | null;
	overview: string | null;
	/** who suggested it */
	personId: string;
	/** when we watched it; for a film night, any moment of the round it closed is enough */
	at: Date;
	/** where we went instead, or null for a film night nobody wrote down at the time */
	outing: Outing | null;
	/** set once the admin has been shown a clash and said to go ahead anyway */
	allowDuplicate?: boolean;
};

/**
 * Writes down a film we watched together that no round decided: a film night
 * nobody logged, or an outing. Archival like a backfilled night, so it never
 * reaches the list, attrition or a ballot, and spends nobody's nomination. Whoever
 * types it in gives a date, never a week: the date finds the round it fell in.
 */
export function recordWatched(db: DB, film: RecordedFilm, now = new Date()): number {
	return immediate(db, () => {
		const title = cleanTitle(film.title);
		personOr404(db, film.personId);
		const round = eveningRound(db, film.at, film.outing, now);

		if (!film.allowDuplicate) {
			const clash = db
				.prepare(
					`SELECT id, title, status FROM film
					 WHERE (title_key = ? OR (tmdb_id IS NOT NULL AND tmdb_id = ?))
					   AND status IN ('active', 'archived', 'watched') AND special IS NULL
					 ORDER BY status = 'watched' DESC LIMIT 1`
				)
				.get(titleKey(title), film.tmdbId) as Pick<Film, 'id' | 'title' | 'status'> | undefined;
			if (clash) {
				// not fatal: the same film genuinely comes up at more than one evening
				const evening = clash.status === 'watched' ? (filmEvenings(db).get(clash.id) ?? 0) : 0;
				throw new RuleError(
					'dup_recorded',
					evening
						? `we already watched ${clash.title} on night ${evening}`
						: `${clash.title} is on the voting list`,
					{ title: clash.title, evening }
				);
			}
		}

		// final_score stays NULL: nobody spent points on it
		const result = db
			.prepare(
				`INSERT INTO film (title, title_key, year, director, genre, runtime, countries, tmdb_id,
				                   poster_url, overview, added_by, added_week, status, watched_week,
				                   outing, watched_at, score, created_at, archival)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'watched', ?, ?, ?, 0, ?, 1)`
			)
			.run(
				title,
				titleKey(title),
				film.year,
				film.director,
				film.genre,
				film.runtime,
				film.countries ?? null,
				film.tmdbId,
				cleanPoster(film.posterUrl),
				cleanOverview(film.overview),
				film.personId,
				round,
				round,
				film.outing,
				film.outing ? iso(film.at) : null,
				iso(now)
			);
		rexpAll(db);
		return Number(result.lastInsertRowid);
	});
}

/**
 * The round a written-down evening falls in. A film night is the round's own
 * night, so it has to have been had, and by no film but this one.
 */
function eveningRound(db: DB, at: Date, outing: Outing | null, now: Date, filmId: number | null = null): number {
	if (Number.isNaN(at.getTime())) throw new RuleError('bad_date', 'give a date and a time');
	if (at > now) throw new RuleError('watched_future', 'that has not happened yet');

	const round = db
		.prepare('SELECT number, closes_at FROM week WHERE closes_at >= ? ORDER BY number LIMIT 1')
		.get(iso(at)) as { number: number; closes_at: string } | undefined;
	if (!round) throw new RuleError('no_round_then', 'no round covers that date yet');

	if (!outing) {
		if (new Date(round.closes_at) > now) {
			throw new RuleError(
				'night_not_yet',
				'that round has not had its night yet; if it was an outing, say where'
			);
		}
		const taken = db
			.prepare(
				`SELECT title FROM film
				 WHERE status = 'watched' AND outing IS NULL AND watched_week = ? AND id IS NOT ?`
			)
			.get(round.number, filmId) as { title: string } | undefined;
		if (taken) {
			throw new RuleError(
				'night_taken',
				`that night we watched ${taken.title}; if this was a separate outing, say where`,
				{ title: taken.title }
			);
		}
	}
	return round.number;
}

/**
 * §2: a written-down evening put right, when it was and whether it was a film
 * night or somewhere we went instead. A film a round decided keeps the round's
 * night: that is what the round was for.
 */
export function moveWatched(db: DB, id: number, at: Date, outing: Outing | null, now = new Date()): void {
	immediate(db, () => {
		const film = filmOr404(db, id);
		if (film.status !== 'watched' || !film.archival) {
			throw new RuleError('not_a_record', 'a round decided that evening, so it keeps its night');
		}
		const round = eveningRound(db, at, outing, now, id);
		db.prepare(
			'UPDATE film SET added_week = ?, watched_week = ?, outing = ?, watched_at = ? WHERE id = ?'
		).run(round, round, outing, outing ? iso(at) : null, id);
		rexpAll(db);
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
		// §3.6: an approval is a special round's vote, and is history the same way
		const approved = db.prepare('SELECT COUNT(*) AS n FROM approval WHERE film_id = ?').get(id) as {
			n: number;
		};
		if (approved.n) throw new RuleError('film_has_ballots', 'people picked it; archive it instead');
		// let go of the night first, or the week is left pointing at nothing
		db.prepare('UPDATE week SET winner_film_id = NULL WHERE winner_film_id = ?').run(id);
		// what people said about a mistake goes with it; foreign keys refuse otherwise
		db.prepare(
			'DELETE FROM comment_react WHERE comment_id IN (SELECT id FROM film_comment WHERE film_id = ?)'
		).run(id);
		db.prepare('DELETE FROM film_comment WHERE film_id = ?').run(id);
		db.prepare('DELETE FROM film_seen WHERE film_id = ?').run(id);
		db.prepare('DELETE FROM film_hold WHERE film_id = ?').run(id);
		db.prepare('DELETE FROM film WHERE id = ?').run(id);
		rexpAll(db);
	});
}
