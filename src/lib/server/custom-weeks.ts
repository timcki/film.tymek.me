import { RuleError } from './types.js';
import { SUCCESSOR, type Facts } from './tmdb.js';
import {
	ABOUT_MAX,
	CODED,
	GENRES,
	LANGUAGES,
	NAME_MAX,
	PICKS_MAX,
	REGIONS,
	meetsKnown,
	rulesOf,
	ruleToParams,
	type CodedId,
	type CustomWeek,
	type WeekRule,
	type WeekRules
} from '../custom-weeks.js';

/** what the admin's form sends, every field as typed */
export type CustomInput = {
	name: string;
	about: string;
	picks: string;
	countries: string[];
	languages: string[];
	genres: string[];
	yearFrom: string;
	yearTo: string;
	runtimeMin: string;
	runtimeMax: string;
	directors: string;
	coded: string[];
};

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/** a number field left empty is no limit; anything else has to be a whole number in range */
function bound(raw: string, min: number, max: number, code: string): number | undefined {
	if (!raw.trim()) return undefined;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < min || n > max) throw new RuleError(code, `${raw} is not a whole number from ${min} to ${max}`);
	return n;
}

/** §3.7: the admin's form, read strictly; menus only ever yield values they offered */
export function cleanCustom(input: CustomInput): CustomWeek {
	const name = squash(input.name);
	if (name.length > NAME_MAX) {
		throw new RuleError('custom_name_long', `a name is at most ${NAME_MAX} characters`, { max: NAME_MAX });
	}
	const about = squash(input.about);
	if (about.length > ABOUT_MAX) {
		throw new RuleError('custom_about_long', `a description is at most ${ABOUT_MAX} characters`, {
			max: ABOUT_MAX
		});
	}
	const picks = Number(input.picks);
	if (!Number.isInteger(picks) || picks < 1 || picks > PICKS_MAX) {
		throw new RuleError('custom_picks', `1 to ${PICKS_MAX} picks each`, { max: PICKS_MAX });
	}

	const yearFrom = bound(input.yearFrom, 1870, 2100, 'custom_years');
	const yearTo = bound(input.yearTo, 1870, 2100, 'custom_years');
	if (yearFrom && yearTo && yearFrom > yearTo) {
		throw new RuleError('custom_years', 'the years run backwards');
	}
	const runtimeMin = bound(input.runtimeMin, 1, 1000, 'custom_runtime');
	const runtimeMax = bound(input.runtimeMax, 1, 1000, 'custom_runtime');
	if (runtimeMin && runtimeMax && runtimeMin > runtimeMax) {
		throw new RuleError('custom_runtime', 'the shortest is longer than the longest');
	}

	const offered = <T extends string | number>(list: readonly T[], values: T[]) =>
		[...new Set(values)].filter((v) => list.includes(v));
	const rules: WeekRules = {
		countries: offered(REGIONS, input.countries),
		languages: offered(LANGUAGES as readonly string[], input.languages),
		genres: offered(GENRES as readonly number[], input.genres.map(Number)),
		yearFrom,
		yearTo,
		runtimeMin,
		runtimeMax,
		directors: input.directors
			.split(',')
			.map(squash)
			.filter(Boolean)
			.map((d) => d.slice(0, 60))
			.slice(0, 5),
		coded: offered(CODED as readonly string[], input.coded) as CodedId[]
	};
	return { name: name || null, about: about || null, picks, rules };
}

/** the rules written by hand; TMDB's gender 1 is a woman */
const CODED_CHECKS: Record<CodedId, (facts: Facts) => boolean> = {
	woman_director: (facts) => facts.directors.some((d) => d.gender === 1)
};

/** Kieślowski, kieslowski and Krzysztof Kieślowski are the same director */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** a fact TMDB did not give is a rule not met */
function meets(rule: WeekRule, facts: Facts): boolean {
	switch (rule.kind) {
		case 'countries':
			return facts.countries.some((c) => rule.codes.includes(SUCCESSOR[c] ?? c));
		case 'languages':
		case 'genres':
		case 'years':
		case 'runtime':
			return meetsKnown(rule, facts) === true;
		case 'directors':
			return facts.directors.some((d) => rule.names.some((name) => fold(d.name).includes(fold(name))));
		case 'coded':
			return CODED_CHECKS[rule.id](facts);
		case 'tmdb':
			return true;
	}
}

/** the first rule a pick breaks, or null; a week with rules needs TMDB to know the film */
export function breachOf(custom: CustomWeek | null, facts: Facts | null): WeekRule | null {
	const rules = custom ? rulesOf(custom.rules) : [];
	if (!rules.length) return null;
	if (!facts) return { kind: 'tmdb' };
	return rules.find((rule) => !meets(rule, facts)) ?? null;
}

export function assertFits(custom: CustomWeek | null, facts: Facts | null): void {
	const rule = breachOf(custom, facts);
	if (rule) {
		throw new RuleError('off_theme', `that film does not fit this week (${rule.kind})`, ruleToParams(rule));
	}
}
