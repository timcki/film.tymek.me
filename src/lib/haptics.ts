/**
 * A tap you can feel. Android has navigator.vibrate; iPhone Safari has no API at
 * all, but since iOS 18 it plays the system tick when a switch-style checkbox is
 * toggled, so a hidden one is toggled instead. Either is a no-op where neither
 * exists, and iOS honours it only inside the gesture that caused it, so call
 * this from the tap's own handler rather than after an await.
 */

let toggle: HTMLLabelElement | null = null;

function iosTick() {
	if (!toggle) {
		toggle = document.createElement('label');
		toggle.setAttribute('aria-hidden', 'true');
		toggle.style.display = 'none';
		const input = document.createElement('input');
		input.type = 'checkbox';
		input.setAttribute('switch', '');
		input.tabIndex = -1;
		toggle.append(input);
		document.body.append(toggle);
	}
	toggle.click();
}

/** a light tick for a tap, a fuller knock for a point landing */
export function haptic(kind: 'tick' | 'knock' = 'tick') {
	if (typeof navigator === 'undefined') return;
	if (typeof navigator.vibrate === 'function' && navigator.vibrate(kind === 'tick' ? 8 : [12, 50, 22])) {
		return;
	}
	iosTick();
}
