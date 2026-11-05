import type { DB } from './db.js';
import { immediate } from './db.js';
import type { Film, Runoff, Week } from './types.js';
import { RuleError } from './types.js';
import type { RuleSet } from './rules.js';
import { orderFilms } from './rules.js';
import { checkIn, requireActive } from './attendance.js';
import { avatarUrl } from './people.js';
import { iso } from './time.js';
import { finish, weekByNumber } from './weeks.js';

export type Tally = {
	film: Film;
	votes: number;
	points: number;
};

export function runoffByCode(db: DB, code: string): Runoff | undefined {
	return db.prepare('SELECT * FROM runoff WHERE code = ?').get(code.toUpperCase()) as
		| Runoff
		| undefined;
}

export function openRunoff(db: DB): Runoff | undefined {
	return db
		.prepare('SELECT * FROM runoff WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1')
		.get() as Runoff | undefined;
}

export function runoffFilms(db: DB, runoffId: number): (Film & { score: number })[] {
	return db
		.prepare(
			`SELECT f.* FROM film f JOIN runoff_film rf ON rf.film_id = f.id WHERE rf.runoff_id = ?`
		)
		.all(runoffId) as (Film & { score: number })[];
}

export function isExpired(runoff: Runoff, now: Date = new Date()): boolean {
	return now.getTime() >= new Date(runoff.expires_at).getTime();
}

/** §7.3: ranked points, then §3.2 ordering. */
export function tally(db: DB, runoffId: number): Tally[] {
	const films = orderFilms(runoffFilms(db, runoffId));
	const ballots = db.prepare('SELECT film_id, ranking FROM runoff_ballot WHERE runoff_id = ?')
		.all(runoffId) as { film_id: number; ranking: string | null }[];
	// legacy ballots express no preference between the unranked films
	const rankings: number[][] = ballots.map((b) => b.ranking ? JSON.parse(b.ranking) : [b.film_id]);
	const rank = (ranking: number[], id: number) => {
		const index = ranking.indexOf(id);
		return index < 0 ? films.length - 1 : index;
	};
	// the sort is stable, so films level on points keep the §3.2 order they came in
	return films.map((film) => ({
		film,
		votes: rankings.filter((r) => r[0] === film.id).length,
		points: rankings.reduce((sum, r) => sum + films.length - 1 - rank(r, film.id), 0)
	})).sort((a, b) => b.points - a.points);
}

/** §7.2: no totals or result-dependent ordering leave the server before close. */
export function publicTally(db: DB, runoff: Runoff) {
	if (runoff.closed_at) {
		// weekly scores keep changing; the recorded winner does not
		return tally(db, runoff.id).sort((a, b) =>
			Number(b.film.id === runoff.winner_film_id) - Number(a.film.id === runoff.winner_film_id));
	}
	return runoffFilms(db, runoff.id).sort((a, b) => a.id - b.id).map((film) => ({
		film, votes: null, points: null
	}));
}

export function turnout(db: DB, runoffId: number): number {
	return (db.prepare('SELECT COUNT(*) AS n FROM runoff_ballot WHERE runoff_id = ?')
		.get(runoffId) as { n: number }).n;
}

/** §7.2: named ballots are public only after the stored room has closed. */
export function revealedRankings(db: DB, runoffId: number) {
	const rows = db.prepare(`
		SELECT p.name, p.id AS person_id, p.colour, p.xp, p.avatar_updated_at, b.film_id, b.ranking
		FROM runoff_ballot b
		JOIN runoff r ON r.id = b.runoff_id
		LEFT JOIN person p ON p.id = b.person_id
		WHERE r.id = ? AND r.closed_at IS NOT NULL
		ORDER BY p.name IS NULL, p.name COLLATE NOCASE, b.rowid
	`).all(runoffId) as { name: string | null; person_id: string | null; colour: string | null; xp: number | null; avatar_updated_at: string | null; film_id: number; ranking: string | null }[];
	return rows.map((row) => ({
		name: row.name,
		colour: row.colour,
		xp: row.xp,
		avatar: row.person_id ? avatarUrl(row.person_id, row.avatar_updated_at) : null,
		ranking: row.ranking ? JSON.parse(row.ranking) as number[] : [row.film_id],
		legacy: row.ranking === null
	}));
}

export function myRanking(db: DB, runoffId: number, voterKey: string): number[] {
	const ballot = db.prepare('SELECT film_id, ranking FROM runoff_ballot WHERE runoff_id = ? AND voter_key = ?')
		.get(runoffId, voterKey) as { film_id: number; ranking: string | null } | undefined;
	return ballot ? (ballot.ranking ? JSON.parse(ballot.ranking) : [ballot.film_id]) : [];
}

/**
 * §7.2: replace a complete private ranking atomically. Room ballots never touch
 * weekly points, banks or attrition. film_id retains the first choice for history.
 */
export function flashVote(
	db: DB,
	runoffId: number,
	voterKey: string,
	personId: string | null,
	ranking: number[],
	now: Date = new Date()
): void {
	immediate(db, () => {
		const runoff = db.prepare('SELECT * FROM runoff WHERE id = ?').get(runoffId) as
			| Runoff
			| undefined;
		if (!runoff) throw new RuleError('no_runoff', 'no such runoff');
		if (runoff.closed_at) throw new RuleError('runoff_decided', 'this runoff is already decided');
		if (isExpired(runoff, now)) throw new RuleError('runoff_expired', 'this runoff has expired');

		const candidates = runoffFilms(db, runoffId);
		if (!Array.isArray(ranking) || ranking.length !== candidates.length ||
			new Set(ranking).size !== candidates.length ||
			!ranking.every((id) => Number.isInteger(id) && candidates.some((f) => f.id === id))) {
			throw new RuleError('invalid_ranking', 'rank every shortlisted film exactly once');
		}
		if (personId) requireActive(db, personId);
		const encoded = JSON.stringify(ranking);
		db.prepare(
			`INSERT INTO runoff_ballot (runoff_id, voter_key, person_id, film_id, ranking, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT (runoff_id, voter_key) DO UPDATE SET
			 film_id = excluded.film_id, ranking = excluded.ranking,
			 person_id = excluded.person_id, created_at = excluded.created_at
			 WHERE runoff_ballot.ranking IS NOT excluded.ranking`
		).run(runoffId, voterKey, personId, ranking[0], encoded, iso(now));

		// §7.4: an identified flash vote implies being in the room
		if (personId) checkIn(db, runoff.week_number, personId, now);
	});
}

/**
 * §7.2: a saved ranking taken back while the room is still open, so the
 * phone's save works both ways. Only the ballot goes: being in the room was
 * recorded when it was cast and stays recorded.
 */
export function withdrawFlashVote(db: DB, runoffId: number, voterKey: string, now: Date = new Date()): void {
	immediate(db, () => {
		const runoff = db.prepare('SELECT * FROM runoff WHERE id = ?').get(runoffId) as
			| Runoff
			| undefined;
		if (!runoff) throw new RuleError('no_runoff', 'no such runoff');
		if (runoff.closed_at) throw new RuleError('runoff_decided', 'this runoff is already decided');
		if (isExpired(runoff, now)) throw new RuleError('runoff_expired', 'this runoff has expired');
		db.prepare('DELETE FROM runoff_ballot WHERE runoff_id = ? AND voter_key = ?').run(runoffId, voterKey);
	});
}

/** §7.2: the host starts the count once. Pressing again replays it on the
 * screen without moving the clock the phones are waiting on. */
export function startReveal(db: DB, runoffId: number, now: Date = new Date()): void {
	immediate(db, () => {
		db.prepare('UPDATE runoff SET revealed_at = ? WHERE id = ? AND closed_at IS NOT NULL AND revealed_at IS NULL')
			.run(iso(now), runoffId);
	});
}

/** the most recently decided runoff, for the host's winner screen */
export function latestDecidedRunoff(db: DB): Runoff | undefined {
	return db
		.prepare(
			`SELECT * FROM runoff WHERE closed_at IS NOT NULL AND winner_film_id IS NOT NULL
			 ORDER BY closed_at DESC, id DESC LIMIT 1`
		)
		.get() as Runoff | undefined;
}

export type RunoffResult = { kind: 'noop' } | { kind: 'winner'; film: Film };

/**
 * §7.3. The most ranked points wins; ties and zero turnout fall back to weekly
 * score, then age and id (§3.2). Idempotent.
 */
export function closeRunoff(
	db: DB,
	rules: RuleSet,
	runoffId: number,
	now: Date = new Date()
): RunoffResult {
	return immediate(db, () => {
		const runoff = db.prepare('SELECT * FROM runoff WHERE id = ?').get(runoffId) as
			| Runoff
			| undefined;
		if (!runoff || runoff.closed_at) return { kind: 'noop' } as RunoffResult;

		const week = weekByNumber(db, runoff.week_number) as Week | undefined;
		if (!week || week.status !== 'runoff') return { kind: 'noop' } as RunoffResult;

		const winner = tally(db, runoffId)[0]?.film;
		if (!winner) return { kind: 'noop' } as RunoffResult;

		db.prepare('UPDATE runoff SET closed_at = ?, winner_film_id = ? WHERE id = ?').run(
			iso(now),
			winner.id,
			runoffId
		);
		// the week was left unresolved by closeWeek; finish it now
		finish(db, rules, week, winner, now);
		return { kind: 'winner', film: winner } as RunoffResult;
	});
}

/** closes any runoff that has passed its expires_at; called by the scheduler */
export function closeExpiredRunoffs(db: DB, rules: RuleSet, now: Date = new Date()): void {
	const rows = db
		.prepare('SELECT id FROM runoff WHERE closed_at IS NULL AND expires_at <= ?')
		.all(iso(now)) as { id: number }[];
	for (const row of rows) closeRunoff(db, rules, row.id, now);
}
