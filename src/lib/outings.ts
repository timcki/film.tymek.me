/**
 * A film we watched together somewhere other than a film night, written down
 * afterwards: it is an evening (§2) and part of what we have watched, but the
 * voting had no say in it, so nothing that measures the game counts it. Kept
 * out of server/ because the admin form offers the same choices. A night at
 * home written down afterwards is not one: it is a film night on its own date.
 */
export const OUTINGS = ['cinema', 'trip'] as const;

export type Outing = (typeof OUTINGS)[number];

export function isOuting(value: string | null | undefined): value is Outing {
	return OUTINGS.includes(value as Outing);
}
