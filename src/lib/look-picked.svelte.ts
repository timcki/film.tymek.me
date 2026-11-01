import type { Accent, Theme } from './themes';

/**
 * The palette, the bananas and the accent as somebody picked them on this page,
 * over what the page data said when it loaded. The switch in the layout writes
 * it and shows it at once; the server keeps the pick in a cookie for the next
 * load, but the page data is not fetched again to say so (that would redraw
 * the list), so this stands in for it until then. Anything drawn in the one or
 * the other reads it over its own data, so the whole page changes in one fade.
 */
export const picked = $state<{ theme?: Theme; banana?: boolean; accent?: Accent }>({});
