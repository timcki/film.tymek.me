import Database from 'better-sqlite3';
import { ADDED_COLUMNS, LATE_INDEXES, SCHEMA } from './schema.js';
import { bumpGeneration } from './live.js';

export type DB = Database.Database;

function hasColumn(db: DB, table: string, column: string): boolean {
	const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
	return columns.some((c) => c.name === column);
}

export function applySchema(db: DB): void {
	db.pragma('foreign_keys = ON');
	db.exec(SCHEMA);
	for (const [table, column, decl] of ADDED_COLUMNS) {
		if (!hasColumn(db, table, column)) {
			db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
		}
	}
	for (const statement of LATE_INDEXES) db.exec(statement);
	// idempotent data seed: flash votes cast before the attendance table existed
	// still mean the person was in the room that night
	db.exec(
		`INSERT OR IGNORE INTO attendance (week_number, person_id, checked_in_at)
		 SELECT r.week_number, rb.person_id, rb.created_at
		 FROM runoff_ballot rb JOIN runoff r ON r.id = rb.runoff_id
		 WHERE rb.person_id IS NOT NULL`
	);
}

/** opens a database at `path` and makes sure the schema is present */
export function openDatabase(path: string): DB {
	const db = new Database(path);
	if (path !== ':memory:') db.pragma('journal_mode = WAL');
	db.pragma('busy_timeout = 5000');
	applySchema(db);
	return db;
}

let instance: DB | null = null;

export function getDb(): DB {
	if (!instance) {
		const path = process.env.DATABASE_PATH ?? 'data/filmnight.db';
		instance = openDatabase(path);
	}
	return instance;
}

/**
 * BEGIN IMMEDIATE takes the write lock up front, so two concurrent mutations
 * serialise instead of one failing at COMMIT with SQLITE_BUSY_SNAPSHOT.
 *
 * Every mutation passing through here is also what makes it the place to tell
 * the open lists that something changed (live.ts). Only once the outermost
 * transaction has committed: a nested call is a savepoint, and a phone that
 * reloaded on it would read the state from before the commit it was told about.
 * And only when a row actually changed, or the scheduler's minutely pass would
 * send every phone to reload once a minute for nothing.
 */
export function immediate<T>(db: DB, fn: () => T): T {
	const outermost = !db.inTransaction;
	const before = outermost ? totalChanges(db) : 0;
	const result = db.transaction(fn).immediate();
	if (outermost && totalChanges(db) !== before) bumpGeneration();
	return result;
}

function totalChanges(db: DB): number {
	return (db.prepare('SELECT total_changes() AS n').get() as { n: number }).n;
}
