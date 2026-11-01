import { describe, expect, it } from 'vitest';
import { currentWeek } from '../src/lib/server/weeks.js';
import {
	editSpecial,
	nominateSpecial,
	picksAllowed,
	picksUsed,
	startSpecial,
	stopSpecial
} from '../src/lib/server/specials.js';
import { breachOf, cleanCustom, type CustomInput } from '../src/lib/server/custom-weeks.js';
import type { Facts } from '../src/lib/server/tmdb.js';
import {
	customOf,
	knownBreach,
	ruleFromParams,
	ruleToParams,
	rulesOf,
	type CustomWeek,
	type WeekRule,
	type WeekRules
} from '../src/lib/custom-weeks.js';
import { dictFor } from '../src/lib/i18n.js';
import { freshDb } from './helpers.js';

const blank: CustomInput = {
	name: '',
	about: '',
	picks: '1',
	countries: [],
	languages: [],
	genres: [],
	yearFrom: '',
	yearTo: '',
	runtimeMin: '',
	runtimeMax: '',
	directors: '',
	coded: []
};

const ida: Facts = {
	year: 2013,
	runtime: 82,
	countries: ['PL', 'DK'],
	language: 'pl',
	genres: [18],
	directors: [{ name: 'Paweł Pawlikowski', gender: 2 }]
};

const week = (rules: WeekRules): CustomWeek => ({ name: 'Tydzień polski', about: null, picks: 1, rules });

/** §3.7: a special round an admin names and gives rules to, checked against TMDB at pick time */
describe('a custom week', () => {
	describe('reads the admin form strictly', () => {
		it('leaves everything optional, so an empty form is a plain special night', () => {
			expect(cleanCustom(blank)).toEqual({
				name: null,
				about: null,
				picks: 1,
				rules: {
					countries: [],
					languages: [],
					genres: [],
					yearFrom: undefined,
					yearTo: undefined,
					runtimeMin: undefined,
					runtimeMax: undefined,
					directors: [],
					coded: []
				}
			});
			expect(rulesOf(cleanCustom(blank).rules)).toEqual([]);
		});

		it('keeps only what the menus offered, and squashes what was typed', () => {
			const custom = cleanCustom({
				...blank,
				name: '  Tydzień   polski ',
				countries: ['PL', 'PL', 'XX'],
				languages: ['pl', 'klingon'],
				genres: ['18', '99999'],
				directors: ' Kieślowski ,, Holland, a, b, c, d',
				coded: ['woman_director', 'tall_director']
			});
			expect(custom.name).toBe('Tydzień polski');
			expect(custom.rules.countries).toEqual(['PL']);
			expect(custom.rules.languages).toEqual(['pl']);
			expect(custom.rules.genres).toEqual([18]);
			expect(custom.rules.directors).toEqual(['Kieślowski', 'Holland', 'a', 'b', 'c']);
			expect(custom.rules.coded).toEqual(['woman_director']);
		});

		it.each([
			[{ name: 'x'.repeat(41) }, 'custom_name_long'],
			[{ about: 'x'.repeat(201) }, 'custom_about_long'],
			[{ picks: '0' }, 'custom_picks'],
			[{ picks: '4' }, 'custom_picks'],
			[{ yearFrom: '1500' }, 'custom_years'],
			[{ yearFrom: '2000', yearTo: '1990' }, 'custom_years'],
			[{ runtimeMax: '1.5' }, 'custom_runtime'],
			[{ runtimeMin: '120', runtimeMax: '90' }, 'custom_runtime']
		])('refuses %o with %s', (fields, code) => {
			expect(() => cleanCustom({ ...blank, ...fields })).toThrow(expect.objectContaining({ code }));
		});
	});

	describe('holds a pick to every rule that is set', () => {
		it.each<[WeekRules, WeekRule['kind'] | null]>([
			[{ countries: ['PL'] }, null],
			[{ countries: ['FR', 'DK'] }, null],
			[{ countries: ['FR'] }, 'countries'],
			[{ languages: ['pl'] }, null],
			[{ languages: ['cs'] }, 'languages'],
			[{ genres: [27, 18] }, null],
			[{ genres: [27] }, 'genres'],
			[{ yearFrom: 2010 }, null],
			[{ yearFrom: 1990, yearTo: 2000 }, 'years'],
			[{ runtimeMax: 90 }, null],
			[{ runtimeMin: 90 }, 'runtime'],
			[{ directors: ['pawlikowski'] }, null],
			[{ directors: ['Kieślowski'] }, 'directors'],
			[{ coded: ['woman_director'] }, 'coded'],
			[{ countries: ['PL'], genres: [27] }, 'genres']
		])('%o: breaks %s', (rules, broken) => {
			expect(breachOf(week(rules), ida)?.kind ?? null).toBe(broken);
		});

		it('counts a film made in a country that has since split as made in its successor', () => {
			const old = { ...ida, countries: ['XC'] };
			expect(breachOf(week({ countries: ['CZ'] }), old)).toBeNull();
		});

		it('folds diacritics and case out of director names', () => {
			const dekalog = { ...ida, directors: [{ name: 'Krzysztof Kieślowski', gender: 2 }] };
			expect(breachOf(week({ directors: ['KIESLOWSKI'] }), dekalog)).toBeNull();
			const ida2 = { ...ida, directors: [{ name: 'Paweł Pawlikowski', gender: 2 }] };
			expect(breachOf(week({ directors: ['Pawel'] }), ida2)).toBeNull();
		});

		it('matches whole names, in any order, not letters inside one', () => {
			const europa = { ...ida, directors: [{ name: 'Agnieszka Holland', gender: 1 }] };
			expect(breachOf(week({ directors: ['Holland, Agnieszka'] }), europa)).toBeNull();
			expect(breachOf(week({ directors: ['Holl'] }), europa)).toEqual(
				expect.objectContaining({ kind: 'directors' })
			);
			const kathleen = { ...ida, directors: [{ name: 'Kathleen Collins', gender: 1 }] };
			expect(breachOf(week({ directors: ['Lee'] }), kathleen)).toEqual(
				expect.objectContaining({ kind: 'directors' })
			);
		});

		it('knows a woman directed it from TMDB', () => {
			const europa = { ...ida, directors: [{ name: 'Agnieszka Holland', gender: 1 }] };
			expect(breachOf(week({ coded: ['woman_director'] }), europa)).toBeNull();
		});

		it('needs TMDB to know the film once there are rules, and not before', () => {
			expect(breachOf(week({ countries: ['PL'] }), null)).toEqual({ kind: 'tmdb' });
			expect(breachOf(week({}), null)).toBeNull();
			expect(breachOf(null, null)).toBeNull();
		});
	});

	it('greys out a search result only for what the search already says', () => {
		const polish = week({ languages: ['pl'], countries: ['PL'] });
		expect(knownBreach(polish, { year: 2001, language: 'fr', genres: [35] })?.kind).toBe('languages');
		// the search has no countries, so that rule waits for the pick
		expect(knownBreach(polish, { year: 2013, language: 'pl', genres: [18] })).toBeNull();
		// a search cached before results carried these says nothing either way
		expect(knownBreach(week({ genres: [27] }), { year: 1982 })).toBeNull();
		expect(knownBreach(week({ yearTo: 1990 }), { year: 1999 })?.kind).toBe('years');
		expect(knownBreach(null, { language: 'fr' })).toBeNull();
	});

	it('refuses an off-theme pick at nomination and lets a fitting one through', () => {
		const { db, rules } = freshDb('weekly');
		startSpecial(db, rules, 'approval', { ...week({ countries: ['PL'] }), picks: 2 });
		const w = currentWeek(db)!;
		expect(picksAllowed(w)).toBe(2);
		expect(customOf(w.custom)?.name).toBe('Tydzień polski');

		expect(() =>
			nominateSpecial(db, rules, 'ala', { title: 'Amélie' }, { ...ida, countries: ['FR'] })
		).toThrow(expect.objectContaining({ code: 'off_theme', params: { kind: 'countries', values: 'PL' } }));
		expect(() => nominateSpecial(db, rules, 'ala', { title: 'Typed by hand' })).toThrow(
			expect.objectContaining({ code: 'off_theme', params: { kind: 'tmdb' } })
		);
		expect(picksUsed(db, currentWeek(db)!, 'ala')).toBe(0);

		nominateSpecial(db, rules, 'ala', { title: 'Ida' }, ida);
		expect(picksUsed(db, currentWeek(db)!, 'ala')).toBe(1);
	});

	it('can be put right while running, its rules only until somebody picks', () => {
		const { db, rules } = freshDb('weekly');
		startSpecial(db, rules, 'approval', { ...week({ countries: ['PL'] }), picks: 2 });
		editSpecial(db, { ...week({ countries: ['PL', 'CZ'] }), picks: 2 });
		expect(customOf(currentWeek(db)!.custom)?.rules.countries).toEqual(['PL', 'CZ']);

		nominateSpecial(db, rules, 'ala', { title: 'Ida' }, ida);
		nominateSpecial(db, rules, 'ala', { title: 'Cold War' }, ida);
		const renamed = { ...week({ countries: ['PL', 'CZ'] }), name: 'Kino polskie', picks: 3 };
		editSpecial(db, renamed);
		expect(customOf(currentWeek(db)!.custom)?.name).toBe('Kino polskie');

		expect(() => editSpecial(db, { ...renamed, rules: { countries: ['PL'] } })).toThrow(
			expect.objectContaining({ code: 'custom_rules_locked' })
		);
		expect(() => editSpecial(db, { ...renamed, picks: 1 })).toThrow(
			expect.objectContaining({ code: 'custom_picks_used', params: { most: 2 } })
		);
	});

	it('gives a plain special round a setup after it started', () => {
		const { db, rules } = freshDb('weekly');
		startSpecial(db, rules, 'approval');
		nominateSpecial(db, rules, 'ala', { title: 'The Thing' });
		editSpecial(db, { name: 'Noc grozy', about: null, picks: 1, rules: {} });
		expect(customOf(currentWeek(db)!.custom)?.name).toBe('Noc grozy');
	});

	it('forgets its setup when the round is called off', () => {
		const { db, rules } = freshDb('weekly');
		startSpecial(db, rules, 'approval', week({ countries: ['PL'] }));
		stopSpecial(db, rules);
		expect(currentWeek(db)!.custom).toBeNull();
	});

	it('carries a refusal as flat parameters and reads it back whole', () => {
		const all: WeekRule[] = [
			{ kind: 'countries', codes: ['PL', 'CZ'] },
			{ kind: 'languages', codes: ['pl'] },
			{ kind: 'genres', ids: [27, 53] },
			{ kind: 'years', from: 1990, to: null },
			{ kind: 'runtime', min: null, max: 100 },
			{ kind: 'directors', names: ['Wajda', 'Holland, Agnieszka'] },
			{ kind: 'coded', id: 'woman_director' },
			{ kind: 'tmdb' }
		];
		for (const rule of all) {
			const params = ruleToParams(rule);
			expect(Object.values(params).every((v) => typeof v !== 'object')).toBe(true);
			expect(ruleFromParams(params)).toEqual(rule);
		}
		expect(ruleFromParams({ kind: 'coded', id: 'tall_director' })).toBeNull();
	});

	it('says a refusal in the reader language, naming the rule', () => {
		const params = ruleToParams({ kind: 'countries', codes: ['PL', 'CZ'] });
		expect(dictFor('pl').error('off_theme', params, 'x')).toBe(
			'Nie pasuje do zasad tygodnia. Kraj produkcji: Polska lub Czechy.'
		);
		expect(dictFor('en').error('off_theme', params, 'x')).toBe(
			'That film does not fit this week. Production country: Poland or Czechia.'
		);
		expect(dictFor('pl').error('off_theme', { kind: 'nonsense' }, 'fallback')).toBe('fallback');
	});

	it('lists its rules on the rules screen, after its own description', () => {
		const T = dictFor('en');
		const custom = { ...week({ genres: [27], runtimeMax: 100 }), about: 'Only scary ones.' };
		const said = T.spRules({ id: 'approval', picksPerPerson: 1, shortlistSize: 3, custom });
		expect(said.map((r) => r.body)).toContain('Only scary ones.');
		expect(said.map((r) => r.body)).toContain('Genre: Horror. At most 100 minutes.');
	});
});
