import type { DB } from './db.js';

/**
 * §9.2: what earns XP and how much. Attendance dominates by design; that is the
 * behaviour the system exists to reward. Everything here is derived from the
 * attendance, ballot and film tables, so XP is recomputable from scratch and
 * retroactive to week 1.
 */
export const XP = {
	/** you were in the room */
	attend: 10,
	/** you spent at least one point that week, or ticked a pick in a special round */
	vote: 2,
	/** you nominated a film */
	nominate: 1,
	/** a film you nominated got watched */
	nominationWatched: 15,
	/** you had points on the winner in its winning week */
	backedWinner: 3
} as const;

/**
 * The films that earn their nominator anything. An outing is credited to
 * whoever suggested it so the record says so, but the voting had no part in it
 * and it earns nobody XP.
 */
const IN_PLAY = 'outing IS NULL';

/**
 * (person, round) for every round somebody voted in. A special round's ticks
 * (§3.6) are its votes, so turning up to one is no worse for your XP than a
 * round of points; a round with both still counts once.
 */
const ROUNDS_VOTED = `
	SELECT person_id, week_number FROM ballot
	UNION
	SELECT a.person_id, f.added_week AS week_number
	FROM approval a JOIN film f ON f.id = a.film_id`;

export type XpBreakdown = {
	nightsAttended: number;
	weeksVoted: number;
	nominations: number;
	nominationsWatched: number;
	winnersBacked: number;
	total: number;
};

function totalFrom(b: Omit<XpBreakdown, 'total'>): number {
	return (
		b.nightsAttended * XP.attend +
		b.weeksVoted * XP.vote +
		b.nominations * XP.nominate +
		b.nominationsWatched * XP.nominationWatched +
		b.winnersBacked * XP.backedWinner
	);
}

/** one person's XP, straight from the tables; what /me shows */
export function xpBreakdown(db: DB, personId: string): XpBreakdown {
	const one = (sql: string) => (db.prepare(sql).get(personId) as { n: number }).n;
	const counts = {
		nightsAttended: one('SELECT COUNT(*) AS n FROM attendance WHERE person_id = ?'),
		weeksVoted: one(`SELECT COUNT(*) AS n FROM (${ROUNDS_VOTED}) WHERE person_id = ?`),
		nominations: one(`SELECT COUNT(*) AS n FROM film WHERE added_by = ? AND ${IN_PLAY}`),
		nominationsWatched: one(
			`SELECT COUNT(*) AS n FROM film WHERE added_by = ? AND status = 'watched' AND ${IN_PLAY}`
		),
		winnersBacked: one(
			`SELECT COUNT(DISTINCT f.id) AS n FROM film f
			 JOIN ballot b ON b.film_id = f.id AND b.week_number = f.watched_week
			 WHERE f.status = 'watched' AND b.person_id = ?`
		)
	};
	return { ...counts, total: totalFrom(counts) };
}

/**
 * Recomputes every person's XP from the tables and writes the cache. The only
 * writer of person.xp, run inside the mutating transactions that touch its
 * inputs, so the cache is rebuilt wholesale and can never partially drift.
 * XP never moves with the passage of time, only on these events, which is why
 * no clock or TTL appears anywhere here.
 */
export function rexpAll(db: DB): void {
	const totals = new Map<string, number>();
	const add = (rows: { person_id: string; n: number }[], perUnit: number) => {
		for (const row of rows) totals.set(row.person_id, (totals.get(row.person_id) ?? 0) + row.n * perUnit);
	};

	add(
		db.prepare('SELECT person_id, COUNT(*) AS n FROM attendance GROUP BY person_id').all() as {
			person_id: string;
			n: number;
		}[],
		XP.attend
	);
	add(
		db
			.prepare(`SELECT person_id, COUNT(*) AS n FROM (${ROUNDS_VOTED}) GROUP BY person_id`)
			.all() as { person_id: string; n: number }[],
		XP.vote
	);
	add(
		db
			.prepare(`SELECT added_by AS person_id, COUNT(*) AS n FROM film WHERE ${IN_PLAY} GROUP BY added_by`)
			.all() as { person_id: string; n: number }[],
		XP.nominate
	);
	add(
		db
			.prepare(
				`SELECT added_by AS person_id, COUNT(*) AS n FROM film
				 WHERE status = 'watched' AND ${IN_PLAY} GROUP BY added_by`
			)
			.all() as { person_id: string; n: number }[],
		XP.nominationWatched
	);
	add(
		db
			.prepare(
				`SELECT b.person_id, COUNT(DISTINCT f.id) AS n FROM film f
				 JOIN ballot b ON b.film_id = f.id AND b.week_number = f.watched_week
				 WHERE f.status = 'watched' GROUP BY b.person_id`
			)
			.all() as { person_id: string; n: number }[],
		XP.backedWinner
	);

	const update = db.prepare('UPDATE person SET xp = ? WHERE id = ?');
	const people = db.prepare('SELECT id FROM person').all() as { id: string }[];
	for (const person of people) update.run(totals.get(person.id) ?? 0, person.id);
}
