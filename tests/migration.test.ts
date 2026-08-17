import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applySchema } from '../src/lib/server/db.js';

/**
 * The archive work adds film.archival and narrows the one-per-person-per-week
 * index. Both have to land on the live database, which was created before either
 * existed and holds a year of backfilled history. These tests build a database
 * the old shape, seed it the way the backfill script left production, and check
 * that opening it with the current code changes nothing anybody can see.
 */

/** the film table and index exactly as they were before archival */
const OLD = `
CREATE TABLE person (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, colour TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE week (
  number INTEGER PRIMARY KEY, opens_at TEXT NOT NULL, closes_at TEXT NOT NULL,
  status TEXT NOT NULL, winner_film_id INTEGER REFERENCES film(id), resolved_at TEXT
);
CREATE TABLE film (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, title_key TEXT NOT NULL,
  year INTEGER, director TEXT, genre TEXT, runtime INTEGER, tmdb_id INTEGER,
  poster_url TEXT, overview TEXT, note TEXT,
  added_by TEXT NOT NULL REFERENCES person(id),
  added_week INTEGER NOT NULL REFERENCES week(number),
  status TEXT NOT NULL DEFAULT 'active', watched_week INTEGER REFERENCES week(number),
  final_score REAL, score REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX film_one_per_person_per_week ON film(added_by, added_week);
`;

const AT = '2025-01-01T00:00:00.000Z';

/** a database shaped like production the moment before this change ships */
function legacyDb(): Database.Database {
	const db = new Database(':memory:');
	db.exec(OLD);
	const person = db.prepare(
		'INSERT INTO person (id, name, colour, token, active, created_at) VALUES (?, ?, ?, ?, ?, ?)'
	);
	person.run('archiwum', 'Archiwum', '#6c7079', 'tok-archive', 0, AT);
	person.run('piotr', 'Piotr', '#334455', 'tok-piotr', 1, AT);

	const week = db.prepare(
		`INSERT INTO week (number, opens_at, closes_at, status) VALUES (?, ?, ?, 'closed')`
	);
	for (let n = 1; n <= 47; n++) week.run(n, AT, AT);

	const film = db.prepare(
		`INSERT INTO film (title, title_key, added_by, added_week, status, watched_week, score, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
	);
	// a backfilled night, credited to the archival account
	film.run('Come And See', 'come and see', 'archiwum', 12, 'watched', 12, AT);
	// and one of the two live propositions the backfill seeded onto the list
	film.run('Fitzcarraldo', 'fitzcarraldo', 'piotr', 45, 'active', null, AT);
	return db;
}

const indexNames = (db: Database.Database): string[] =>
	(db.prepare(`PRAGMA index_list(film)`).all() as { name: string }[]).map((row) => row.name);

describe('opening a database that predates the archive work', () => {
	it('adds archival to every existing row as 0, touching nothing else', () => {
		const db = legacyDb();
		applySchema(db);

		const films = db.prepare('SELECT title, status, added_week, archival FROM film ORDER BY id').all();
		expect(films).toEqual([
			{ title: 'Come And See', status: 'watched', added_week: 12, archival: 0 },
			{ title: 'Fitzcarraldo', status: 'active', added_week: 45, archival: 0 }
		]);
	});

	it('replaces the whole-table index with the one scoped to the open round', () => {
		const db = legacyDb();
		applySchema(db);

		expect(indexNames(db)).toContain('film_one_per_person_per_round');
		expect(indexNames(db)).not.toContain('film_one_per_person_per_week');
	});

	it('is idempotent across repeated opens, as a restart loop would do', () => {
		const db = legacyDb();
		applySchema(db);
		const after = indexNames(db).sort();
		applySchema(db);
		applySchema(db);
		expect(indexNames(db).sort()).toEqual(after);
		expect((db.prepare('SELECT COUNT(*) AS n FROM film').get() as { n: number }).n).toBe(2);
	});

	it('creates the film_comment table on a legacy database and keeps it usable', () => {
		const db = legacyDb();
		applySchema(db);
		applySchema(db);
		db.prepare(
			`INSERT INTO film_comment (film_id, person_id, body, created_at) VALUES (1, 'piotr', 'brutal', ?)`
		).run(AT);
		expect(
			(db.prepare('SELECT COUNT(*) AS n FROM film_comment').get() as { n: number }).n
		).toBe(1);
	});

	it('creates the film_seen table on a legacy database and keeps one mark per person', () => {
		const db = legacyDb();
		applySchema(db);
		applySchema(db);
		db.prepare(
			`INSERT INTO film_seen (film_id, person_id, created_at) VALUES (1, 'piotr', ?)`
		).run(AT);
		expect(() =>
			db
				.prepare(`INSERT INTO film_seen (film_id, person_id, created_at) VALUES (1, 'piotr', ?)`)
				.run(AT)
		).toThrow();
	});

	it('creates the comment_react table on a legacy database and keeps one feeling per person', () => {
		const db = legacyDb();
		applySchema(db);
		applySchema(db);
		db.prepare(
			`INSERT INTO film_comment (film_id, person_id, body, created_at) VALUES (1, 'piotr', 'brutal', ?)`
		).run(AT);
		db.prepare(
			`INSERT INTO comment_react (comment_id, person_id, emoji, created_at) VALUES (1, 'piotr', '💀', ?)`
		).run(AT);
		// the primary key keeps a repeat of the same feeling out
		expect(() =>
			db
				.prepare(
					`INSERT INTO comment_react (comment_id, person_id, emoji, created_at) VALUES (1, 'piotr', '💀', ?)`
				)
				.run(AT)
		).toThrow();
	});

	it('leaves the live proposition on the list, rather than reading it as history', () => {
		const db = legacyDb();
		applySchema(db);
		// added_week 45 is below the app's first week, so a boundary-based migration
		// would have swept this off the list; it is a nomination in play
		const row = db.prepare(`SELECT archival FROM film WHERE title = 'Fitzcarraldo'`).get();
		expect(row).toEqual({ archival: 0 });
	});
});

describe('what the narrowed index now permits', () => {
	it('accepts a second film for a week the person already won', () => {
		const db = legacyDb();
		applySchema(db);
		// re-crediting week 12's winner to Piotr, then writing down what he also
		// proposed that night: the pair the old index made impossible
		db.prepare(`UPDATE film SET added_by = 'piotr' WHERE title = 'Come And See'`).run();
		expect(() =>
			db
				.prepare(
					`INSERT INTO film (title, title_key, added_by, added_week, status, score, created_at, archival)
					 VALUES ('Stalker', 'stalker', 'piotr', 12, 'active', 0, ?, 1)`
				)
				.run(AT)
		).not.toThrow();
	});

	it('still holds one nomination per person per open round', () => {
		const db = legacyDb();
		applySchema(db);
		expect(() =>
			db
				.prepare(
					`INSERT INTO film (title, title_key, added_by, added_week, status, score, created_at, archival)
					 VALUES ('Solaris', 'solaris', 'piotr', 45, 'active', 0, ?, 0)`
				)
				.run(AT)
		).toThrow(/UNIQUE/);
	});
});
