/**
 * Resolves a list of titles against TMDB and prints the candidates, so a human
 * can check the matches before anything is written to a database. Dry run only:
 * it opens nothing and writes nothing.
 *
 *   TMDB_READ_TOKEN=... npm run lookup
 */
const TOKEN = process.env.TMDB_READ_TOKEN ?? '';
if (!TOKEN) throw new Error('TMDB_READ_TOKEN is not set');

const API = 'https://api.themoviedb.org/3';

type Candidate = {
	id: number;
	title: string;
	original: string;
	year: string;
	popularity: number;
};

async function get(path: string): Promise<Record<string, unknown>> {
	const response = await fetch(`${API}${path}`, {
		headers: { Authorization: `Bearer ${TOKEN}`, accept: 'application/json' }
	});
	if (!response.ok) throw new Error(`${response.status} on ${path}`);
	return (await response.json()) as Record<string, unknown>;
}

async function search(query: string, language: string): Promise<Candidate[]> {
	const body = (await get(
		`/search/movie?include_adult=false&language=${language}&query=${encodeURIComponent(query)}`
	)) as { results?: Record<string, unknown>[] };
	return (body.results ?? []).slice(0, 4).map((movie) => ({
		id: movie.id as number,
		title: movie.title as string,
		original: movie.original_title as string,
		year: String(movie.release_date ?? '').slice(0, 4),
		popularity: movie.popularity as number
	}));
}

const TITLES = process.argv.slice(2);

for (const wanted of TITLES) {
	// Polish first, since half of these were given by their Polish release title
	let found = await search(wanted, 'pl-PL');
	if (!found.length) found = await search(wanted, 'en-US');
	const shown = found
		.map((c) => `${c.id} | ${c.title} (${c.year}) [orig: ${c.original}]`)
		.join('\n      ');
	console.log(`\n"${wanted}"\n      ${shown || 'NOTHING FOUND'}`);
}
