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
 * The accent: the one colour everything pressable wears, a choice of its own
 * beside the palette, kept the same way (a cookie, put on <html> as
 * data-accent by the server so the first paint is right). Each works on both
 * palettes; their values live in themes.css. Rose is the app's own and needs
 * no attribute. Bananas and a special round bring their own accents and win.
 */
export const ACCENTS = ['rose', 'lavender', 'periwinkle', 'sky', 'seafoam', 'sage'] as const;

export type Accent = (typeof ACCENTS)[number];

export const DEFAULT_ACCENT: Accent = 'rose';

export function accentOf(value: string | undefined | null): Accent {
	return ACCENTS.includes(value as Accent) ? (value as Accent) : DEFAULT_ACCENT;
}

/** each accent's dark and light shade, for the switch's own dots */
export const ACCENT_SWATCH: Record<Accent, Record<'dark' | 'light', string>> = {
	rose: { dark: '#dba7b4', light: '#9c5869' },
	lavender: { dark: '#b5abd4', light: '#706793' },
	periwinkle: { dark: '#a9b0dc', light: '#5d64a3' },
	sky: { dark: '#a7c2d8', light: '#4f7593' },
	seafoam: { dark: '#9ccbc2', light: '#3e7c73' },
	sage: { dark: '#b0c79f', light: '#5b7a4c' }
};

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
 * §3.6: a look an admin puts on the whole site. Not chosen by anybody else: the
 * server puts it on <html> as data-special, over whichever palette is showing
 * and over bananas too, until an admin takes it off again.
 */
export const LOOKS = ['halloween', 'swieta', 'prl', 'folk'] as const;

export type Look = (typeof LOOKS)[number];

export function isLook(value: string | null | undefined): value is Look {
	return LOOKS.includes(value as Look);
}

/** each look is drawn for one palette, and dresses everybody in it while it is on */
export const LOOK_THEME: Record<Look, 'dark' | 'light'> = {
	halloween: 'dark',
	swieta: 'dark',
	prl: 'dark',
	folk: 'dark'
};

export const LOOK_BG: Record<Look, Record<'dark' | 'light', string>> = {
	// --bg itself: the Halloween wash glows from the bottom, so the top is unwashed
	halloween: {
		dark: '#120c16',
		light: '#f3e4cf'
	},
	swieta: {
		dark: '#0b1319',
		light: '#0b1319'
	},
	prl: {
		dark: '#1a1a18',
		light: '#1a1a18'
	},
	folk: {
		dark: '#0f0e0c',
		light: '#0f0e0c'
	}
};
