/**
 * §3.6: a nudge to the string of lights along the top of the page. The lights
 * (Halloween.svelte) set `flicker` while they are strung; the projector calls
 * it when a ballot lands, and a shiver runs along the bulbs as if something
 * had walked past under them.
 */
export const lights: { flicker: () => void } = { flicker: () => {} };
