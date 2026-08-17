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
 * What iOS paints its status bar with. This is not --bg but --bg with the
 * palette's wash already over it, sampled at the top of the page, because that
 * is the colour the strip has to sit flush against. Re-sample if either changes.
 */
export const THEME_BG: Record<'dark' | 'light', string> = {
	dark: '#0f1012',
	light: '#f3e2d4'
};
