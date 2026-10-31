import { isDemo } from './config.js';

/**
 * §3.6: what the PRL look's wall is pasted with. Tadeusz Trepkowski's film
 * posters (1948-1953) are in the public domain in Poland and the EU since 2025,
 * life plus seventy years, so they sit in static/prl for anyone. The rest are
 * the Polish School proper, Świerzy, Starowieyski, Cieślewicz and the others,
 * all still in copyright: scans from polishpostergallery.com, Deadline's and
 * the IVPDA's galleries, cut down to a bill's size. They are served from
 * behind the personal-link gate (src/routes/wall) for the group's eyes only,
 * and the demo, a public door, never offers them. Each is its own lazily
 * imported module, so a poster is read the first time somebody asks for it.
 */
const FILES = import.meta.glob<string>('./posters/*.jpg', { query: '?inline', import: 'default' });

const PUBLIC_DOMAIN = [
	'ostatni-etap',
	'zagubione-melodie',
	'poludnik-49',
	'dusze-czarnych',
	'moje-uniwersytety',
	'zagubione-dni',
	'sprawa-rodzinna',
	'bitwa-stalingradzka'
].map((name) => `/prl/${name}.jpg`);

const GATED = Object.keys(FILES).map((key) => `/wall/${key.slice('./posters/'.length)}`);

/** every bill the wall may paste up, as URLs */
export function wallPosters(): string[] {
	return isDemo() ? PUBLIC_DOMAIN : [...PUBLIC_DOMAIN, ...GATED];
}

/** one gated poster's JPEG, or null when there is no such poster here */
export async function wallPoster(name: string): Promise<Uint8Array | null> {
	const load = FILES[`./posters/${name}.jpg`];
	if (!load || isDemo()) return null;
	const inline = await load();
	return Buffer.from(inline.slice(inline.indexOf(',') + 1), 'base64');
}
