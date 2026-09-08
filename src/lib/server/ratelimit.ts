/**
 * A ceiling on how often one caller may do something, held in memory because the
 * only thing it guards is the demo and that process is restarted every hour; a
 * table would outlive the abuse it was written for.
 *
 * The caller is an address, which is only as good as what the proxy passes on:
 * without ADDRESS_HEADER set, adapter-node reports the socket peer and every
 * visitor behind Caddy shares one bucket. The demo service sets it for that
 * reason, and a shared bucket is the safe way to be wrong either way.
 */
export type Limiter = (caller: string, now: number) => boolean;

export function limiter(perWindow: number, windowMs = 60_000): Limiter {
	const seen = new Map<string, { count: number; until: number }>();

	return (caller, now) => {
		const bucket = seen.get(caller);
		if (!bucket || now >= bucket.until) {
			// the map only ever holds callers that asked inside the last window
			for (const [key, value] of seen) if (now >= value.until) seen.delete(key);
			seen.set(caller, { count: 1, until: now + windowMs });
			return false;
		}
		bucket.count++;
		return bucket.count > perWindow;
	};
}
