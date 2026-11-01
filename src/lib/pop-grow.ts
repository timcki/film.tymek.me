/**
 * How a small popup comes and goes: it grows out of whatever opened it, with a
 * little give at the end, and folds back into it on the way out, from the
 * edge nearest that thing (`below` when it opened under it). A Svelte
 * transition rather than a keyframe so the way out can play before it is gone;
 * asked for less motion, it simply appears and disappears.
 */
import { cubicIn } from 'svelte/easing';

const still = () =>
	typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function grow(_: Element, { below = false, out = false }: { below?: boolean; out?: boolean } = {}) {
	if (still()) return { duration: 0 };
	return out
		? {
				duration: 130,
				easing: cubicIn,
				css: (t: number) =>
					`opacity:${t};transform:translateY(${(1 - t) * (below ? -4 : 4)}px) scale(${0.92 + 0.08 * t})`
			}
		: {
				duration: 240,
				// overshoots a touch, then settles
				easing: (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
				css: (t: number) =>
					`opacity:${Math.min(1, t * 1.6)};transform:translateY(${(1 - t) * (below ? -8 : 8)}px) scale(${0.82 + 0.18 * t})`
			};
}
