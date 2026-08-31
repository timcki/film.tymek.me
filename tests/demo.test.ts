/**
 * The demo's whole privacy story is that the anonymiser really did remove
 * everything, so this suite builds a database full of things that must not
 * survive and then goes looking for them: in every column of every table, and
 * separately in the file's own bytes, which is what a missing VACUUM shows up in.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { anonymise } from '../scripts/anonymise.ts';
import { openDatabase, type DB } from '../src/lib/server/db.js';
import { RULE_SETS } from '../src/lib/server/rules.js';
import { iso } from '../src/lib/server/time.js';
import { slugify } from '../src/lib/server/tokens.js';
import { openWeek } from '../src/lib/server/weeks.js';
import { addComment, reactComment } from '../src/lib/server/comments.js';
import { toggleSeen } from '../src/lib/server/seen.js';
import { placeHold } from '../src/lib/server/holds.js';
import { flashVote } from '../src/lib/server/runoffs.js';
import { checkIn } from '../src/lib/server/attendance.js';
import { addNight } from '../src/lib/server/schedule.js';
import { logAdmin } from '../src/lib/server/admin.js';
import { rexpAll } from '../src/lib/server/xp.js';
import { demoDefault, personas } from '../src/lib/server/demo.js';
import { addFilm, castBallot, ensureWeek, freshDb } from './helpers.js';

const NOW = new Date('2026-08-03T10:00:00Z');
const rules = RULE_SETS.banked;

/** the archive account, kept in the demo under a label rather than a name */
const ARCHIVE_ID = 'archiwum';

/**
 * People who must not survive: full names with the diacritics slugify has to
 * cope with, and tokens distinctive enough that finding one anywhere in the
 * output can only mean the anonymiser missed it.
 */
const CAST = [
	{ name: 'Dorota Wilczyńska', token: 'tokenDorotaWilczynska1' },
	{ name: 'Marek Osiecki', token: 'tokenMarekOsiecki22222' },
	{ name: 'Halina Brzoza', token: 'tokenHalinaBrzoza33333' },
	{ name: 'Paweł Truszczyński', token: 'tokenPawelTruszczyns44' },
	{ name: 'Kamil Zdunek', token: 'tokenKamilZdunek555555' },
	{ name: 'Renata Pilarczyk', token: 'tokenRenataPilarczyk66' }
];

/** what people wrote, in every length bucket the replacement pools have */
const SECRETS = [
	'PRYWATNE: kot Doroty nazywa się Bonifacy',
	'PRYWATNE',
	'PRYWATNE: Marek pisze tu bardzo długi komentarz o tym, gdzie mieszka, z kim mieszka i co robi w czwartki, czyli dokładnie to, czego nikt obcy nie powinien nigdy zobaczyć w publicznym demo tej aplikacji.',
	'PRYWATNE: numer telefonu Haliny'
];

/**
 * A PNG header followed by a run nothing else in the file could produce, so the
 * byte scan below is looking for these bytes and not for a generic PNG.
 */
function avatarBytes(marker: number): Buffer {
	const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const body = Buffer.alloc(120);
	for (let i = 0; i < body.length; i++) body[i] = (marker * 37 + i * 11) % 251;
	return Buffer.concat([png, body]);
}

const ids = () => CAST.map((person) => slugify(person.name));

function buildFixture(path: string): void {
	const db = openDatabase(path);

	const insertPerson = db.prepare(
		`INSERT INTO person (id, name, colour, token, active, created_at, avatar, avatar_mime,
		                     avatar_updated_at, is_admin, changelog_seen)
		 VALUES (?, ?, ?, ?, 1, ?, ?, 'image/png', ?, ?, ?)`
	);
	CAST.forEach((person, index) => {
		// created_at is distinct per person and survives the rewrite, which is what
		// lets the assertions below pair a demo row with the row it came from
		const born = iso(new Date(Date.UTC(2026, 0, 1 + index)));
		insertPerson.run(
			slugify(person.name),
			person.name,
			'#e8c34a',
			person.token,
			born,
			avatarBytes(index + 1),
			born,
			index === 0 ? 1 : 0,
			index + 1
		);
		db.prepare('INSERT INTO bank (person_id, balance, updated_at) VALUES (?, ?, ?)').run(
			slugify(person.name),
			rules.pointsPerWeek,
			iso(NOW)
		);
	});
	// the inactive row the backfilled archive weeks hang off, see docs/operations.md
	db.prepare(
		`INSERT INTO person (id, name, colour, token, active, created_at)
		 VALUES (?, 'Archiwum', '#6c7079', 'tokenArchiwum777777777', 0, ?)`
	).run(ARCHIVE_ID, iso(new Date(Date.UTC(2025, 8, 1))));

	openWeek(db, 1, NOW);
	ensureWeek(db, 2, 'open');
	const [dorota, marek, halina, pawel, kamil, renata] = ids();

	const inherent = addFilm(db, 'Inherent Vice', dorota, 1, { year: 2014, director: 'P.T. Anderson' });
	const stalker = addFilm(db, 'Stalker', marek, 1, { year: 1979, director: 'Andrei Tarkovsky' });
	const playtime = addFilm(db, 'Playtime', halina, 2, { year: 1967, director: 'Jacques Tati' });
	const archived = addFilm(db, 'Come And See', ARCHIVE_ID, 1);
	db.prepare(`UPDATE film SET archival = 1, status = 'watched', watched_week = 1 WHERE id = ?`).run(
		archived
	);

	// the nominator's pitch is free text and goes; the title and the poster stay
	db.prepare('UPDATE film SET note = ? WHERE id = ?').run(SECRETS[0], inherent);
	db.prepare('UPDATE film SET note = ? WHERE id = ?').run(SECRETS[2], stalker);

	castBallot(db, 1, dorota, stalker, 3);
	castBallot(db, 1, marek, inherent, 2);
	castBallot(db, 1, halina, stalker, 1);
	castBallot(db, 2, pawel, playtime, 2);
	castBallot(db, 2, kamil, stalker, 1);

	const first = addComment(db, marek, inherent, SECRETS[0], NOW);
	addComment(db, halina, inherent, SECRETS[2], NOW);
	addComment(db, renata, stalker, SECRETS[3], NOW);
	reactComment(db, dorota, first, '🍿', NOW);
	reactComment(db, kamil, first, '👍', NOW);

	toggleSeen(db, dorota, stalker, NOW);
	toggleSeen(db, pawel, stalker, NOW);
	placeHold(db, 2, playtime, halina, SECRETS[1], NOW);

	checkIn(db, 1, dorota, NOW);
	checkIn(db, 1, renata, NOW);
	addNight(db, new Date('2026-08-06T18:00:00Z'), SECRETS[0], NOW);
	addNight(db, new Date('2026-08-13T18:00:00Z'), null, NOW);

	// audit details carry a person id for holds and a typed-in name for renames
	logAdmin(db, dorota, 'person.rename', marek, 'Marek Osiecki', NOW);
	logAdmin(db, dorota, 'film.hold', String(playtime), halina, NOW);
	logAdmin(db, dorota, 'night.add', iso(NOW), null, NOW);

	db.prepare(
		`INSERT INTO runoff (id, week_number, code, created_at, expires_at)
		 VALUES (1, 1, 'ACDEFG', ?, ?)`
	).run(iso(NOW), iso(new Date(NOW.getTime() + 3 * 3600 * 1000)));
	db.prepare('INSERT INTO runoff_film (runoff_id, film_id) VALUES (1, ?), (1, ?)').run(
		inherent,
		stalker
	);
	flashVote(db, 1, dorota, dorota, stalker, NOW);
	// a guest in the room votes on a device uuid rather than as anybody
	flashVote(db, 1, '3f1c9b52-6a44-4d0e-8a1f-2c5d7e9b0a13', null, inherent, NOW);

	db.prepare('INSERT INTO tmdb_cache (query, body, fetched_at) VALUES (?, ?, ?)').run(
		'stalker',
		'{"results":[{"title":"Stalker","release_date":"1979-05-25"}]}',
		iso(NOW)
	);
	db.prepare('INSERT INTO rules_change (rules_id, week_number, created_at) VALUES (?, 1, ?)').run(
		rules.id,
		iso(NOW)
	);

	rexpAll(db);
	db.close();
}

function tablesIn(db: DB): string[] {
	return (
		db
			.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
			.all() as { name: string }[]
	).map((row) => row.name);
}

function counts(db: DB): Record<string, number> {
	const out: Record<string, number> = {};
	for (const table of tablesIn(db)) {
		out[table] = (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
	}
	return out;
}

/** every string the database holds, table by table and column by column */
function allText(db: DB): string[] {
	const out: string[] = [];
	for (const table of tablesIn(db)) {
		const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
			(c) => c.name
		);
		for (const column of columns) {
			for (const row of db
				.prepare(`SELECT ${column} AS v FROM ${table} WHERE ${column} IS NOT NULL`)
				.all() as { v: unknown }[]) {
				if (typeof row.v === 'string') out.push(row.v);
				else if (row.v instanceof Uint8Array) out.push(`<blob:${table}.${column}>`);
			}
		}
	}
	return out;
}

let dir: string;
let source: string;
let out: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'filmnight-demo-'));
	source = join(dir, 'source.db');
	out = join(dir, 'demo.db');
	buildFixture(source);
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe('the anonymiser', () => {
	it('leaves no name, id, token or picture anywhere in the output', () => {
		anonymise(source, out);

		const db = new Database(out, { readonly: true });
		const text = allText(db).join('\n');
		db.close();

		for (const person of CAST) {
			expect(text).not.toContain(person.name);
			expect(text).not.toContain(person.token);
			expect(text).not.toContain(slugify(person.name));
		}
		for (const secret of SECRETS) expect(text).not.toContain(secret);
		// a blob would have been printed as its own placeholder above
		expect(text).not.toContain('<blob:');
	});

	it('leaves none of it in the file either, which is what the VACUUM is for', () => {
		anonymise(source, out);
		const bytes = readFileSync(out);

		for (const person of CAST) {
			expect(bytes.includes(Buffer.from(person.name, 'utf8'))).toBe(false);
			expect(bytes.includes(Buffer.from(person.token, 'utf8'))).toBe(false);
			expect(bytes.includes(Buffer.from(slugify(person.name), 'utf8'))).toBe(false);
		}
		for (const secret of SECRETS) {
			expect(bytes.includes(Buffer.from(secret, 'utf8'))).toBe(false);
		}
		for (let i = 0; i < CAST.length; i++) {
			expect(bytes.includes(avatarBytes(i + 1).subarray(8))).toBe(false);
		}
		// and no journal left beside it: the demo is one file to swap into place
		expect(existsSync(`${out}-wal`)).toBe(false);
	});

	it('never writes to the source', () => {
		const before = readFileSync(source);
		anonymise(source, out);
		expect(readFileSync(source).equals(before)).toBe(true);
	});

	it('keeps every table the same size', () => {
		const original = new Database(source, { readonly: true });
		const beforeCounts = counts(original);
		original.close();

		anonymise(source, out);

		const demo = new Database(out, { readonly: true });
		expect(counts(demo)).toEqual(beforeCounts);
		demo.close();
	});

	it('keeps every score and every XP total exactly as it was', () => {
		const original = new Database(source, { readonly: true });
		const scores = original.prepare('SELECT id, score, final_score FROM film ORDER BY id').all();
		// created_at is preserved and distinct, so it pairs a demo row with its source
		const xp = original.prepare('SELECT created_at, xp, colour FROM person ORDER BY created_at').all();
		original.close();

		anonymise(source, out);

		const demo = new Database(out, { readonly: true });
		expect(demo.prepare('SELECT id, score, final_score FROM film ORDER BY id').all()).toEqual(
			scores
		);
		expect(
			demo.prepare('SELECT created_at, xp, colour FROM person ORDER BY created_at').all()
		).toEqual(xp);
		demo.close();
		// an XP total of zero everywhere would pass the comparison and prove nothing
		expect((xp as { xp: number }[]).some((row) => row.xp > 0)).toBe(true);
	});

	it('keeps the films, the weeks and the archive, which are the point of the demo', () => {
		anonymise(source, out);
		const db = new Database(out, { readonly: true });

		const titles = (
			db.prepare('SELECT title FROM film ORDER BY title').all() as { title: string }[]
		).map((row) => row.title);
		expect(titles).toEqual(['Come And See', 'Inherent Vice', 'Playtime', 'Stalker']);
		expect(db.prepare('SELECT director FROM film WHERE title = ?').get('Stalker')).toEqual({
			director: 'Andrei Tarkovsky'
		});
		// the archive keeps its id and its label, and still owns its films
		expect(db.prepare('SELECT name FROM person WHERE id = ?').get(ARCHIVE_ID)).toEqual({
			name: 'Archiwum'
		});
		expect(
			db.prepare(`SELECT COUNT(*) AS n FROM film WHERE added_by = ?`).get(ARCHIVE_ID)
		).toEqual({ n: 1 });
		// the search cache is public film data and is left alone, so demo search stays instant
		expect(db.prepare('SELECT COUNT(*) AS n FROM tmdb_cache').get()).toEqual({ n: 1 });
		db.close();
	});

	it('leaves nothing dangling behind the new ids', () => {
		anonymise(source, out);
		const db = new Database(out, { readonly: true });
		expect(db.pragma('foreign_key_check')).toEqual([]);
		expect(db.pragma('integrity_check', { simple: true })).toBe('ok');

		// every person column still points at somebody who exists
		const orphans = db
			.prepare(
				`SELECT (SELECT COUNT(*) FROM ballot WHERE person_id NOT IN (SELECT id FROM person))
				      + (SELECT COUNT(*) FROM film WHERE added_by NOT IN (SELECT id FROM person))
				      + (SELECT COUNT(*) FROM film_comment WHERE person_id NOT IN (SELECT id FROM person))
				      + (SELECT COUNT(*) FROM audit WHERE person_id NOT IN (SELECT id FROM person))
				      AS n`
			)
			.get() as { n: number };
		expect(orphans.n).toBe(0);
		db.close();
	});

	it('carries the identified flash vote across and makes up the guest device', () => {
		anonymise(source, out);
		const db = new Database(out, { readonly: true });
		const rows = db
			.prepare('SELECT voter_key, person_id FROM runoff_ballot ORDER BY voter_key')
			.all() as { voter_key: string; person_id: string | null }[];
		expect(rows).toHaveLength(2);
		// the identified vote still votes as its owner
		const identified = rows.filter((row) => row.person_id !== null);
		expect(identified).toHaveLength(1);
		expect(identified[0].voter_key).toBe(identified[0].person_id);
		// the guest keeps a uuid shape but not the uuid they arrived with
		const guest = rows.find((row) => row.person_id === null)!;
		expect(guest.voter_key).toMatch(/^[0-9a-f-]{36}$/);
		expect(guest.voter_key).not.toBe('3f1c9b52-6a44-4d0e-8a1f-2c5d7e9b0a13');
		db.close();
	});

	it('makes up the same cast every time, so an hourly refresh is not a reshuffle', () => {
		anonymise(source, out);
		const first = new Database(out, { readonly: true });
		const before = first.prepare('SELECT id, name, token FROM person ORDER BY created_at').all();
		first.close();

		const again = join(dir, 'demo-again.db');
		anonymise(source, again);
		const second = new Database(again, { readonly: true });
		expect(second.prepare('SELECT id, name, token FROM person ORDER BY created_at').all()).toEqual(
			before
		);
		second.close();
	});

	it('shows the changelog to whoever wanders in', () => {
		anonymise(source, out);
		const db = new Database(out, { readonly: true });
		expect(db.prepare('SELECT COUNT(*) AS n FROM person WHERE changelog_seen != 0').get()).toEqual({
			n: 0
		});
		db.close();
	});

	it('refuses a table it has no rule for, rather than letting it through', () => {
		const db = openDatabase(source);
		db.exec('CREATE TABLE private_notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
		db.prepare('INSERT INTO private_notes (body) VALUES (?)').run(SECRETS[0]);
		db.close();

		expect(() => anonymise(source, out)).toThrow(/private_notes/);
		// and it takes the half-finished copy with it
		expect(existsSync(out)).toBe(false);
	});

	it('refuses to write over the database it is reading', () => {
		expect(() => anonymise(source, source)).toThrow(/overwrite the source/);
		expect(existsSync(source)).toBe(true);
	});
});

/**
 * The demo never forks the app's logic; it only decides who is holding the
 * phone. Which makes picking that person the whole of the demo's own behaviour.
 */
describe('who the demo hands a visitor', () => {
	it('lands on a regular member and never on the admin', () => {
		const { db } = freshDb();
		db.prepare(`UPDATE person SET is_admin = 1 WHERE id = 'ala'`).run();

		const cast = personas(db);
		expect(cast.admin?.id).toBe('ala');
		expect(cast.member?.is_admin).toBe(0);
		expect(demoDefault(db)?.id).toBe(cast.member?.id);
		expect(demoDefault(db)?.id).not.toBe('ala');
	});

	it('offers somebody who has not voted, so a full budget is one tap away', () => {
		const { db } = freshDb();
		db.prepare(`UPDATE person SET is_admin = 1 WHERE id = 'ala'`).run();
		const film = addFilm(db, 'Stalker', 'bartek', 1);
		// everybody but darek and beyond has spent something this week
		for (const person of ['bartek', 'celina']) castBallot(db, 1, person, film, 1);

		const cast = personas(db);
		expect(cast.member?.id).toBe('bartek');
		const fresh = cast.fresh!;
		expect(fresh.id).not.toBe(cast.member?.id);
		expect(fresh.id).not.toBe(cast.admin?.id);
		expect(
			db
				.prepare('SELECT COUNT(*) AS n FROM ballot WHERE person_id = ? AND week_number = 1')
				.get(fresh.id)
		).toEqual({ n: 0 });
	});

	it('picks the same three every time, so an hourly rebuild is not a reshuffle', () => {
		const { db } = freshDb();
		const once = personas(db);
		const twice = personas(db);
		expect([once.member?.id, once.admin?.id, once.fresh?.id]).toEqual([
			twice.member?.id,
			twice.admin?.id,
			twice.fresh?.id
		]);
	});

	it('still finds a third face when the whole room has already voted', () => {
		const { db } = freshDb();
		const film = addFilm(db, 'Playtime', 'ala', 1);
		for (const person of ['ala', 'bartek', 'celina', 'darek', 'ewa', 'filip']) {
			castBallot(db, 1, person, film, 1);
		}
		const cast = personas(db);
		expect(cast.fresh).toBeDefined();
		expect(cast.fresh?.id).not.toBe(cast.member?.id);
	});
});
