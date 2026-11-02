/**
 * §3.7: a custom week is a special round an admin names and gives rules to. Kept
 * out of server/ because the page says the rules from the same values the
 * server enforces, the way the rules screen reads the RuleSet.
 */

/** TMDB's movie genre ids; the names are said in the reader's language in i18n.ts */
export const GENRES = [
	28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 53, 10752, 37
] as const;

/** original languages worth offering, as TMDB writes them (ISO 639-1) */
export const LANGUAGES = [
	'pl', 'en', 'fr', 'de', 'it', 'es', 'pt', 'ru', 'uk', 'cs', 'sk', 'hu', 'ro', 'bg', 'sr',
	'hr', 'sl', 'el', 'tr', 'sv', 'da', 'no', 'fi', 'is', 'nl', 'et', 'lt', 'lv', 'ka', 'he',
	'ar', 'fa', 'hi', 'th', 'zh', 'ja', 'ko'
] as const;

/** ISO 3166-1 alpha-2, the codes TMDB files production countries under */
export const REGIONS = (
	'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO ' +
	'BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ ' +
	'DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP ' +
	'GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG ' +
	'KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML ' +
	'MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE ' +
	'PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL ' +
	'SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM ' +
	'US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');

/**
 * Rules no form field can express, written by hand in server/custom-weeks.ts and
 * offered to the admin as a tick box each.
 */
export const CODED = ['woman_director'] as const;
export type CodedId = (typeof CODED)[number];

export const NAME_MAX = 40;
export const ABOUT_MAX = 200;
export const PICKS_MAX = 10;

/** every field optional; a film has to meet all that are set, and any one value of each */
export type WeekRules = {
	countries?: string[];
	languages?: string[];
	genres?: number[];
	yearFrom?: number;
	yearTo?: number;
	runtimeMin?: number;
	runtimeMax?: number;
	directors?: string[];
	coded?: CodedId[];
};

export type CustomWeek = {
	/** null is the round's usual name, said in each reader's language */
	name: string | null;
	about: string | null;
	picks: number;
	rules: WeekRules;
};

/** one rule, as the page says it and as a refusal names it */
export type WeekRule =
	| { kind: 'countries'; codes: string[] }
	| { kind: 'languages'; codes: string[] }
	| { kind: 'genres'; ids: number[] }
	| { kind: 'years'; from: number | null; to: number | null }
	| { kind: 'runtime'; min: number | null; max: number | null }
	| { kind: 'directors'; names: string[] }
	| { kind: 'coded'; id: CodedId }
	| { kind: 'tmdb' };

/** week.custom as stored; anything unreadable is no custom week at all */
export function customOf(value: string | null | undefined): CustomWeek | null {
	if (!value) return null;
	try {
		const parsed = JSON.parse(value) as CustomWeek;
		return parsed && typeof parsed === 'object' && parsed.rules ? parsed : null;
	} catch {
		return null;
	}
}

/** the rules that are actually set, in the order the page lists them */
export function rulesOf(rules: WeekRules): WeekRule[] {
	const out: WeekRule[] = [];
	if (rules.countries?.length) out.push({ kind: 'countries', codes: rules.countries });
	if (rules.languages?.length) out.push({ kind: 'languages', codes: rules.languages });
	if (rules.genres?.length) out.push({ kind: 'genres', ids: rules.genres });
	if (rules.yearFrom != null || rules.yearTo != null) {
		out.push({ kind: 'years', from: rules.yearFrom ?? null, to: rules.yearTo ?? null });
	}
	if (rules.runtimeMin != null || rules.runtimeMax != null) {
		out.push({ kind: 'runtime', min: rules.runtimeMin ?? null, max: rules.runtimeMax ?? null });
	}
	if (rules.directors?.length) out.push({ kind: 'directors', names: rules.directors });
	for (const id of rules.coded ?? []) out.push({ kind: 'coded', id });
	return out;
}

/** what is known about a film so far; a search result knows less than TMDB's details */
export type KnownFacts = {
	year?: number | null;
	runtime?: number | null;
	language?: string | null;
	genres?: number[] | null;
};

/**
 * The rules that need nothing beyond these facts, checked the same way on the page
 * and on the server; null when the fact a rule needs is not known yet.
 */
export function meetsKnown(rule: WeekRule, facts: KnownFacts): boolean | null {
	const within = (n: number | null | undefined, min: number | null, max: number | null) =>
		n == null ? null : (min == null || n >= min) && (max == null || n <= max);
	switch (rule.kind) {
		case 'languages':
			return facts.language == null ? null : rule.codes.includes(facts.language);
		case 'genres':
			return facts.genres == null ? null : facts.genres.some((id) => rule.ids.includes(id));
		case 'years':
			return within(facts.year, rule.from, rule.to);
		case 'runtime':
			return within(facts.runtime, rule.min, rule.max);
		default:
			return null;
	}
}

/** the first rule a film is already known to break, before anyone has picked it */
export function knownBreach(custom: CustomWeek | null | undefined, facts: KnownFacts): WeekRule | null {
	if (!custom) return null;
	return rulesOf(custom.rules).find((rule) => meetsKnown(rule, facts) === false) ?? null;
}

/**
 * A refusal travels as a code plus flat parameters (invariant 6), so the rule it
 * names is folded into strings on the server and unfolded here, at the edge.
 */
export function ruleToParams(rule: WeekRule): Record<string, string | number> {
	switch (rule.kind) {
		case 'countries':
		case 'languages':
			return { kind: rule.kind, values: rule.codes.join(',') };
		case 'genres':
			return { kind: rule.kind, values: rule.ids.join(',') };
		case 'directors':
			return { kind: rule.kind, values: rule.names.join('|') };
		case 'years':
			return { kind: rule.kind, from: rule.from ?? '', to: rule.to ?? '' };
		case 'runtime':
			return { kind: rule.kind, min: rule.min ?? '', max: rule.max ?? '' };
		case 'coded':
			return { kind: rule.kind, id: rule.id };
		case 'tmdb':
			return { kind: rule.kind };
	}
}

export function ruleFromParams(p: Record<string, string | number>): WeekRule | null {
	const list = (sep: string) => String(p.values ?? '').split(sep).filter(Boolean);
	const num = (v: string | number | undefined) => (v === '' || v == null ? null : Number(v));
	switch (p.kind) {
		case 'countries':
		case 'languages':
			return { kind: p.kind, codes: list(',') };
		case 'genres':
			return { kind: 'genres', ids: list(',').map(Number) };
		case 'directors':
			return { kind: 'directors', names: list('|') };
		case 'years':
			return { kind: 'years', from: num(p.from), to: num(p.to) };
		case 'runtime':
			return { kind: 'runtime', min: num(p.min), max: num(p.max) };
		case 'coded':
			return (CODED as readonly string[]).includes(String(p.id))
				? { kind: 'coded', id: p.id as CodedId }
				: null;
		case 'tmdb':
			return { kind: 'tmdb' };
		default:
			return null;
	}
}
