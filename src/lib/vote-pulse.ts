import type { Action } from 'svelte/action';

/** a quiet, directional pulse shared by the projector and participant tallies */
export const votePulse: Action<HTMLElement, number> = (node, value) => {
	const reduced = matchMedia('(prefers-reduced-motion: reduce)');
	let animation: Animation | undefined;
	const cancel = () => animation?.cancel();
	reduced.addEventListener('change', cancel);

	return {
		update(next) {
			if (next === value) return;
			const increased = next > value;
			value = next;
			cancel();
			if (reduced.matches) return;
			animation = node.animate([
				{ transform: 'scale(1)', color: 'inherit', opacity: 1 },
				{
					transform: increased ? 'translateY(-2px) scale(1.08)' : 'translateY(2px) scale(.96)',
					color: increased ? 'var(--accent)' : 'var(--dim)',
					opacity: increased ? 1 : .75,
					offset: .35
				},
				{ transform: 'scale(1)', color: 'inherit', opacity: 1 }
			], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' });
		},
		destroy() {
			cancel();
			reduced.removeEventListener('change', cancel);
		}
	};
};
