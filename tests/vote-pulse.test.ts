import { afterEach, expect, it, vi } from 'vitest';
import { votePulse } from '../src/lib/vote-pulse.js';

afterEach(() => vi.unstubAllGlobals());

it('only pulses changed counts, distinguishes losses, and cancels interrupted pulses', () => {
	const cancel = vi.fn();
	const animate = vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({ cancel }));
	const reduced = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
	vi.stubGlobal('matchMedia', () => reduced);
	const action = votePulse({ animate } as unknown as HTMLElement, 3)!;
	expect(animate).not.toHaveBeenCalled();
	action.update!(3);
	expect(animate).not.toHaveBeenCalled();
	action.update!(7);
	expect(animate.mock.calls[0]).toEqual([
		[
			{ transform: 'scale(1)', color: 'inherit', opacity: 1 },
			{ transform: 'translateY(-2px) scale(1.08)', color: 'var(--accent)', opacity: 1, offset: .35 },
			{ transform: 'scale(1)', color: 'inherit', opacity: 1 }
		],
		{ duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' }
	]);
	action.update!(2);
	expect(cancel).toHaveBeenCalledTimes(1);
	expect(animate.mock.calls[1][0][1]).toEqual({
		transform: 'translateY(2px) scale(.96)', color: 'var(--dim)', opacity: .75, offset: .35
	});
	action.destroy!();
	expect(cancel).toHaveBeenCalledTimes(2);
	expect(reduced.removeEventListener).toHaveBeenCalledWith('change', reduced.addEventListener.mock.calls[0][1]);
});

it('respects reduced motion and cancels when the preference changes', () => {
	const cancel = vi.fn();
	const animate = vi.fn(() => ({ cancel }));
	const reduced = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
	vi.stubGlobal('matchMedia', () => reduced);
	const action = votePulse({ animate } as unknown as HTMLElement, 4)!;
	action.update!(6);
	expect(animate).not.toHaveBeenCalled();
	reduced.matches = false;
	action.update!(6);
	expect(animate).not.toHaveBeenCalled();
	action.update!(5);
	expect(animate).toHaveBeenCalledTimes(1);
	reduced.matches = true;
	reduced.addEventListener.mock.calls[0][1]();
	expect(cancel).toHaveBeenCalledTimes(1);
	action.destroy!();
});
