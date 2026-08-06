import type { DB } from './db.js';
import { immediate } from './db.js';
import type { Film, FilmStatus } from './types.js';
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
	ballots: number;
	raw_points: number;
};

export function managedFilms(db: DB): ManagedFilm[] {
	return db
		.prepare(
			`SELECT f.*, COALESCE(p.name, f.added_by) AS added_by_name,
			        (SELECT COUNT(*) FROM ballot b WHERE b.film_id = f.id) AS ballots,
			        (SELECT COALESCE(SUM(b.points), 0) FROM ballot b WHERE b.film_id = f.id) AS raw_points
			 FROM film f LEFT JOIN person p ON p.id = f.added_by
			 ORDER BY CASE f.status WHEN 'active' THEN 0 WHEN 'archived' THEN 1
			                        WHEN 'dropped' THEN 2 ELSE 3 END,
			          f.score DESC, f.title COLLATE NOCASE`
		)
		.all() as ManagedFilm[];
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
		const exists = db.prepare('SELECT 1 FROM week WHERE number = ?').get(week);
		if (!exists) throw new RuleError('no_such_week', `there is no week ${week}`, { week });
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

/** moves a nomination to whoever actually suggested it, §4 fairness table included */
export function reassignFilm(db: DB, id: number, personId: string): void {
	immediate(db, () => {
		const film = filmOr404(db, id);
		const person = db.prepare('SELECT 1 FROM person WHERE id = ?').get(personId);
		if (!person) throw new RuleError('no_person', 'no such person');
		const clash = db
			.prepare('SELECT id FROM film WHERE added_by = ? AND added_week = ? AND id != ?')
			.get(personId, film.added_week, id) as { id: number } | undefined;
		if (clash) {
			throw new RuleError('nomination_clash', 'they already nominated something that week');
		}
		db.prepare('UPDATE film SET added_by = ? WHERE id = ?').run(personId, id);
	});
}

/**
 * Only for something nominated by mistake. Anything anyone has voted for, or that
 * the room has been shown, is history and gets archived instead of erased.
 */
export function deleteFilm(db: DB, id: number): void {
	immediate(db, () => {
		const film = filmOr404(db, id);
		if (film.status === 'watched') throw new RuleError('film_watched', 'we watched that one');
		const votes = db.prepare('SELECT COUNT(*) AS n FROM ballot WHERE film_id = ?').get(id) as {
			n: number;
		};
		if (votes.n) throw new RuleError('film_has_ballots', 'people voted for it; archive it instead');
		const shown = db.prepare('SELECT COUNT(*) AS n FROM runoff_film WHERE film_id = ?').get(id) as {
			n: number;
		};
		if (shown.n) throw new RuleError('film_has_ballots', 'the room has seen it; archive it instead');
		db.prepare('DELETE FROM film WHERE id = ?').run(id);
		rexpAll(db);
	});
}
