import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { immediate } from '../src/lib/server/db.js';
import { generation } from '../src/lib/server/live.js';
import { watchLive } from '../src/lib/live-poll.js';
import { tick } from '../src/lib/server/scheduler.js';
import { freshDb } from './helpers.js';

describe('the generation', () => {
	it('moves once per committed write and not on a failed one', () => {
		const { db } = freshDb();
		const before = generation();
		immediate(db, () => db.prepare('UPDATE person SET name = name').run());
		const after = generation();
		expect(after).not.toBe(before);

		expect(() =>
			immediate(db, () => {
				db.prepare('UPDATE person SET name = name').run();
				throw new Error('rolled back');
			})
		).toThrow('rolled back');
		expect(generation()).toBe(after);
	});

	it('stays put when a committed transaction changed nothing', () => {
		const { db } = freshDb();
		const before = generation();
		immediate(db, () => db.prepare("UPDATE person SET name = 'x' WHERE id = 'nobody'").run());
		expect(generation()).toBe(before);
	});

	it('is not moved by a scheduler tick with nothing to do', () => {
		const { db } = freshDb();
		tick(new Date('2026-08-03T10:01:00Z'), db);
		const settled = generation();
		tick(new Date('2026-08-03T10:02:00Z'), db);
		expect(generation()).toBe(settled);
	});

	it('moves only when the outermost transaction commits', () => {
		const { db } = freshDb();
		const before = generation();
		let inside = '';
		immediate(db, () => {
			immediate(db, () => db.prepare('UPDATE person SET name = name').run());
			inside = generation();
		});
		expect(inside).toBe(before);
		expect(generation()).not.toBe(before);
	});
});

describe('the list poll', () => {
	const doc = { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };

	beforeEach(() => {
		vi.useRealTimers();
		vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
		vi.setSystemTime(new Date('2026-08-03T10:00:00Z'));
		doc.hidden = false;
		vi.stubGlobal('document', doc);
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('reloads only when the server has moved past the page', async () => {
		let server = 'a.1';
		let page = 'a.1';
		const refresh = vi.fn(async () => {
			page = server;
		});
		const stop = watchLive({
			read: async () => server,
			current: () => page,
			refresh,
			busy: () => false
		});
		await vi.advanceTimersByTimeAsync(3000);
		expect(refresh).not.toHaveBeenCalled();
		server = 'a.2';
		await vi.advanceTimersByTimeAsync(3000);
		expect(refresh).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(3000);
		expect(refresh).toHaveBeenCalledTimes(1);
		stop();
		server = 'a.3';
		await vi.advanceTimersByTimeAsync(9000);
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it('holds a change while the viewer is busy, then applies it', async () => {
		let busy = true;
		const refresh = vi.fn(async () => {});
		const stop = watchLive({
			read: async () => 'a.2',
			current: () => 'a.1',
			refresh,
			busy: () => busy
		});
		await vi.advanceTimersByTimeAsync(6000);
		expect(refresh).not.toHaveBeenCalled();
		busy = false;
		await vi.advanceTimersByTimeAsync(3000);
		expect(refresh).toHaveBeenCalledTimes(1);
		stop();
	});

	it('asks nothing while the tab is hidden', async () => {
		doc.hidden = true;
		const read = vi.fn(async () => 'a.1');
		const stop = watchLive({ read, current: () => 'a.1', refresh: async () => {}, busy: () => false });
		await vi.advanceTimersByTimeAsync(9000);
		expect(read).not.toHaveBeenCalled();
		stop();
	});
});
