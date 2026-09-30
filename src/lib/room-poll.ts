/** refresh only visible room screens, without piling up slow requests */
export function pollRoom(refresh: () => Promise<void>): () => void {
	let pending = false;
	const timer = setInterval(async () => {
		if (pending || document.hidden) return;
		pending = true;
		try {
			await refresh();
		} catch (error) {
			console.error('[room] refresh failed', error);
		} finally {
			pending = false;
		}
	}, 120);
	return () => clearInterval(timer);
}
