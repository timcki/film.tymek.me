/**
 * §3.6: a nudge to whatever runs along the top of the page. A string of lights
 * (Lights.svelte) or the folk look's band of stitches (Folk.svelte) sets
 * `flicker` while it is up; the projector calls it when a ballot lands, and it
 * answers in its own way: the bulbs shiver or chase, a glint runs along the
 * thread.
 */
export const lights: { flicker: () => void } = { flicker: () => {} };
