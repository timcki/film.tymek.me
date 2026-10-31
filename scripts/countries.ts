/**
 * Fills film.countries for the films that came in before TMDB's production
 * countries were kept. Only rows with a TMDB id and no countries yet are
 * touched, so running it again picks up where it left off and changes nothing
 * it already did. Prints what it would write unless told to commit.
 *
 *   TMDB_READ_TOKEN=... DATABASE_PATH=... npm run countries
 *   TMDB_READ_TOKEN=... DATABASE_PATH=... npm run countries -- --commit
 */
import { immediate, openDatabase } from '../src/lib/server/db.ts';
import { countriesOf } from '../src/lib/server/tmdb.ts';

const TOKEN = process.env.TMDB_READ_TOKEN ?? '';
const PATH = process.env.DATABASE_PATH ?? 'data/filmnight.db';
const COMMIT = process.argv.includes('--commit');
if (!TOKEN) throw new Error('TMDB_READ_TOKEN is not set');

const db = openDatabase(PATH);
const films = db
	.prepare('SELECT id, title, tmdb_id FROM film WHERE tmdb_id IS NOT NULL AND countries IS NULL')
	.all() as { id: number; title: string; tmdb_id: number }[];
console.log(`${films.length} films without countries in ${PATH}`);

const update = db.prepare('UPDATE film SET countries = ? WHERE id = ? AND countries IS NULL');
let filled = 0;
for (const film of films) {
	const response = await fetch(`https://api.themoviedb.org/3/movie/${film.tmdb_id}`, {
		headers: { Authorization: `Bearer ${TOKEN}`, accept: 'application/json' }
	});
	if (!response.ok) {
		console.warn(`  ${film.title}: TMDB ${response.status}, skipped`);
		continue;
	}
	const movie = (await response.json()) as { production_countries?: { iso_3166_1?: string }[] };
	const countries = countriesOf(movie.production_countries);
	console.log(`  ${film.title}: ${countries ?? '(none listed)'}`);
	if (COMMIT && countries) {
		immediate(db, () => update.run(countries, film.id));
		filled++;
	}
}
console.log(COMMIT ? `filled ${filled}` : 'dry run; pass --commit to write');
