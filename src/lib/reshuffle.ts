/**
 * The list settling into its new order after a vote, as a Svelte animation
 * on each card's wrapper. Two ways of moving, for the two ways the list is
 * laid out:
 *
 * - one column (a phone): cards only go up and down. One that climbs is
 *   lifted (a touch larger, a shadow under it) and glides over the rest; the
 *   ones it passes slide down a beat after, so it visibly leads. The longer
 *   the way, the longer it takes, so a hop is quick and a climb is not a jump.
 * - a grid (a desktop): cards cross columns, and straight lines would run
 *   them through each other. A climbing card travels on a gentle arc, lifted
 *   over the rest; the ones making room dip a little, as if pushed back, and
 *   go under it.
 *
 * A card that changes shape on the way (into the podium on a desktop, or out
 * of it) is a different card where it lands, so it does not travel: it fades
 * in at its new seat, growing into place. Asked for less motion, the cards
 * are simply where they now belong.
 */
import type { AnimationConfig } from 'svelte/animate';

const outQuart = (t: number) => 1 - (1 - t) ** 4;
const inOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

export function reshuffle(
	node: Element,
	{ from, to }: { from: DOMRect; to: DOMRect },
	{ still = false, flat = false }: { still?: boolean; flat?: boolean } = {}
): AnimationConfig {
	const dx = from.left - to.left;
	const dy = from.top - to.top;
	const dist = Math.hypot(dx, dy);
	if (still || dist < 1) return { duration: 0 };
	// climbing: it came from further down the list than where it now sits
	const rising = dy > 1 || (Math.abs(dy) <= 1 && dx > 1);
	const grid = node.parentElement
		? getComputedStyle(node.parentElement).display === 'grid'
		: false;
	const lift = flat ? 0 : rising ? 1 : 0;

	if (Math.abs(from.width - to.width) > 24 || Math.abs(from.height - to.height) > 40) {
		return {
			delay: 120,
			duration: 420,
			easing: outQuart,
			css: (t) => `opacity: ${t}; transform: scale(${0.94 + 0.06 * t}); z-index: 2;`
		};
	}

	if (!grid) {
		return {
			delay: rising || flat ? 0 : 60,
			duration: Math.min(900, Math.max(380, 300 + Math.sqrt(Math.abs(dy)) * 16)),
			easing: outQuart,
			css: (t, u) => {
				const arc = Math.sin(Math.PI * t) * lift;
				return `transform: translateY(${dy * u}px) scale(${1 + 0.03 * arc});
					z-index: ${rising ? 3 : 1};
					box-shadow: 0 ${20 * arc}px ${44 * arc}px -16px rgba(0, 0, 0, ${0.45 * arc});`;
			}
		};
	}

	// on a grid the climber bows off its straight line, sideways to its way
	const bow = Math.min(46, dist * 0.12) * (dx > 0 ? -1 : 1);
	const nx = dist ? -dy / dist : 0;
	const ny = dist ? dx / dist : 0;
	return {
		duration: Math.min(950, Math.max(450, 380 + Math.sqrt(dist) * 14)),
		easing: inOutCubic,
		css: (t, u) => {
			const arc = Math.sin(Math.PI * t);
			const ox = rising ? nx * bow * arc : 0;
			const oy = rising ? ny * bow * arc : 0;
			const scale = rising && !flat ? 1 + 0.045 * arc : flat ? 1 : 1 - 0.025 * arc;
			const shade = lift * arc;
			return `transform: translate(${dx * u + ox}px, ${dy * u + oy}px) scale(${scale});
				z-index: ${rising ? 3 : 1};
				box-shadow: 0 ${24 * shade}px ${50 * shade}px -18px rgba(0, 0, 0, ${0.5 * shade});`;
		}
	};
}
