/**
 * Creates the people with random tokens, opens week 1, and prints each personal
 * link to stdout once. Send them out over Signal, then never print them again.
 *
 *   DATABASE_PATH=data/filmnight.db ORIGIN=https://film.tymek.me npm run seed
 *
 * Safe to re-run: people who already exist are left alone, tokens are not reissued.
 */
import { openDatabase } from '../src/lib/server/db.ts';
import { activeRules, origin } from '../src/lib/server/config.ts';
import { COLOURS, ROSTER } from '../src/lib/server/roster.ts';
import { newToken, slugify } from '../src/lib/server/tokens.ts';
import { iso } from '../src/lib/server/time.ts';
import { openWeek } from '../src/lib/server/weeks.ts';

const path = process.env.DATABASE_PATH ?? 'data/filmnight.db';
const db = openDatabase(path);
const rules = activeRules();
const base = origin().replace(/\/$/, '');

const insertPerson = db.prepare(
	`INSERT INTO person (id, name, colour, token, active, created_at) VALUES (?, ?, ?, ?, 1, ?)`
);
const insertBank = db.prepare(
	`INSERT INTO bank (person_id, balance, updated_at) VALUES (?, ?, ?)
	 ON CONFLICT(person_id) DO NOTHING`
);

const created: { name: string; id: string; token: string }[] = [];
const existing: string[] = [];

db.transaction(() => {
	ROSTER.forEach((name, index) => {
		const id = slugify(name);
		const already = db.prepare('SELECT token FROM person WHERE id = ?').get(id) as
			| { token: string }
			| undefined;
		if (already) {
			existing.push(name);
		} else {
			const token = newToken();
			insertPerson.run(id, name, COLOURS[index % COLOURS.length], token, iso());
			created.push({ name, id, token });
		}
		// a person joining mid-run starts with pointsPerWeek, §3.3
		insertBank.run(id, rules.pointsPerWeek, iso());
	});
	openWeek(db, 1);
})();

const week = db.prepare('SELECT * FROM week ORDER BY number DESC LIMIT 1').get() as {
	number: number;
	closes_at: string;
};

console.log(`database: ${path}`);
console.log(`rules:    ${rules.label} (${rules.id})`);
console.log(`week ${week.number} closes at ${week.closes_at}`);
if (existing.length) console.log(`unchanged: ${existing.length} people already existed`);
console.log('');
for (const person of created) {
	console.log(`${person.name.padEnd(24)} ${base}/u/${person.token}`);
}
if (!created.length) console.log('no new people; nobody got a new link');
