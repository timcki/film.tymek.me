import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

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

	// rounds that went by without a film. Counted off the films rather than off
	// week.winner_film_id, which an admin moving a night's film around leaves
	// pointing at nothing while the film itself still names the week it was seen
	const weeksWithoutWinner = (
		db
			.prepare(
				`SELECT COUNT(*) AS n FROM week w
				 WHERE w.status = 'closed'
				   AND NOT EXISTS (
				     SELECT 1 FROM film f WHERE f.status = 'watched' AND f.watched_week = w.number
				   )`
			)
			.get() as { n: number }
	).n;

	return { watched, weeksWithoutWinner };
};
