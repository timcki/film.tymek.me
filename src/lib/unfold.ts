import { slide, type SlideParams, type TransitionConfig } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';

/**
 * A block opening up into the page, or closing out of it: its height grows
 * from nothing while it fades in, so whatever sits below it is pushed along
 * smoothly instead of jumping. The count on the projector uses it to hand one
 * stage over to the next.
 */
export function unfold(node: Element, params: SlideParams = {}): TransitionConfig {
	const opening = slide(node, { easing: cubicOut, ...params });
	return {
		...opening,
		css: (t, u) => `${opening.css?.(t, u) ?? ''} opacity: ${Math.min(1, t * 1.5)};`
	};
}
