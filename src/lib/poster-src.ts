const TMDB_IMAGES = 'https://image.tmdb.org/t/p/';

/** a TMDB poster, routed through our own cache; anything else is left alone */
export function posterSrc(url: string): string;
export function posterSrc(url: string | null | undefined): string | null;
export function posterSrc(url: string | null | undefined): string | null {
	if (!url) return null;
	return url.startsWith(TMDB_IMAGES) ? `/poster/${url.slice(TMDB_IMAGES.length)}` : url;
}
