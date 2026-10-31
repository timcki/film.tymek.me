/**
 * Writes src/lib/world-map.ts, the statistics map's shapes. Its four packages
 * are deliberately not dependencies of the app, since adding any moves the
 * npm hash the Nix build is pinned to, so run it from a scratch directory:
 *
 *   cd "$(mktemp -d)" && npm init -y && npm pkg set type=module
 *   npm i world-atlas@2 d3-geo@3 topojson-client@3 i18n-iso-countries@7
 *   cp <repo>/scripts/world-map.mjs . && node world-map.mjs <repo>/src/lib/world-map.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { geoEqualEarth, geoPath, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';
import countries from 'i18n-iso-countries';

const W = 1000;
const load = (f) => JSON.parse(readFileSync(`node_modules/world-atlas/${f}`, 'utf8'));
const coarse = feature(load('countries-110m.json'), load('countries-110m.json').objects.countries);
const fine = feature(load('countries-50m.json'), load('countries-50m.json').objects.countries);

const alpha2 = (f) => {
	if (f.properties.name === 'Kosovo') return 'XK';
	if (!f.id) return null;
	return countries.numericToAlpha2(f.id) ?? null;
};

const land = coarse.features.filter((f) => alpha2(f) !== 'AQ');
const projection = geoEqualEarth().fitWidth(W, { type: 'FeatureCollection', features: land });
const path = geoPath(projection);
const [[, y0], [, y1]] = path.bounds({ type: 'FeatureCollection', features: land });
const H = Math.ceil(y1 - y0);
projection.translate([projection.translate()[0], projection.translate()[1] - y0]);

const round = (d) => d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n))));
const shapes = {};
for (const f of land) {
	const code = alpha2(f);
	if (!code) continue;
	const d = round(path(f) ?? '');
	if (d) shapes[code] = (shapes[code] ?? '') + d;
}

const dots = {};
for (const f of fine.features) {
	const code = alpha2(f);
	if (!code || code === 'AQ' || shapes[code]) continue;
	const [x, y] = projection(geoCentroid(f)) ?? [];
	if (x == null || Number.isNaN(x)) continue;
	dots[code] = [Math.round(x), Math.round(y)];
}

const out = `/**
 * The world, drawn once: Natural Earth's 1:110m countries (world-atlas 2) in an
 * Equal Earth projection, ${W} by ${H}, coordinates rounded to whole units, keyed
 * by ISO 3166-1 alpha-2. Countries too small for that scale are a point instead,
 * placed at their 1:50m centroid. Generated, not written: regenerate rather than
 * edit, and keep it free of dependencies so the build's npm hash stays put.
 */
export const MAP_WIDTH = ${W};
export const MAP_HEIGHT = ${H};

export const SHAPES: Record<string, string> = ${JSON.stringify(shapes, null, '\t')};

export const DOTS: Record<string, [number, number]> = ${JSON.stringify(dots)};
`;
writeFileSync(process.argv[2], out);
console.log(Object.keys(shapes).length, 'shapes', Object.keys(dots).length, 'dots', out.length, 'bytes', H, 'high');
