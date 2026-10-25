/**
 * §3.6: how a hanging bat hands itself to the sky. The sky (Bats.svelte) sets
 * `release` when it mounts; a bat that lets go of whatever it was hanging from
 * calls it with where on the screen it let go, and flies off from there.
 */
export const batSky: { release: (x: number, y: number) => void } = { release: () => {} };
