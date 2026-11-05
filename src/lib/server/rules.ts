export type RuleSetId = 'ledger' | 'rolling' | 'banked' | 'weekly';

export type Attrition =
	| { kind: 'archive'; afterWeeksAtZero: number }
	| { kind: 'drop'; afterWeeksWithoutPoints: number };

export type RuleSet = {
	id: RuleSetId;
	label: string;
	/** points granted to each person at the start of each week */
	pointsPerWeek: number;
	/** if true, unspent points carry over into the next week */
	banking: boolean;
	/** maximum bank balance; ignored when banking is false */
	bankCap: number;
	/** how a film's score is computed */
	scoring: 'total' | 'decay' | 'fade';
	/**
	 * 'decay': weight of last week's points in the two-week window.
	 * 'fade': weekly multiplier applied to every past week's points, so a point
	 * cast n weeks ago is worth decayFactor^n. Unused under 'total'.
	 */
	decayFactor: number;
	/** what happens to films nobody is voting for */
	attrition: Attrition;
	nominationsPerWeek: number;
	/**
	 * How many films go to the room on Thursday. Points decide which films are
	 * candidates; the people who turned up decide which one gets watched. The
	 * shortlist is the strict top N of the §3.2 ordering, which is total, so a
	 * film never loses a slot to a coin flip.
	 */
	shortlistSize: number;
	/**
	 * §8.3: a cast vote is final. For this many seconds after a raise it can
	 * still be unwound (double-taps on a phone are common); then it stands.
	 * This governs the weekly ballot only; a flash vote in the room (§7.2) can
	 * be moved freely until the runoff closes.
	 */
	voteGraceSeconds: number;
};

export const RULE_SETS: Record<RuleSetId, RuleSet> = {
	ledger: {
		id: 'ledger',
		label: 'Ledger',
		pointsPerWeek: 1,
		banking: false,
		bankCap: 0,
		scoring: 'total',
		decayFactor: 0,
		attrition: { kind: 'archive', afterWeeksAtZero: 8 },
		nominationsPerWeek: 1,
		shortlistSize: 3,
		voteGraceSeconds: 30
	},
	rolling: {
		id: 'rolling',
		label: 'Rolling',
		pointsPerWeek: 5,
		banking: false,
		bankCap: 0,
		scoring: 'decay',
		decayFactor: 0.5,
		attrition: { kind: 'drop', afterWeeksWithoutPoints: 1 },
		nominationsPerWeek: 1,
		shortlistSize: 3,
		voteGraceSeconds: 30
	},
	banked: {
		id: 'banked',
		label: 'Banked',
		pointsPerWeek: 2,
		banking: true,
		bankCap: 6,
		scoring: 'total',
		decayFactor: 0,
		attrition: { kind: 'drop', afterWeeksWithoutPoints: 2 },
		nominationsPerWeek: 1,
		shortlistSize: 3,
		voteGraceSeconds: 30
	},
	weekly: {
		id: 'weekly',
		label: 'Weekly',
		pointsPerWeek: 3,
		banking: false,
		bankCap: 0,
		scoring: 'fade',
		// a vote halves every week: last week matters, a month ago is dust
		decayFactor: 0.5,
		attrition: { kind: 'drop', afterWeeksWithoutPoints: 2 },
		nominationsPerWeek: 1,
		shortlistSize: 3,
		voteGraceSeconds: 30
	}
};

export function isRuleSetId(value: string | undefined): value is RuleSetId {
	return value === 'ledger' || value === 'rolling' || value === 'banked' || value === 'weekly';
}

export function ruleSetFromEnv(value: string | undefined): RuleSet {
	return RULE_SETS[isRuleSetId(value) ? value : 'weekly'];
}

/**
 * points[weekNumber] -> integer, for a single film
 * currentWeek is the week being scored (usually the open one)
 */
export function score(rules: RuleSet, points: Map<number, number>, currentWeek: number): number {
	if (rules.scoring === 'total') {
		let sum = 0;
		for (const p of points.values()) sum += p;
		return sum;
	}
	if (rules.scoring === 'fade') {
		// every past week contributes, geometrically discounted by age, so the
		// score stays recomputable from the ballot table alone and nothing needs
		// a stored running value
		let sum = 0;
		for (const [week, p] of points) {
			if (week > currentWeek) continue;
			sum += p * rules.decayFactor ** (currentWeek - week);
		}
		return sum;
	}
	// 'decay' is deliberately a two-week window, not a recursive EMA, so it can
	// always be recomputed from the ballot table alone
	return (points.get(currentWeek) ?? 0) + rules.decayFactor * (points.get(currentWeek - 1) ?? 0);
}

export function budget(rules: RuleSet, bankBalance: number): number {
	return rules.banking ? bankBalance : rules.pointsPerWeek;
}

/** start-of-week balance for the next week, per §3.3 */
export function accrue(rules: RuleSet, balance: number, spentThisWeek: number): number {
	return Math.min(rules.bankCap, balance - spentThisWeek + rules.pointsPerWeek);
}

export type Orderable = {
	id: number;
	score: number;
	added_week: number;
	created_at: string;
};

/**
 * §3.2 ordering: score desc, added_week asc, created_at asc, id asc.
 * Total and deterministic; there is never a coin flip.
 */
export function compareFilms(a: Orderable, b: Orderable): number {
	if (a.score !== b.score) return b.score - a.score;
	if (a.added_week !== b.added_week) return a.added_week - b.added_week;
	if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
	return a.id - b.id;
}

export function orderFilms<T extends Orderable>(films: T[]): T[] {
	return [...films].sort(compareFilms);
}

export { titleKey } from '../titles.js';
