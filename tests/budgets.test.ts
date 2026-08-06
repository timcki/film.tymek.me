import { describe, expect, it } from 'vitest';
import { RULE_SETS, accrue } from '../src/lib/server/rules.js';
import { setPoints } from '../src/lib/server/films.js';
import { accrueBanks } from '../src/lib/server/weeks.js';
import { bankBalance, setBankBalance } from '../src/lib/server/people.js';
import { addFilm, castBallot, freshDb } from './helpers.js';

describe('budgets', () => {
	// 1. a person cannot spend more than pointsPerWeek in a week (all three rule sets)
	it.each(['ledger', 'rolling', 'banked'] as const)(
		'%s: rejects spending beyond the weekly allowance',
		(id) => {
			const { db, rules } = freshDb(id);
			const film = addFilm(db, 'Stalker', 'ala', 1);
			const allowance = rules.banking ? bankBalance(db, 'ala') : rules.pointsPerWeek;
			expect(allowance).toBe(rules.pointsPerWeek);

			setPoints(db, rules, 'ala', film, allowance);
			expect(() => setPoints(db, rules, 'ala', film, allowance + 1)).toThrow(/points/);
		}
	);

	// 2. in banked, a person cannot spend more than their bank balance
	it('banked: the bank balance is the ceiling, not pointsPerWeek', () => {
		const { db, rules } = freshDb('banked');
		const film = addFilm(db, 'Stalker', 'ala', 1);
		setBankBalance(db, 'ala', 7);

		setPoints(db, rules, 'ala', film, 7);
		expect(() => setPoints(db, rules, 'ala', film, 8)).toThrow(/7 left|of 7 points/);
	});

	// 3. in banked, unspent points carry over, capped, never negative
	it('banked: unspent points carry over up to bankCap and never go negative', () => {
		const { db, rules } = freshDb('banked');
		const film = addFilm(db, 'Stalker', 'ala', 1);

		setPoints(db, rules, 'ala', film, 0);
		accrueBanks(db, rules, 1);
		// started at 2, spent 0, +2 per week
		expect(bankBalance(db, 'ala')).toBe(4);

		// spend everything: balance falls back to pointsPerWeek, never below zero
		setBankBalance(db, 'ala', 4);
		castBallot(db, 2, 'ala', film, 4);
		accrueBanks(db, rules, 2);
		expect(bankBalance(db, 'ala')).toBe(rules.pointsPerWeek);

		// the cap holds no matter how long you save
		let balance = 0;
		for (let i = 0; i < 40; i++) balance = accrue(rules, balance, 0);
		expect(balance).toBe(rules.bankCap);
		expect(accrue(rules, 0, 0)).toBeGreaterThanOrEqual(0);
	});

	// 4. undoing a cast within the grace window frees the budget for another film;
	// outside the window votes are final, which finality.test.ts covers
	it('freeing points on one film lets you spend them on another', () => {
		const { db, rules } = freshDb('banked');
		const a = addFilm(db, 'Stalker', 'ala', 1);
		const b = addFilm(db, 'Solaris', 'bartek', 1);

		setPoints(db, rules, 'ala', a, 2);
		expect(() => setPoints(db, rules, 'ala', b, 1)).toThrow();

		setPoints(db, rules, 'ala', a, 0);
		expect(() => setPoints(db, rules, 'ala', b, 2)).not.toThrow();

		const row = db
			.prepare('SELECT COUNT(*) AS n FROM ballot WHERE person_id = ? AND film_id = ?')
			.get('ala', a) as { n: number };
		expect(row.n).toBe(0); // a zero ballot is deleted, not stored
	});

	it('ledger grants one point a week and banked grants two', () => {
		expect(RULE_SETS.ledger.pointsPerWeek).toBe(1);
		expect(RULE_SETS.rolling.pointsPerWeek).toBe(5);
		expect(RULE_SETS.banked.pointsPerWeek).toBe(2);
	});

	it('weekly grants three points a week and never banks them', () => {
		expect(RULE_SETS.weekly.pointsPerWeek).toBe(3);
		expect(RULE_SETS.weekly.banking).toBe(false);
	});
});
