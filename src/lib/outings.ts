/**
 * A film we watched together somewhere other than a film night, written down
 * afterwards: it is an evening (§2) and part of what we have watched, but the
 * voting had no say in it, so nothing that measures the game counts it. Kept
 * out of server/ because the admin form offers the same choices. An 'extra' is a
 * get-together at home: a film we chose among ourselves, with no vote to keep.
 */
export const OUTINGS = ['cinema', 'trip', 'extra'] as const;

export type Outing = (typeof OUTINGS)[number];

export function isOuting(value: string | null | undefined): value is Outing {
	return OUTINGS.includes(value as Outing);
}
