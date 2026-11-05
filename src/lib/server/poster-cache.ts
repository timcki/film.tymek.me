import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DB } from './db.js';
import { POSTER_PREFIX } from './films.js';

/**
 * TMDB's posters, fetched once by the server and kept on disk beside the
 * database, so twenty-odd phones opening the list ask TMDB for nothing. Files
 * rather than BLOBs: they are a cache that refills itself, and nightly backups,
 * which copy the database, should not grow by every poster ever shown.
 */
const SIZE = /^w\d{2,3}$|^original$/;
const FILE = /^[A-Za-z0-9_-]+\.(jpg|png)$/;
const MAX_BYTES = 4 * 1024 * 1024;

const inFlight = new Map<string, Promise<Buffer | null>>();

function cacheDir(): string {
	return join(dirname(process.env.DATABASE_PATH ?? 'data/filmnight.db'), 'posters');
}

export function contentTypeOf(file: string): string {
	return file.endsWith('.png') ? 'image/png' : 'image/jpeg';
}

/**
 * The TMDB URL a request names, or null when it is not the shape of a poster.
 * Only a poster some film actually wears is cached; anything else, a search
 * result say, is sent on to TMDB, so this never becomes a way to fetch arbitrary
 * files through the server or to fill its disk.
 */
export function posterSource(db: DB, size: string, file: string): { url: string; ours: boolean } | null {
	if (!SIZE.test(size) || !FILE.test(file)) return null;
	const url = `${POSTER_PREFIX}${size}/${file}`;
	return { url, ours: !!db.prepare('SELECT 1 FROM film WHERE poster_url = ? LIMIT 1').get(url) };
}

/** the poster's bytes, from disk or fetched once; null when TMDB will not give them */
export async function cachedPoster(size: string, file: string, url: string): Promise<Buffer | null> {
	const path = join(cacheDir(), `${size}-${file}`);
	try {
		return await readFile(path);
	} catch {
		// not cached yet
	}
	// a page of twenty cards asks for twenty posters at once, and a busy evening
	// asks for the same one from every phone: one fetch serves all of them
	let pending = inFlight.get(path);
	if (!pending) {
		pending = fetchPoster(url, path).finally(() => inFlight.delete(path));
		inFlight.set(path, pending);
	}
	return pending;
}

async function fetchPoster(url: string, path: string): Promise<Buffer | null> {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
		if (!response.ok) throw new Error(`TMDB responded ${response.status}`);
		const type = response.headers.get('content-type') ?? '';
		if (!type.startsWith('image/')) throw new Error(`TMDB sent ${type || 'no content type'}`);
		const body = Buffer.from(await response.arrayBuffer());
		if (body.length === 0 || body.length > MAX_BYTES) throw new Error(`unexpected size ${body.length}`);
		await mkdir(dirname(path), { recursive: true });
		// written aside and moved into place, so a reader never sees half a file
		const partial = `${path}.${process.pid}.part`;
		await writeFile(partial, body);
		await rename(partial, path);
		return body;
	} catch (error) {
		console.warn('[posters] fetch failed:', (error as Error).message);
		return null;
	}
}
