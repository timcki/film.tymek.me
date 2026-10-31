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

	return { watched };
};
