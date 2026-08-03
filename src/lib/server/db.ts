import Database from 'better-sqlite3';
import { SCHEMA } from './schema.js';

export type DB = Database.Database;

export function applySchema(db: DB): void {
	db.pragma('foreign_keys = ON');
	db.exec(SCHEMA);
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
 */
export function immediate<T>(db: DB, fn: () => T): T {
	const tx = db.transaction(fn);
	return tx.immediate();
}
