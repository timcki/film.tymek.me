/**
 * §3.6: one flying bat, as the sky and the reveal's burst both draw it. The
 * Halloween silhouette, seen from the front: a little body with pricked ears
 * and a long wing either side, the leading edge arching up to a hooked tip and
 * the trailing edge hanging in sharp scallops. Each wing beats by swinging about
 * its shoulder, up into a V and down past level.
 */

const SVG = 'http://www.w3.org/2000/svg';

const WING =
	'M22.6 13.4 C19.8 8.4 15.8 6 11.6 7 C7.6 8 3.8 7.4 0.4 4.2 C1 8 2.2 10.8 4.2 12.8 Q5.8 10 8.6 14 Q10.4 11.2 13 15.4 Q14.8 12.8 17.6 16.6 Q19.8 14.6 22.8 17.4 Z';
const BODY =
	'M24 11.4C25.6 11.4 26.4 12.6 26.4 14.4 26.4 17.4 25.4 19.6 24 19.6S21.6 17.4 21.6 14.4C21.6 12.6 22.4 11.4 24 11.4Z M22.4 12.4 22 9.8 23.4 11.6Z M25.6 12.4 26 9.8 24.6 11.6Z';
/** where each wing hinges, in the viewBox */
const SHOULDER = '22.6 15';
/** degrees above level: the top of the stroke, the bottom, and a glide */
export const UP = 38;
export const DOWN = -22;
export const GLIDE = -6;

export type BatShape = { el: SVGSVGElement; left: SVGGElement; right: SVGGElement };

/** a bat `size` px across, appended to `parent` and drawn at its top left */
export function drawBat(parent: Element, size: number, className = 'bat'): BatShape {
	const el = document.createElementNS(SVG, 'svg');
	el.setAttribute('viewBox', '0 0 48 32');
	el.setAttribute('class', className);
	el.style.width = `${size}px`;
	el.style.height = `${(size * 2) / 3}px`;
	const wing = () => {
		const g = document.createElementNS(SVG, 'g');
		const skin = document.createElementNS(SVG, 'path');
		skin.setAttribute('d', WING);
		g.appendChild(skin);
		return g;
	};
	const left = wing();
	const mirror = document.createElementNS(SVG, 'g');
	mirror.setAttribute('transform', 'matrix(-1 0 0 1 48 0)');
	const right = wing();
	mirror.appendChild(right);
	const body = document.createElementNS(SVG, 'path');
	body.setAttribute('d', BODY);
	el.append(left, mirror, body);
	parent.appendChild(el);
	return { el, left, right };
}

/** the wings' angle above level at this point in the beat */
export const wingAngle = (phase: number) => (UP + DOWN) / 2 + ((UP - DOWN) / 2) * Math.cos(phase);

/** sets both wings to `angle` degrees above level */
export function spread(bat: BatShape, angle: number): void {
	const flap = `rotate(${angle.toFixed(1)} ${SHOULDER})`;
	bat.left.setAttribute('transform', flap);
	bat.right.setAttribute('transform', flap);
}

/**
 * Seen from the front a bat does not turn to its path, it banks: tipping into
 * a dive, leaning back out of a climb. Degrees, for a velocity in px/s.
 */
export function bankFor(vx: number, vy: number): number {
	const climb = (Math.atan(vy / Math.max(1, Math.abs(vx))) * 180) / Math.PI;
	return Math.max(-32, Math.min(32, climb)) * Math.sign(vx || 1);
}
