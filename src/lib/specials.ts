/**
 * §3.6: special rounds. A round an admin gives over to one night with its own
 * picks, its own way of voting and its own look; the list sleeps through it.
 * Kept here rather than under server/ because the page needs the same numbers to
 * say what the round is, the way the rules screen reads the RuleSet.
 */
export type SpecialId = 'halloween';

export type Special = {
	id: SpecialId;
	/** how many films each person may put up for the round */
	picksPerPerson: number;
	/** how many of the most approved picks go to the room */
	shortlistSize: number;
};

export const SPECIALS: Record<SpecialId, Special> = {
	halloween: {
		id: 'halloween',
		picksPerPerson: 1,
		shortlistSize: 3
	}
};

export function isSpecialId(value: string | null | undefined): value is SpecialId {
	return value === 'halloween';
}

export function specialOf(value: string | null | undefined): Special | null {
	return isSpecialId(value) ? SPECIALS[value] : null;
}
