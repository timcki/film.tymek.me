/**
 * A nudge to the lights along the top of the page. Whichever look has strung
 * its own sets `flicker` (Halloween.svelte, Cinema.svelte); the projector calls
 * it when a ballot lands. §3.6's Halloween shivers, as if something had walked
 * past under the bulbs; the everyday marquee races.
 */
export const lights: { flicker: () => void } = { flicker: () => {} };
