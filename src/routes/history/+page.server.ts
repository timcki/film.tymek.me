import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { avatarUrl } from '$lib/server/people';

type WatchedRow = {
	id: number;
	title: string;
	year: number | null;
	director: string | null;
	poster_url: string | null;
	watched_week: number;
	/** null for the nights that predate the app, where nobody spent anything */
	final_score: number | null;
	added_by_name: string;
};

type PersonRow = {
	id: string;
	name: string;
	colour: string;
	avatar_updated_at: string | null;
	watched: number;
	nominated: number;
};

export const load: PageServerLoad = async () => {
	const db = getDb();

	const watched = db
		.prepare(
			`SELECT f.id, f.title, f.year, f.director, f.poster_url, f.watched_week, f.final_score,
			        p.name AS added_by_name
			 FROM film f JOIN person p ON p.id = f.added_by
			 WHERE f.status = 'watched'
			 ORDER BY f.watched_week DESC, f.id DESC`
		)
		.all() as WatchedRow[];

	// the group's own check on whether the active rule set is being fair
	const rows = db
		.prepare(
			`SELECT p.id, p.name, p.colour, p.avatar_updated_at,
			        COUNT(f.id) FILTER (WHERE f.status = 'watched') AS watched,
			        COUNT(f.id) AS nominated
			 FROM person p LEFT JOIN film f ON f.added_by = p.id
			 WHERE p.active = 1
			 GROUP BY p.id
			 ORDER BY watched DESC, nominated DESC, p.name COLLATE NOCASE`
		)
		.all() as PersonRow[];

	const perPerson = rows.map(({ avatar_updated_at, ...person }) => ({
		...person,
		avatar: avatarUrl(person.id, avatar_updated_at)
	}));

	const weeksWithoutWinner = (
		db
			.prepare(`SELECT COUNT(*) AS n FROM week WHERE status = 'closed' AND winner_film_id IS NULL`)
			.get() as { n: number }
	).n;

	return { watched, perPerson, weeksWithoutWinner };
};
