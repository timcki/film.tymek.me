/**
 * The motion of a point being spent, which is the one thing everybody does here
 * every week: a point leaves the bar, where what you have left is kept, arcs
 * over the page into the film it was given to, and lands with a ripple and a
 * scatter of sparks. Taking it back flies it home the same way. Drawn in loose
 * elements on the body, in front of everything, and gone once they have played;
 * asked for less motion, none of it happens and the vote simply lands.
 */

const still = () =>
	typeof matchMedia === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches;

function centre(el: Element) {
	const r = el.getBoundingClientRect();
	return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function layer(className: string): HTMLElement {
	const el = document.createElement('span');
	el.className = className;
	el.setAttribute('aria-hidden', 'true');
	document.body.append(el);
	return el;
}

/** the next point to spend, or the last one spent, in the bar's pips */
export function barPip(which: 'free' | 'spent'): Element | null {
	const pips = document.querySelectorAll(`header.lean .hpip.${which}`);
	return which === 'free' ? (pips[0] ?? null) : (pips[pips.length - 1] ?? null);
}

/**
 * A point in flight from one element to another, along a low arc. Resolves when
 * it lands, or straight away when there is nothing to fly or no motion wanted.
 */
export function fly(from: Element | null, to: Element | null): Promise<void> {
	if (!from || !to || still()) return Promise.resolve();
	const a = centre(from);
	const b = centre(to);
	// the arc's apex: over the higher of the two ends, more so the further it goes
	const lift = Math.min(120, 40 + Math.abs(b.x - a.x) * 0.25 + Math.abs(b.y - a.y) * 0.1);
	const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift };
	const dot = layer('vfx-dot');
	// with bananas on, the point in flight is the app's own drawn banana, the
	// one the bar and the cards wear, never the phone's emoji
	if (document.documentElement.dataset.banana !== undefined) {
		const banana = (from.querySelector('svg.banana') ?? document.querySelector('svg.banana'))?.cloneNode(true);
		if (banana) {
			dot.classList.add('nana');
			// the same size it was where it hung, so it is that banana leaving
			dot.style.fontSize = `${Math.max(12, from.getBoundingClientRect().height)}px`;
			dot.append(banana);
		}
	}
	const frames: Keyframe[] = [];
	const steps = 14;
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const x = (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x;
		const y = (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y;
		// swells as it leaves, settles to its landing size
		const s = 1 + 0.55 * Math.sin(Math.PI * t) - 0.2 * t;
		frames.push({ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})` });
	}
	const distance = Math.hypot(b.x - a.x, b.y - a.y);
	const run = dot.animate(frames, {
		duration: Math.min(620, 340 + distance * 0.35),
		easing: 'cubic-bezier(.45,.05,.35,1)',
		fill: 'forwards'
	});
	return run.finished.then(
		() => dot.remove(),
		() => dot.remove()
	);
}

/** the landing: a ring going out from the button, and a few sparks with it */
export function burst(at: Element | null) {
	if (!at || still()) return;
	const { x, y } = centre(at);
	const r = at.getBoundingClientRect();
	const ring = layer('vfx-ring');
	ring.style.width = ring.style.height = `${Math.max(r.width, r.height)}px`;
	ring
		.animate(
			[
				{ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(.55)`, opacity: 0.9 },
				{ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(1.9)`, opacity: 0 }
			],
			{ duration: 520, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }
		)
		.finished.then(
			() => ring.remove(),
			() => ring.remove()
		);
	const sparks = 9;
	for (let i = 0; i < sparks; i++) {
		const angle = (i / sparks) * Math.PI * 2 + Math.random() * 0.5;
		const reach = r.width / 2 + 14 + Math.random() * 16;
		const spark = layer('vfx-spark');
		spark
			.animate(
				[
					{ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(1)`, opacity: 1 },
					{
						transform: `translate(${x + Math.cos(angle) * reach}px, ${y + Math.sin(angle) * reach}px) translate(-50%, -50%) scale(.2)`,
						opacity: 0
					}
				],
				{ duration: 460 + Math.random() * 160, easing: 'cubic-bezier(.15,.75,.3,1)', fill: 'forwards' }
			)
			.finished.then(
				() => spark.remove(),
				() => spark.remove()
			);
	}
}

/** a little give where the point lands, as if it had weight */
export function thump(el: Element | null) {
	if (!el || still()) return;
	el.animate(
		[{ transform: 'scale(1)' }, { transform: 'scale(1.12)', offset: 0.3 }, { transform: 'scale(1)' }],
		{ duration: 380, easing: 'cubic-bezier(.3,1.6,.5,1)' }
	);
}
