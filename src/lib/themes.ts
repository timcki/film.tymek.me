/**
 * The palettes, kept the way the language is: a cookie, so the server can dress
 * the page before it is sent and nothing flashes on the way in.
 *
 * "dark" is the palette the app was born in and needs no tokens of its own;
 * "light" is the block in themes.css; "auto" is whichever of the two the phone
 * is already in, resolved by the one inline script in app.html so that the
 * first paint is right. Without scripting it stays on dark, as it always was.
 */
export const THEMES = ['auto', 'dark', 'light'] as const;

export type Theme = (typeof THEMES)[number];

/** whatever the phone is already in, for anyone who has never picked */
export const DEFAULT_THEME: Theme = 'auto';

export function themeOf(value: string | undefined | null): Theme {
	return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME;
}

/**
 * What iOS paints its status bar with: each palette's --bg exactly. The page
 * is one flat colour from the status bar down, so the strip and the bar under
 * it meet without a seam. Change these with --bg, or they part.
 */
export const THEME_BG: Record<'dark' | 'light', string> = {
	dark: '#0f1012',
	light: '#f7f0e7'
};

/**
 * Bananas: not a third palette but a flavour laid over whichever of the two is
 * showing, so "auto" keeps following the phone. Its own cookie, '1' or nothing,
 * set on <html> as data-banana; the yellow lives in themes.css and the bananas
 * themselves in the few places a check or a burst used to be.
 */
export function bananaOf(value: string | undefined | null): boolean {
	return value === '1';
}

/** the banana palettes' --bg, the same way */
export const BANANA_BG: Record<'dark' | 'light', string> = {
	dark: '#0e0c09',
	light: '#eef1e6'
};

/**
 * §3.6: a special round's look. Not chosen by anybody: the server puts it on
 * <html> as data-special while the round lasts, over whichever palette is
 * showing and over bananas too, and takes it off again when it is over.
 */
export const SPECIAL_BG: Record<string, Record<'dark' | 'light', string>> = {
	// --bg itself: the Halloween wash glows from the bottom, so the top is unwashed
	halloween: {
		dark: '#120c16',
		light: '#f3e4cf'
	}
};
