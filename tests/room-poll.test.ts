import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { pollRoom } from '../src/lib/room-poll.js';

const visibility = { hidden: false };

beforeEach(() => {
	// setup.ts already installed a Date-only clock; replace it with timer fakes
	vi.useRealTimers();
	vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
	vi.setSystemTime(new Date('2026-08-03T10:00:00Z'));
	visibility.hidden = false;
	vi.stubGlobal('document', visibility);
});

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

it('polls at 120 ms, skips pending requests, and stops on cleanup', async () => {
	let resolve!: () => void;
	const refresh = vi.fn(() => new Promise<void>((done) => (resolve = done)));
	const stop = pollRoom(refresh);
	vi.advanceTimersByTime(119);
	expect(refresh).not.toHaveBeenCalled();
	vi.advanceTimersByTime(1);
	expect(refresh).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(360);
	expect(refresh).toHaveBeenCalledTimes(1);
	resolve();
	await vi.advanceTimersByTimeAsync(120);
	expect(refresh).toHaveBeenCalledTimes(2);
	stop();
	resolve();
	await vi.advanceTimersByTimeAsync(240);
	expect(refresh).toHaveBeenCalledTimes(2);
});

it('pauses hidden screens and resumes when visible', async () => {
	const refresh = vi.fn(async () => {});
	pollRoom(refresh);
	visibility.hidden = true;
	await vi.advanceTimersByTimeAsync(360);
	expect(refresh).not.toHaveBeenCalled();
	visibility.hidden = false;
	await vi.advanceTimersByTimeAsync(120);
	expect(refresh).toHaveBeenCalledTimes(1);
});

it('retries after a failed refresh instead of staying pending', async () => {
	const error = new Error('offline');
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	const refresh = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
	pollRoom(refresh);
	await vi.advanceTimersByTimeAsync(240);
	expect(refresh).toHaveBeenCalledTimes(2);
	expect(log).toHaveBeenCalledWith('[room] refresh failed', error);
});
