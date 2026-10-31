/**
 * §3.6: special rounds. A round an admin gives over to one night with its own
 * picks and its own way of voting; the list sleeps through it. What the site
 * looks like is a separate choice (themes.ts). Kept here rather than under
 * server/ because the page needs the same numbers to say what the round is, the
 * way the rules screen reads the RuleSet.
 */
export type SpecialId = 'approval';

export type Special = {
	id: SpecialId;
	/** how many films each person may put up for the round */
	picksPerPerson: number;
	/** how many of the most approved picks go to the room */
	shortlistSize: number;
};

export const SPECIALS: Record<SpecialId, Special> = {
	approval: {
		id: 'approval',
		picksPerPerson: 1,
		shortlistSize: 3
	}
};

export function isSpecialId(value: string | null | undefined): value is SpecialId {
	return value === 'approval';
}

/**
 * The rules a stored round runs by. The first special round was written down as
 * 'halloween', back when the way of voting and the look were one thing; its
 * films and its week still say so, and it voted the approval way.
 */
export function specialOf(value: string | null | undefined): Special | null {
	if (value === 'halloween') return SPECIALS.approval;
	return isSpecialId(value) ? SPECIALS[value] : null;
}
