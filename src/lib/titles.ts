const LEADING_ARTICLE = /^(the|a|an|le|la|el)\s+/;

/**
 * §4.1: lowercased, NFKD-normalised, diacritics stripped, leading article removed,
 * all non-alphanumerics removed. `Sátántangó` -> `satantango`, `The Thing` -> `thing`.
 */
export function titleKey(title: string): string {
	const stripped = title
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		// NFKD leaves stroked letters (ł, ø, đ) intact; map the common ones by hand
		.replace(/ł/g, 'l')
		.replace(/Ł/g, 'L')
		.replace(/ø/gi, 'o')
		.replace(/đ/gi, 'd')
		.toLowerCase()
		.trim();
	return stripped.replace(LEADING_ARTICLE, '').replace(/[^a-z0-9]/g, '');
}

/**
 * §3.6: whether a film somebody is about to pick is the one they have on the
 * list. TMDB's id decides where both have one; the title otherwise, the way
 * §4.1 catches a duplicate. The server asks the same question in SQL.
 */
export function sameFilm(
	a: { tmdbId: number | null; title: string },
	b: { tmdbId: number | null; title: string }
): boolean {
	return a.tmdbId && b.tmdbId ? a.tmdbId === b.tmdbId : titleKey(a.title) === titleKey(b.title);
}
