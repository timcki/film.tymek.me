import { describe, expect, it } from 'vitest';
import { DICT, dictFor, isVotes, langOf, LANGS, type Dict, type RulesView } from '../src/lib/i18n.js';
import { RULE_SETS } from '../src/lib/server/rules.js';

const view = (id: keyof typeof RULE_SETS): RulesView => RULE_SETS[id];

describe('language selection', () => {
	it('falls back to Polish for anything it does not recognise', () => {
		expect(langOf(undefined)).toBe('pl');
		expect(langOf('de')).toBe('pl');
		expect(langOf('en')).toBe('en');
		expect(dictFor(null).lang).toBe('pl');
	});

	it('defines every key in both languages', () => {
		const keys = (d: Dict) => Object.keys(d).sort();
		expect(keys(DICT.pl)).toEqual(keys(DICT.en));
	});
});

describe('Polish plurals', () => {
	it('picks the right one of the three forms', () => {
		const T = DICT.pl;
		expect(T.warnFades(1)).toBe('znika za 1 tydzień');
		expect(T.warnFades(3)).toBe('znika za 3 tygodnie');
		expect(T.warnFades(8)).toBe('znika za 8 tygodni');
		// 12 to 14 take the last form despite ending in 2 to 4
		expect(T.warnFades(12)).toBe('znika za 12 tygodni');
		expect(T.warnFades(22)).toBe('znika za 22 tygodnie');
	});
});

/** the rules screen has to describe the rules that are actually running */
describe('the rules text follows the active rule set', () => {
	it('quotes the real bank cap, not the one the spec assumed', () => {
		const text = DICT.pl.rules(view('banked')).map((r) => `${r.head} ${r.body}`).join(' ');
		expect(text).toContain('do 6');
		expect(text).not.toContain('do 12');
	});

	it('quotes the real shortlist size', () => {
		for (const T of LANGS.map((l) => DICT[l])) {
			const text = T.rules(view('banked')).map((r) => `${r.head} ${r.body}`).join(' ');
			expect(text).toContain('3');
		}
	});

	it('describes banking only when the rule set banks', () => {
		const banked = DICT.pl.rules(view('banked')).map((r) => r.head).join(' ');
		const rolling = DICT.pl.rules(view('rolling')).map((r) => r.head).join(' ');
		expect(banked).toContain('kumulują');
		expect(rolling).not.toContain('kumulują');
		expect(rolling).toContain('5 punktów tygodniowo');
	});

	it('switches attrition wording between archiving and dropping', () => {
		expect(DICT.pl.rules(view('ledger')).some((r) => r.head.includes('archiwum'))).toBe(true);
		expect(DICT.pl.rules(view('banked')).some((r) => r.head.includes('wypada'))).toBe(true);
		expect(DICT.en.rules(view('ledger')).some((r) => r.head.includes('archived'))).toBe(true);
	});

	it('calls a single unbanked point a vote, and anything else points', () => {
		expect(isVotes(view('ledger'))).toBe(true);
		expect(isVotes(view('banked'))).toBe(false);
		expect(isVotes(view('rolling'))).toBe(false);
		expect(DICT.pl.budgetPill(1, 1, true)).toBe('1/1 głos');
		expect(DICT.pl.budgetPill(4, 6, false)).toBe('4/6 pkt');
	});
});

describe('the spend bar on a film nobody has backed', () => {
	it('agrees the verb and the noun with what is left', () => {
		const T = DICT.pl;
		expect(T.dNone(1, false)).toBe('Nie głosowałeś jeszcze na ten film, został ci 1 punkt');
		expect(T.dNone(2, false)).toBe('Nie głosowałeś jeszcze na ten film, zostały ci 2 punkty');
		expect(T.dNone(6, false)).toBe('Nie głosowałeś jeszcze na ten film, zostało ci 6 punktów');
		expect(T.dNone(0, false)).toBe('Nie głosowałeś jeszcze na ten film, zostało ci 0 punktów');
	});

	it('counts votes rather than points when that is the currency', () => {
		expect(DICT.pl.dNone(1, true)).toContain('1 głos');
		expect(DICT.pl.dNone(3, true)).toContain('3 głosy');
		expect(DICT.en.dNone(1, true)).toContain('1 vote left');
		expect(DICT.en.dNone(2, false)).toContain('2 points left');
	});
});

describe('the budget explainer', () => {
	it('quotes the weekly grant and the cap it is capped at', () => {
		const help = DICT.pl.budgetHelp(view('banked'));
		expect(help).toContain('2 punkty');
		expect(help).toContain('6');
	});

	it('says points expire when they do not bank', () => {
		expect(DICT.pl.budgetHelp(view('rolling'))).toContain('przepadają');
	});
});

describe('rule violations', () => {
	it('says the common ones in Polish, with their numbers filled in', () => {
		expect(DICT.pl.error('not_enough_points', { left: 1, allowance: 6, points: 3 }, 'x')).toBe(
			'Zostało ci 1 z 6, więc 3 to za dużo.'
		);
		expect(DICT.pl.error('already_nominated', {}, 'x')).toContain('zgłoszenie');
	});

	it('falls back to the English message for a code it does not know', () => {
		expect(DICT.pl.error('something_new', {}, 'the raw message')).toBe('the raw message');
	});
});
