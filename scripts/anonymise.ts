/**
 * Builds the public demo's database: a copy of production in which every person
 * is somebody made up, every avatar is gone and every line of free text has been
 * swapped for a canned one. Film titles, posters, directors, scores, ballots,
 * weeks, XP and the rule set are left exactly as they are, because they are the
 * part worth showing a stranger.
 *
 *   node .seed/anonymise.mjs /var/lib/filmnight/snapshot.db /var/lib/filmnight-demo/demo.db
 *
 * The source is never written to: it is copied first and every rewrite lands on
 * the copy. The privacy here is by absence rather than by masking, so the run
 * fails closed twice. A table this script has no rule for aborts it, because a
 * future table holding free text must not reach the demo by being forgotten; and
 * a final pass reads the vacuumed file back, column by column and then byte by
 * byte, looking for any source name, id, token or surviving blob. A hit deletes
 * the output.
 *
 * The VACUUM is not cosmetic. Without it the old names and avatar bytes stay
 * legible in the file's freed pages, which is the leak this whole design exists
 * to prevent, so the verification deliberately runs after it and on the file.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import type { DB } from '../src/lib/server/db.ts';
import { slugify } from '../src/lib/server/tokens.ts';
import { latestChangelogId } from '../src/lib/changelog.ts';

/**
 * Fixed, so the fake cast is the same person to person after every hourly
 * regeneration and a demo visitor's cookie survives the swap. The tokens it
 * derives are therefore public knowledge, which is fine: they open the demo and
 * nothing else, and the demo hands one out to anybody who visits anyway.
 */
const SEED = 0x5f11d3;

/** the inactive row that owns the backfilled archive weeks, see docs/operations.md */
const ARCHIVE_ID = 'archiwum';
/** what it is called in the demo: a label rather than anybody's name */
const ARCHIVE_NAME = 'Archiwum';

/**
 * Every table this script knows about, and what it does with it. The tables are
 * enumerated from the file at runtime and checked against this list; anything
 * not named here aborts the run before a single row is touched.
 */
const KNOWN_TABLES: Record<string, string> = {
	person: 'renamed and re-tokenised, avatar dropped, changelog reset',
	week: 'kept: the history is the interesting part',
	film: 'kept but for note, which is free text',
	ballot: 'kept, with person_id remapped',
	bank: 'kept, with person_id remapped',
	runoff: 'kept: a room code names nobody',
	runoff_film: 'kept',
	runoff_ballot: 'person_id remapped, voter_key remapped or regenerated',
	attendance: 'kept, with person_id remapped',
	tmdb_cache: 'kept untouched: public film data, and it keeps demo search instant',
	night: 'kept but for note, which is free text',
	audit: 'person_id and target remapped, detail replaced',
	rules_change: 'kept',
	film_comment: 'person_id remapped, body replaced',
	film_seen: 'kept, with person_id remapped',
	film_hold: 'person_id remapped, reason replaced',
	comment_react: 'kept, with person_id remapped'
};

/** every column holding a person id, so the new ids reach all of them */
const PERSON_REFS: [table: string, column: string][] = [
	['film', 'added_by'],
	['ballot', 'person_id'],
	['bank', 'person_id'],
	['runoff_ballot', 'person_id'],
	['attendance', 'person_id'],
	['audit', 'person_id'],
	// target is a person id for the person.* actions and a film id or a timestamp
	// for the rest; detail is a person id for film.hold. Both are dealt with again
	// afterwards, once what is left can be told apart from a real id
	['audit', 'target'],
	['audit', 'detail'],
	['film_comment', 'person_id'],
	['film_seen', 'person_id'],
	['film_hold', 'person_id'],
	['comment_react', 'person_id']
];

/** free text, with the table's rowid as the handle and the column to rewrite */
const FREE_TEXT: [table: string, column: string][] = [
	['film_comment', 'body'],
	['film', 'note'],
	['film_hold', 'reason'],
	['night', 'note']
];

/* -------------------------------------------------------------- the cast -- */

const GIVEN_NAMES = [
	'Antoni',
	'Zuzanna',
	'Franciszek',
	'Hanna',
	'Wojciech',
	'Marta',
	'Igor',
	'Nadia',
	'Bruno',
	'Kalina',
	'Sebastian',
	'Weronika',
	'Damian',
	'Iga',
	'Norbert',
	'Sonia',
	'Ksawery',
	'Lena',
	'Rafał',
	'Klara',
	'Marcel',
	'Emilia',
	'Borys',
	'Roksana',
	'Witold',
	'Blanka',
	'Cezary',
	'Malwina',
	'Konrad',
	'Jagna'
];

/**
 * Surnames that do not inflect for gender, so the cast can be mixed without the
 * script having to know which given name is whose. None of them is on the real
 * roster, and the diacritics are kept so the ids still exercise slugify.
 */
const FAMILY_NAMES = [
	'Mazur',
	'Kaczmarek',
	'Szewczyk',
	'Wróbel',
	'Zając',
	'Sikora',
	'Baran',
	'Dudek',
	'Kruk',
	'Rybak',
	'Owczarek',
	'Pietrzak',
	'Kowalczyk',
	'Zaremba',
	'Bąk',
	'Gil',
	'Cebula',
	'Jarząbek',
	'Kmieć',
	'Stolarz',
	'Malec',
	'Sobczak',
	'Kubiak',
	'Grzyb'
];

/* --------------------------------------------------------------- the talk -- */

/**
 * What the demo says instead of what anybody actually wrote. Lorem ipsum rather
 * than plausible opinions, because a demo full of invented film takes reads as
 * twenty-two people's real ones, and nobody looking at it can tell which. Filler
 * that announces itself cannot be mistaken for anybody.
 *
 * Bucketed by the length of the line being replaced, so a card that carried two
 * words still carries two words and a comment thread keeps the shape it had.
 */
const TINY = [
	'Lorem.',
	'Ipsum.',
	'Dolor sit.',
	'Sit amet.',
	'Amet!',
	'Enim ad.',
	'Ut enim.',
	'Quis?',
	'Sed do.',
	'Nam quis.'
];

const SHORT = [
	'Lorem ipsum dolor sit amet, elit.',
	'Consectetur adipiscing elit sed do.',
	'Sed do eiusmod tempor incididunt.',
	'Ut labore et dolore magna aliqua.',
	'Ut enim ad minim veniam, quis.',
	'Nostrud exercitation ullamco laboris.',
	'Duis aute irure dolor in voluptate.',
	'Excepteur sint occaecat cupidatat.',
	'Non proident, sunt in culpa qui.',
	'Officia deserunt mollit anim id est.'
];

const MEDIUM = [
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.',
	'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo.',
	'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
	'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est.',
	'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.',
	'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur.',
	'Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit.',
	'At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum.'
];

const LONG = [
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
	'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
	'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.',
	'Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.'
];

function poolFor(length: number): string[] {
	if (length <= 12) return TINY;
	if (length <= 45) return SHORT;
	if (length <= 140) return MEDIUM;
	return LONG;
}

/* ------------------------------------------------------------ determinism -- */

/** mulberry32: small, seeded, and the same everywhere this ever runs */
function prng(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function digest(...parts: (string | number)[]): Buffer {
	return createHash('sha256').update(`${SEED}:${parts.join(':')}`).digest();
}

/** an index derived from the value being replaced, so a rerun replaces it the same way */
function pickFrom<T>(pool: T[], ...parts: (string | number)[]): T {
	return pool[digest(...parts).readUInt32BE(0) % pool.length];
}

/** shaped like newToken()'s 128-bit base64url, but reproducible from the seed */
function tokenFor(sourceId: string): string {
	return digest('token', sourceId).toString('base64url').slice(0, 22);
}

/** a stand-in for a device uuid, distinct for every distinct source key */
function deviceKeyFor(sourceKey: string): string {
	const hex = digest('device', sourceKey).toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * The cast, shuffled once from the fixed seed so that probing for a free slug
 * walks an arbitrary order rather than the alphabet. Which entry a person gets
 * is derived from their own source id, so adding somebody to the roster does not
 * rename everybody who sorts after them.
 */
function castPool(): string[] {
	const combos: string[] = [];
	for (const given of GIVEN_NAMES) for (const family of FAMILY_NAMES) combos.push(`${given} ${family}`);
	const random = prng(SEED);
	for (let i = combos.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[combos[i], combos[j]] = [combos[j], combos[i]];
	}
	return combos;
}

/* ------------------------------------------------------------------ types -- */

export type Identity = { id: string; name: string; token: string };

export type AnonymiseReport = {
	/** how many person rows were given a new identity, the archive row included */
	people: number;
	/** lines of free text replaced, across every table that holds any */
	lines: number;
	/** avatars dropped */
	avatars: number;
	/** the size of the finished file */
	bytes: number;
};

class AnonymiseError extends Error {
	readonly name = 'AnonymiseError';
}

type PersonRow = {
	id: string;
	name: string;
	token: string;
	avatar: Uint8Array | null;
};

/* ------------------------------------------------------------------- work -- */

function tablesIn(db: DB): string[] {
	return (
		db
			.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
			.all() as { name: string }[]
	).map((row) => row.name);
}

function columnsOf(db: DB, table: string): string[] {
	return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

function rowCounts(db: DB, tables: string[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const table of tables) {
		counts[table] = (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
	}
	return counts;
}

/** builds old id to new identity, stable for a given source id across reruns */
function buildIdentities(people: PersonRow[]): Map<string, Identity> {
	const pool = castPool();
	const taken = new Set<string>();
	const map = new Map<string, Identity>();

	// the archive row is not a person and its id names nobody, so it keeps both,
	// and the weeks it owns stay in the demo under a label rather than a name
	for (const person of people) {
		if (person.id !== ARCHIVE_ID) continue;
		taken.add(ARCHIVE_ID);
		map.set(person.id, { id: ARCHIVE_ID, name: ARCHIVE_NAME, token: tokenFor(person.id) });
	}

	for (const person of [...people].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
		if (map.has(person.id)) continue;
		const start = digest('cast', person.id).readUInt32BE(0) % pool.length;
		for (let step = 0; step < pool.length; step++) {
			const name = pool[(start + step) % pool.length];
			const id = slugify(name);
			if (!id || taken.has(id)) continue;
			taken.add(id);
			map.set(person.id, { id, name, token: tokenFor(person.id) });
			break;
		}
		if (!map.has(person.id)) {
			throw new AnonymiseError('ran out of made-up names; widen GIVEN_NAMES or FAMILY_NAMES');
		}
	}
	return map;
}

/** rewrites one column, value by value, so a unique index is never asked to hold two of anything */
function remap(db: DB, table: string, column: string, pairs: [from: string, to: string][]): void {
	const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`);
	for (const [from, to] of pairs) update.run(to, from);
}

/**
 * Anonymises `sourcePath` into `outPath` and returns what it did. Throws, having
 * deleted the output, if anything at all looks wrong: a half-anonymised file is
 * worse than no demo.
 */
export function anonymise(sourcePath: string, outPath: string): AnonymiseReport {
	const source = resolve(sourcePath);
	const out = resolve(outPath);

	if (!existsSync(source)) throw new AnonymiseError(`no such database: ${source}`);
	if (source === out) throw new AnonymiseError('the output would overwrite the source');
	// a live database's recent pages are in its -wal, and copying the file alone
	// would take a torn or stale picture of it. Snapshot with sqlite3 .backup first
	if (existsSync(`${source}-wal`) && statSync(`${source}-wal`).size > 0) {
		throw new AnonymiseError(
			`${source} has a non-empty -wal; snapshot it with sqlite3 .backup and point this at the snapshot`
		);
	}

	// the journal of whatever used to be at this path belongs to a different
	// database, and SQLite would happily replay it over the fresh copy
	for (const stale of [out, `${out}-wal`, `${out}-shm`]) rmSync(stale, { force: true });
	copyFileSync(source, out);

	let db: DB | null = null;
	const abort = (message: string): never => {
		db?.close();
		for (const leftover of [out, `${out}-wal`, `${out}-shm`]) rmSync(leftover, { force: true });
		throw new AnonymiseError(message);
	};

	db = new Database(out);
	db.pragma('foreign_keys = OFF');
	// a rollback journal rather than a WAL, so the finished demo is one file to
	// swap into place and the verification below reads all of it
	db.pragma('journal_mode = DELETE');

	const tables = tablesIn(db);
	const unknown = tables.filter((table) => !(table in KNOWN_TABLES));
	if (unknown.length) {
		abort(
			`no anonymisation rule for ${unknown.join(', ')}. Add one to KNOWN_TABLES in scripts/anonymise.ts, ` +
				'after deciding whether it holds anything private'
		);
	}

	const before = rowCounts(db, tables);

	const people = db.prepare('SELECT id, name, token, avatar FROM person').all() as PersonRow[];
	const identities = buildIdentities(people);
	// kept for the verification pass, which has to know what it is looking for
	const sourceNames = people.filter((p) => p.id !== ARCHIVE_ID).map((p) => p.name);
	const sourceIds = people.filter((p) => p.id !== ARCHIVE_ID).map((p) => p.id);
	const sourceTokens = people.map((p) => p.token);
	// a slice out of the middle of each picture rather than its header, which every
	// PNG in the world shares and which would flag the demo's own art
	const avatarNeedles: Buffer[] = [];
	for (const person of people) {
		if (person.avatar && person.avatar.length >= 64) {
			avatarNeedles.push(Buffer.from(person.avatar.slice(24, 56)));
		}
	}
	const avatars = people.filter((p) => p.avatar).length;

	// every distinct flash-vote key: the ones that are a person id travel with
	// that person, the rest are device uuids and get made up again
	const voterKeys = (
		db.prepare('SELECT DISTINCT voter_key AS key FROM runoff_ballot').all() as { key: string }[]
	).map((row) => row.key);

	let lines = 0;

	db.transaction(() => {
		// two passes through a namespace nothing else uses. A single pass would ask
		// a unique index to hold two of the same value for as long as it takes to
		// walk the rest of the map, which it will not do
		const staging = new Map<string, string>();
		[...identities.keys()].forEach((id, index) => staging.set(id, `~fn~p${index}`));
		voterKeys.forEach((key, index) => {
			if (!staging.has(key)) staging.set(key, `~fn~k${index}`);
		});

		const toStaging = (values: string[]): [string, string][] =>
			values.map((value) => [value, staging.get(value)!]);

		const personIds = [...identities.keys()];
		const idOut: [string, string][] = personIds.map((id) => [
			staging.get(id)!,
			identities.get(id)!.id
		]);
		const keyOut: [string, string][] = voterKeys.map((key) => [
			staging.get(key)!,
			identities.get(key)?.id ?? deviceKeyFor(key)
		]);

		remap(db!, 'person', 'id', toStaging(personIds));
		for (const [table, column] of PERSON_REFS) remap(db!, table, column, toStaging(personIds));
		remap(db!, 'runoff_ballot', 'voter_key', toStaging(voterKeys));

		remap(db!, 'person', 'id', idOut);
		for (const [table, column] of PERSON_REFS) remap(db!, table, column, idOut);
		remap(db!, 'runoff_ballot', 'voter_key', keyOut);

		// the token is unique too, so it takes the same detour before it lands
		const stageToken = db!.prepare('UPDATE person SET token = ? WHERE id = ?');
		personIds.forEach((id, index) => stageToken.run(`~fn~t${index}`, identities.get(id)!.id));

		// caught up rather than reset: a visitor's first paint should be the app, not
		// a modal of everything that ever changed, and the first one to dismiss it
		// would be dismissing it for everybody else on that shared persona anyway
		const dress = db!.prepare(
			`UPDATE person SET name = ?, token = ?, avatar = NULL, avatar_mime = NULL,
			                   avatar_updated_at = NULL, changelog_seen = ?
			 WHERE id = ?`
		);
		const caughtUp = latestChangelogId();
		for (const identity of identities.values()) {
			dress.run(identity.name, identity.token, caughtUp, identity.id);
		}

		// what is left in target is a film id or a timestamp: harmless, but it was
		// never worth keeping either, and clearing it means one less thing to check
		db!.exec(
			`UPDATE audit SET target = NULL
			 WHERE target IS NOT NULL AND target NOT IN (SELECT id FROM person)`
		);

		for (const [table, column] of FREE_TEXT) {
			const rows = db!
				.prepare(`SELECT rowid AS rid, ${column} AS text FROM ${table} WHERE ${column} IS NOT NULL`)
				.all() as { rid: number; text: string }[];
			const update = db!.prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`);
			for (const row of rows) {
				update.run(pickFrom(poolFor(row.text.length), table, column, row.rid), row.rid);
				lines++;
			}
		}

		// audit detail that is a person id has already travelled with them; the rest
		// is a title somebody typed or a name they were renamed to, so it goes
		const details = db!
			.prepare(
				`SELECT rowid AS rid, detail AS text FROM audit
				 WHERE detail IS NOT NULL AND detail NOT IN (SELECT id FROM person)`
			)
			.all() as { rid: number; text: string }[];
		const setDetail = db!.prepare('UPDATE audit SET detail = ? WHERE rowid = ?');
		for (const row of details) {
			setDetail.run(pickFrom(poolFor(row.text.length), 'audit', 'detail', row.rid), row.rid);
			lines++;
		}
	})();

	const after = rowCounts(db, tables);
	for (const table of tables) {
		if (before[table] !== after[table]) {
			abort(`${table} went from ${before[table]} rows to ${after[table]}; nothing here deletes rows`);
		}
	}

	const broken = db.pragma('foreign_key_check') as unknown[];
	if (broken.length) abort(`the rewrite left ${broken.length} dangling references`);
	const integrity = db.pragma('integrity_check', { simple: true });
	if (integrity !== 'ok') abort(`integrity_check says ${String(integrity)}`);

	// without this the old names and avatar bytes survive in the freed pages, and
	// every check above would still pass while the file itself gives them away
	db.exec('VACUUM');
	db.close();
	db = null;

	verify(out, { names: sourceNames, ids: sourceIds, tokens: sourceTokens, avatars: avatarNeedles }, abort);

	return { people: identities.size, lines, avatars, bytes: statSync(out).size };
}

/* ---------------------------------------------------------- fail closed 2 -- */

type Secrets = { names: string[]; ids: string[]; tokens: string[]; avatars: Buffer[] };

/**
 * Reads the finished file back and refuses to hand over anything that still
 * remembers who these people are: first every column of every table, then the
 * bytes themselves, which is what would catch a VACUUM that never ran.
 */
function verify(path: string, secrets: Secrets, abort: (message: string) => never): void {
	const needles = [...secrets.names, ...secrets.ids, ...secrets.tokens].filter(Boolean);
	const db = new Database(path, { readonly: true });

	try {
		for (const table of tablesIn(db)) {
			for (const column of columnsOf(db, table)) {
				const values = (
					db.prepare(`SELECT ${column} AS v FROM ${table} WHERE ${column} IS NOT NULL`).all() as {
						v: unknown;
					}[]
				).map((row) => row.v);
				for (const value of values) {
					if (value instanceof Uint8Array) {
						abort(`${table}.${column} still holds a blob; the demo carries no binary`);
					}
					if (typeof value !== 'string') continue;
					const hit = needles.find((needle) => value.includes(needle));
					if (hit) abort(`${table}.${column} still says ${JSON.stringify(hit)}`);
				}
			}
		}
	} finally {
		db.close();
	}

	const bytes = readFileSync(path);
	for (const needle of needles) {
		if (bytes.includes(Buffer.from(needle, 'utf8'))) {
			abort(`the file still contains ${JSON.stringify(needle)}; did the VACUUM run?`);
		}
	}
	for (const needle of secrets.avatars) {
		if (bytes.includes(needle)) abort('the file still contains avatar bytes; did the VACUUM run?');
	}
}

/* -------------------------------------------------------------------- cli -- */

function main(argv: string[]): void {
	const [sourcePath, outPath] = argv;
	if (!sourcePath || !outPath) {
		console.error('usage: node anonymise.mjs <source.db> <out.db>');
		process.exit(2);
	}
	try {
		const report = anonymise(sourcePath, outPath);
		console.log(`people:  ${report.people} made up`);
		console.log(`avatars: ${report.avatars} dropped`);
		console.log(`text:    ${report.lines} lines replaced`);
		console.log(`out:     ${resolve(outPath)} (${Math.round(report.bytes / 1024)} kB)`);
	} catch (error) {
		console.error(`anonymise: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}

// run only when this file is what node was pointed at; the test imports it
const entry = process.argv[1];
if (entry && basename(entry).startsWith('anonymise')) {
	if (pathToFileURL(realpathSync(entry)).href === import.meta.url) main(process.argv.slice(2));
}
