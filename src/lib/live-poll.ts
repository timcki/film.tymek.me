/**
 * The list's ear for everybody else. Every few seconds it asks the server which
 * generation of the world is current (/api/live) and compares it with the one
 * the page on screen was loaded at; only a difference costs a reload. Hidden
 * tabs ask nothing, and coming back to one asks at once.
 *
 * A change that lands while the viewer is in the middle of something (a vote
 * armed, a sheet or a popup open, their own vote on its way) is held rather
 * than dropped: the next tick after they are done applies it, so nothing ever
 * slides out from under a finger.
 */
export function watchLive(options: {
	read: () => Promise<string>;
	current: () => string | undefined;
	refresh: () => Promise<unknown>;
	busy: () => boolean;
	every?: number;
}): () => void {
	let pending = false;
	const tick = async () => {
		if (pending || document.hidden) return;
		pending = true;
		try {
			const latest = await options.read();
			if (latest !== options.current() && !options.busy()) await options.refresh();
		} catch (error) {
			console.error('[live] check failed', error);
		} finally {
			pending = false;
		}
	};
	const timer = setInterval(tick, options.every ?? 3000);
	const wake = () => {
		if (!document.hidden) void tick();
	};
	document.addEventListener('visibilitychange', wake);
	return () => {
		clearInterval(timer);
		document.removeEventListener('visibilitychange', wake);
	};
}
