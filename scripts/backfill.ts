/**
 * One-off: loads the year of film nights that happened before the app existed,
 * and seeds two propositions onto the live list.
 *
 *   TMDB_READ_TOKEN=... DATABASE_PATH=... npm run backfill -- --dry-run
 *   TMDB_READ_TOKEN=... DATABASE_PATH=... npm run backfill -- --commit
 *
 * The app numbers weeks from 1, and the only week that exists is the open one.
 * History therefore has to go in front of it, which means renumbering that week
 * to the end. Stop the service before running this: the scheduler must not tick
 * while the week table is half rewritten.
 *
 * Everything watched before the app is credited to an inactive Archiwum account,
 * so `/history`'s fairness table keeps counting only nominations really made
 * through the app instead of a year of invented attribution.
 */
import { openDatabase } from '../src/lib/server/db.ts';
import { titleKey } from '../src/lib/server/rules.ts';
import { iso } from '../src/lib/server/time.ts';

const TOKEN = process.env.TMDB_READ_TOKEN ?? '';
const PATH = process.env.DATABASE_PATH ?? 'data/filmnight.db';
const COMMIT = process.argv.includes('--commit');

if (!TOKEN) throw new Error('TMDB_READ_TOKEN is not set');

const ARCHIVE = { id: 'archiwum', name: 'Archiwum', colour: '#6c7079' };
/** whoever the two new propositions are credited to */
const PROPOSER = 'piotr-cenda';

/** title as the group says it, the week it lands in, and its TMDB id */
type Entry = { title: string; week: number; tmdb: number; watched: boolean };

const WATCHED: [title: string, week: number, tmdb: number][] = [
	['Inherent Vice', 1, 171274],
	["Soundtrack To A Coup d'Etat", 2, 1214539],
	['Fahrenheit 9/11', 5, 1777],
	['Sirat', 6, 1151272],
	['Sanatorium Pod Klepsydrą', 7, 45698],
	['The Handmaiden', 8, 290098],
	['Andrei Rublev', 9, 895],
	['Memories of Murder', 11, 11423],
	['Come And See', 12, 25237],
	['Tajemnice Silver Lake', 14, 396461],
	['Na Srebrnym Globie', 15, 27072],
	['Taipei Story', 16, 106380],
	['Eraserhead', 17, 985],
	['Harmonie Werckmeistera', 18, 23160],
	['Stalker', 19, 1398],
	['Jak utopić doktora Mraczka', 20, 8704],
	['Zbliżenie', 21, 30017],
	['Yi Yi', 23, 25538],
	['Tokyo Story', 24, 18148],
	['Zwierciadło', 25, 1396],
	['Baraka', 27, 14002],
	['8 1/2', 28, 422],
	['Czarny Kot, Biały Kot', 30, 1075],
	['Throw Away Your Books, Rally In The Streets', 32, 104549],
	['The Life Aquatic With Steve Zissou', 33, 421],
	['Cinema Paradiso', 34, 11216],
	['Millennium Mambo', 35, 11553],
	['Saturday Night Fever', 36, 11009],
	['Vampire Hunter D: Bloodlust', 38, 15999],
	['Playtime', 39, 10227],
	['Sorry To Bother You', 44, 424781],
	['Millennium Actress', 45, 33320]
];

// added_week is what the one-per-person-per-week index keys on, so these two
// cannot share a week with each other or with Piotr's existing nomination
const PROPOSALS: [title: string, week: number, tmdb: number][] = [
	['Fitzcarraldo', 45, 9343],
	['The Green Ray', 46, 54898]
];

const FIRST_CLOSE = new Date('2025-09-18T18:00:00.000Z');
const OPEN_WEEK = 47;

/** the Thursday 20:00 Warsaw that week N closed on */
function closesAt(week: number): Date {
	return new Date(FIRST_CLOSE.getTime() + (week - 1) * 7 * 24 * 3600 * 1000);
}

type Details = {
	year: number | null;
	director: string | null;
	genre: string | null;
	runtime: number | null;
	poster: string | null;
	overview: string | null;
};

async function detailsOf(tmdbId: number): Promise<Details> {
	const response = await fetch(
		`https://api.themoviedb.org/3/movie/${tmdbId}?append_to_response=credits`,
		{ headers: { Authorization: `Bearer ${TOKEN}`, accept: 'application/json' } }
	);
	if (!response.ok) throw new Error(`TMDB ${response.status} for ${tmdbId}`);
	const movie = (await response.json()) as {
		release_date?: string;
		runtime?: number | null;
		overview?: string;
		poster_path?: string | null;
		genres?: { name?: string }[];
		credits?: { crew?: { job?: string; name?: string }[] };
	};
	const year = Number(String(movie.release_date ?? '').slice(0, 4));
	return {
		year: Number.isFinite(year) && year > 0 ? year : null,
		director: movie.credits?.crew?.find((c) => c.job === 'Director')?.name ?? null,
		genre:
			(movie.genres ?? [])
				.slice(0, 2)
				.map((g) => g.name)
				.filter(Boolean)
				.join(' / ') || null,
		runtime: movie.runtime || null,
		poster: movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : null,
		overview: movie.overview || null
	};
}

const entries: Entry[] = [
	...WATCHED.map(([title, week, tmdb]) => ({ title, week, tmdb, watched: true })),
	...PROPOSALS.map(([title, week, tmdb]) => ({ title, week, tmdb, watched: false }))
];

console.log(`fetching ${entries.length} films from TMDB`);
const details = new Map<number, Details>();
for (const entry of entries) {
	details.set(entry.tmdb, await detailsOf(entry.tmdb));
	process.stdout.write('.');
}
console.log('\n');

for (const entry of entries) {
	const d = details.get(entry.tmdb)!;
	const where = entry.watched ? `week ${entry.week}` : 'PROPOSITION';
	console.log(
		`${String(entry.week).padStart(3)} ${entry.title.padEnd(44)} ${String(d.year ?? '?').padEnd(6)}` +
			`${(d.director ?? 'unknown director').padEnd(24)} ${d.poster ? 'poster' : 'NO POSTER'} ${where}`
	);
}

if (!COMMIT) {
	console.log('\ndry run; nothing written. pass --commit to apply');
	process.exit(0);
}

const db = openDatabase(PATH);

const before = db.prepare('SELECT number, status FROM week ORDER BY number').all();
console.log('\nweeks before:', JSON.stringify(before));
if (before.length !== 1 || (before[0] as { number: number }).number !== 1) {
	throw new Error('expected exactly one week numbered 1; refusing to renumber');
}

// renumbering the open week breaks every row pointing at it until they are moved
// too, so the constraint has to come off for the length of the transaction
db.pragma('foreign_keys = OFF');

db.transaction(() => {
	db.prepare('UPDATE week SET number = ? WHERE number = 1').run(OPEN_WEEK);
	for (const [table, column] of [
		['film', 'added_week'],
		['film', 'watched_week'],
		['ballot', 'week_number'],
		['runoff', 'week_number']
	] as const) {
		db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = 1`).run(OPEN_WEEK);
	}
	// rules_change deliberately stays on week 1: the banked rules have applied from
	// the beginning, and moving it forward would make the app announce a rule change
	// that never happened

	const insertWeek = db.prepare(
		`INSERT INTO week (number, opens_at, closes_at, status, resolved_at) VALUES (?, ?, ?, 'closed', ?)`
	);
	for (let week = 1; week < OPEN_WEEK; week++) {
		const closes = closesAt(week);
		const opens = new Date(closes.getTime() - 7 * 24 * 3600 * 1000);
		insertWeek.run(week, iso(opens), iso(closes), iso(closes));
	}

	db.prepare(
		`INSERT INTO person (id, name, colour, token, active, created_at) VALUES (?, ?, ?, ?, 0, ?)
		 ON CONFLICT(id) DO NOTHING`
	).run(ARCHIVE.id, ARCHIVE.name, ARCHIVE.colour, `archive-${Date.now()}`, iso(FIRST_CLOSE));

	const insertFilm = db.prepare(
		`INSERT INTO film (title, title_key, year, director, genre, runtime, tmdb_id, poster_url,
		                   overview, note, added_by, added_week, status, watched_week, final_score,
		                   score, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, 0, ?)`
	);

	const setWinner = db.prepare('UPDATE week SET winner_film_id = ? WHERE number = ?');

	for (const entry of entries) {
		const d = details.get(entry.tmdb)!;
		const closes = closesAt(entry.week);
		// final_score stays NULL: these predate the app, so nobody spent anything on them
		const result = insertFilm.run(
			entry.title,
			titleKey(entry.title),
			d.year,
			d.director,
			d.genre,
			d.runtime,
			entry.tmdb,
			d.poster,
			d.overview,
			entry.watched ? ARCHIVE.id : PROPOSER,
			entry.week,
			entry.watched ? 'watched' : 'active',
			entry.watched ? entry.week : null,
			iso(closes)
		);
		if (entry.watched) setWinner.run(Number(result.lastInsertRowid), entry.week);
	}
})();

db.pragma('foreign_keys = ON');
const violations = db.pragma('foreign_key_check');
if ((violations as unknown[]).length) {
	throw new Error(`foreign key check failed: ${JSON.stringify(violations)}`);
}

console.log('foreign keys clean');
console.log(
	'weeks:',
	(db.prepare('SELECT COUNT(*) AS n FROM week').get() as { n: number }).n,
	'films:',
	(db.prepare('SELECT COUNT(*) AS n FROM film').get() as { n: number }).n
);
