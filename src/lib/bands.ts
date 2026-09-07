/**
 * The bands each axis of the engagement grid is cut into.
 *
 * Fractions were the wrong tool at this scale. Out of five nights, four of them
 * and three of them are a real difference and a quarter of the roster sits on
 * it, but any banding wide enough to be worth drawing swallows exactly that.
 * So while the counts are small enough to fit, every count gets its own column
 * and the grid says the plain number; only once the history outgrows the screen
 * does it fall back to ranges, and even then the top band is the full set and
 * nothing less than it.
 */
export type Band = { from: number; to: number };

/**
 * The most columns worth putting on a phone. Seven of them, counts nought to
 * six, still leaves room for a face in each.
 */
const EXACT_MAX = 6;

export function bandsFor(outOf: number): Band[] {
	if (outOf <= 0) return [{ from: 0, to: 0 }];
	// few enough to give every count a column of its own, which is always the
	// better chart: a band is a compromise and this scale does not need one
	if (outOf <= EXACT_MAX) {
		return Array.from({ length: outOf + 1 }, (_, n) => ({ from: n, to: n }));
	}
	const high = outOf - 1;
	const mid = Math.ceil(high / 2);
	return [
		{ from: 0, to: 0 },
		{ from: 1, to: mid },
		{ from: mid + 1, to: high },
		{ from: outOf, to: outOf }
	];
}

/** which band a count belongs to, as an index into bandsFor(outOf) */
export function bandOf(count: number, outOf: number): number {
	const bands = bandsFor(outOf);
	const n = Math.max(0, Math.min(count, outOf));
	const index = bands.findIndex((band) => n >= band.from && n <= band.to);
	return index >= 0 ? index : 0;
}

/** what a band is called on the axis */
export function bandLabel(band: Band): string {
	return band.from === band.to ? String(band.from) : `${band.from}-${band.to}`;
}
