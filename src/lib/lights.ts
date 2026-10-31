/**
 * §3.6: a nudge to the string of lights along the top of the page. The string
 * (Lights.svelte) sets `flicker` while it is strung; the projector calls it
 * when a ballot lands, and a wave runs along the bulbs in whatever way the
 * look's string answers: a shiver, or a chase of flares.
 */
export const lights: { flicker: () => void } = { flicker: () => {} };
