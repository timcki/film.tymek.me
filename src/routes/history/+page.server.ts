import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { filmEvenings } from '$lib/server/evenings';
import type { Outing } from '$lib/outings';

type WatchedRow = {
	id: number;
	title: string;
	year: number | null;
	director: string | null;
	poster_url: string | null;
	/** null for the nights that predate the app, where nobody spent anything */
	final_score: number | null;
	/** where we went, when it was not a film night */
	outing: Outing | null;
	added_by_name: string;
};

export const load: PageServerLoad = async () => {
	const db = getDb();
	const evenings = filmEvenings(db);

	const watched = (
		db
			.prepare(
				`SELECT f.id, f.title, f.year, f.director, f.poster_url, f.final_score, f.outing,
				        p.name AS added_by_name
				 FROM film f JOIN person p ON p.id = f.added_by
				 WHERE f.status = 'watched'`
			)
			.all() as WatchedRow[]
	)
		.map((film) => ({ ...film, evening: evenings.get(film.id) ?? 0 }))
		.sort((a, b) => b.evening - a.evening);

	return { watched };
};
