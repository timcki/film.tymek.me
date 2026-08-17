import type { DB } from './db.js';
import { immediate } from './db.js';
import type { Film, Runoff, Week } from './types.js';
import { RuleError } from './types.js';
import type { RuleSet } from './rules.js';
import { orderFilms } from './rules.js';
import { checkIn } from './attendance.js';
import { iso } from './time.js';
import { finish, weekByNumber } from './weeks.js';

export type Tally = { film: Film & { score: number }; votes: number };

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

/** live tally, ordered the way the runoff will actually be resolved */
export function tally(db: DB, runoffId: number): Tally[] {
	const counts = new Map(
		(
			db
				.prepare(
					'SELECT film_id, COUNT(*) AS votes FROM runoff_ballot WHERE runoff_id = ? GROUP BY film_id'
				)
				.all(runoffId) as { film_id: number; votes: number }[]
		).map((r) => [r.film_id, r.votes])
	);
	const films = orderFilms(runoffFilms(db, runoffId));
	// §7.3: flash votes desc, then the §3.2 ordering, which orderFilms already applied
	return films
		.map((film) => ({ film, votes: counts.get(film.id) ?? 0 }))
		.sort((a, b) => b.votes - a.votes || films.indexOf(a.film) - films.indexOf(b.film));
}

/**
 * §7.2. One row per (runoff_id, voter_key), and the first one is final: a flash
 * vote decides the night, so there is nothing to change your mind to. Written to
 * runoff_ballot and never to ballot: being in the room breaks a tie, it does not
 * buy influence.
 */
export function flashVote(
	db: DB,
	runoffId: number,
	voterKey: string,
	personId: string | null,
	filmId: number,
	now: Date = new Date()
): void {
	immediate(db, () => {
		const runoff = db.prepare('SELECT * FROM runoff WHERE id = ?').get(runoffId) as
			| Runoff
			| undefined;
		if (!runoff) throw new RuleError('no_runoff', 'no such runoff');
		if (runoff.closed_at) throw new RuleError('runoff_decided', 'this runoff is already decided');
		if (isExpired(runoff, now)) throw new RuleError('runoff_expired', 'this runoff has expired');

		const inRunoff = db
			.prepare('SELECT 1 FROM runoff_film WHERE runoff_id = ? AND film_id = ?')
			.get(runoffId, filmId);
		if (!inRunoff) throw new RuleError('film_not_in_runoff', 'that film is not in this runoff');

		const existing = db
			.prepare('SELECT film_id FROM runoff_ballot WHERE runoff_id = ? AND voter_key = ?')
			.get(runoffId, voterKey) as { film_id: number } | undefined;
		if (existing) {
			// a double-tap on the same card is not a crime; a different film is
			if (existing.film_id === filmId) return;
			throw new RuleError('vote_locked', 'your flash vote is locked in; one tap decides the night');
		}

		db.prepare(
			`INSERT INTO runoff_ballot (runoff_id, voter_key, person_id, film_id, created_at)
			 VALUES (?, ?, ?, ?, ?)`
		).run(runoffId, voterKey, personId, filmId, iso(now));

		// §7.4: an identified flash vote implies being in the room
		if (personId) checkIn(db, runoff.week_number, personId, now);
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
 * §7.3. Zero turnout and a tied flash vote both fall back to the §3.2 ordering,
 * which means the film that has been waiting longest wins. Idempotent.
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
