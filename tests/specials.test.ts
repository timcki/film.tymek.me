import { describe, expect, it } from 'vitest';
import { filmById, holdFilm, nominate, setPoints, standings } from '../src/lib/server/films.js';
import { closeWeek, currentWeek, weekByNumber } from '../src/lib/server/weeks.js';
import { closeRunoff, flashVote, openRunoff, runoffFilms } from '../src/lib/server/runoffs.js';
import { pointsInWindow } from '../src/lib/server/scoring.js';
import {
	lookAt,
	nominateSpecial,
	picksUsed,
	setApproval,
	specialPicks,
	specialTurnout,
	startSpecial,
	stopSpecial
} from '../src/lib/server/specials.js';
import { screenStats } from '../src/lib/server/stats.js';
import { xpBreakdown } from '../src/lib/server/xp.js';
import { addFilm, castBallot, forceAdvanceTo, freshDb } from './helpers.js';

/**
 * §3.6. A round given over to a special night: two picks each, approval voting
 * with the counts hidden until close, the most approved to the room, and the list
 * asleep throughout, so it wakes up exactly where it was left.
 */
describe('a special round', () => {
	function halloween() {
		const { db, rules } = freshDb('weekly');
		startSpecial(db, rules, 'halloween');
		const pick = (person: string, title: string) => nominateSpecial(db, rules, person, { title });
		return { db, rules, pick };
	}

	it('gives each person one pick, kept off the list and outside its nomination slot', () => {
		const { db, rules, pick } = halloween();
		addFilm(db, 'Paddington', 'ala', 1);
		pick('ala', 'The Thing');
		expect(() => pick('ala', 'Halloween')).toThrow(expect.objectContaining({ code: 'picks_spent' }));
		expect(picksUsed(db, currentWeek(db)!, 'ala')).toBe(1);
		pick('bartek', 'Suspiria');

		expect(standings(db, rules, 1, 'ala').map((f) => f.title)).toEqual(['Paddington']);
		expect(specialPicks(db, currentWeek(db)!, 'ala').map((f) => f.title)).toEqual([
			'The Thing',
			'Suspiria'
		]);
	});

	it('holds a pick to the duplicate rules, the list included', () => {
		const { db, rules, pick } = halloween();
		addFilm(db, 'Alien', 'bartek', 1);
		expect(() => pick('ala', 'Alien')).toThrow(expect.objectContaining({ code: 'dup_active' }));
		pick('ala', 'The Thing');
		expect(() => pick('bartek', 'The Thing')).toThrow(expect.objectContaining({ code: 'dup_active' }));
	});

	it('puts the list to sleep: no points, no nominations, no holds', () => {
		const { db, rules } = freshDb('weekly');
		const film = addFilm(db, 'Paddington', 'ala', 1);
		setPoints(db, rules, 'bartek', film, 1);
		startSpecial(db, rules, 'halloween');

		const asleep = expect.objectContaining({ code: 'list_asleep' });
		expect(() => setPoints(db, rules, 'bartek', film, 2)).toThrow(asleep);
		expect(() => nominate(db, rules, 'celina', { title: 'Heat' })).toThrow(asleep);
		expect(() => holdFilm(db, 'ala', film)).toThrow(asleep);
		// what was spent before it began stands
		expect(filmById(db, film)!.score).toBe(1);
	});

	it('takes approvals freely, both ways, on any pick including your own', () => {
		const { db, rules, pick } = halloween();
		const thing = pick('ala', 'The Thing');
		setApproval(db, rules, 'ala', thing, true);
		setApproval(db, rules, 'bartek', thing, true);
		setApproval(db, rules, 'bartek', thing, true);
		expect(filmById(db, thing)!.score).toBe(2);
		setApproval(db, rules, 'bartek', thing, false);
		expect(filmById(db, thing)!.score).toBe(1);
	});

	it('refuses approvals on anything but this round’s picks', () => {
		const { db, rules } = freshDb('weekly');
		const film = addFilm(db, 'Paddington', 'ala', 1);
		startSpecial(db, rules, 'halloween');
		expect(() => setApproval(db, rules, 'bartek', film, true)).toThrow(
			expect.objectContaining({ code: 'not_a_pick' })
		);
	});

	it('keeps the counts to itself while the round is open', () => {
		const { db, rules, pick } = halloween();
		const thing = pick('ala', 'The Thing');
		const suspiria = pick('bartek', 'Suspiria');
		for (const person of ['ala', 'bartek', 'celina']) setApproval(db, rules, person, suspiria, true);
		setApproval(db, rules, 'darek', thing, true);

		const shown = specialPicks(db, currentWeek(db)!, 'darek');
		// in the order they were put up, every score blanked, only the viewer's own ticks
		expect(shown.map((f) => f.title)).toEqual(['The Thing', 'Suspiria']);
		expect(shown.map((f) => f.score)).toEqual([0, 0]);
		expect(shown.map((f) => f.approved)).toEqual([true, false]);
		expect(specialTurnout(db, currentWeek(db)!).voters.map((v) => v.id).sort()).toEqual([
			'ala',
			'bartek',
			'celina',
			'darek'
		]);
	});

	it('sends the three most approved to the room, ties to the earlier pick', () => {
		const { db, rules, pick } = halloween();
		const ids = [
			pick('ala', 'One'),
			pick('bartek', 'Two'),
			pick('celina', 'Three'),
			pick('darek', 'Four'),
			pick('ewa', 'Five')
		];
		const tick = (film: number, people: string[]) =>
			people.forEach((person) => setApproval(db, rules, person, film, true));
		tick(ids[4], ['ala', 'bartek', 'celina']);
		tick(ids[3], ['ala', 'bartek']);
		tick(ids[1], ['ala']);
		tick(ids[2], ['bartek']);

		const result = closeWeek(db, rules);
		expect(result.kind).toBe('runoff');
		const room = runoffFilms(db, openRunoff(db)!.id).map((f) => f.title).sort();
		expect(room).toEqual(['Five', 'Four', 'Two']);
	});

	it('lets the room decide, then drops the picks it did not watch and opens a list round', () => {
		const { db, rules, pick } = halloween();
		const a = pick('ala', 'A');
		const b = pick('bartek', 'B');
		setApproval(db, rules, 'celina', a, true);
		setApproval(db, rules, 'celina', b, true);
		closeWeek(db, rules);
		const runoff = openRunoff(db)!;
		flashVote(db, runoff.id, 'darek', 'darek', [b, a]);
		closeRunoff(db, rules, runoff.id);

		expect(filmById(db, b)!.status).toBe('watched');
		expect(filmById(db, b)!.watched_week).toBe(1);
		expect(weekByNumber(db, 1)!.winner_film_id).toBe(b);
		expect(filmById(db, a)!.status).toBe('dropped');
		const next = currentWeek(db)!;
		expect(next.number).toBe(2);
		expect(next.special).toBeNull();
		// a night like any other for XP: the nominator, the room, the ticks
		expect(xpBreakdown(db, 'bartek').nominationsWatched).toBe(1);
		expect(xpBreakdown(db, 'darek').nightsAttended).toBe(1);
		expect(xpBreakdown(db, 'celina').weeksVoted).toBe(1);
		// but not one to average what it takes to win with
		expect(screenStats(db)).toBeNull();
	});

	it('closes without a night when nobody ticked anything', () => {
		const { db, rules, pick } = halloween();
		pick('ala', 'A');
		expect(closeWeek(db, rules).kind).toBe('no-winner');
		expect(currentWeek(db)!.number).toBe(2);
	});

	it('ages nothing on the list: no fade, no drop, for the round it slept through', () => {
		const { db, rules } = freshDb('weekly');
		const film = addFilm(db, 'Paddington', 'ala', 1);
		const other = addFilm(db, 'Heat', 'bartek', 1);
		castBallot(db, 1, 'ala', film, 2);
		castBallot(db, 1, 'bartek', other, 2);
		forceAdvanceTo(db, 2);
		startSpecial(db, rules, 'halloween');
		const pick = nominateSpecial(db, rules, 'celina', { title: 'The Thing' });
		setApproval(db, rules, 'celina', pick, true);
		// week 2 had points on one of them before it went special, which stand
		castBallot(db, 2, 'bartek', other, 1);
		closeWeek(db, rules);
		closeRunoff(db, rules, openRunoff(db)!.id);

		// neither dropped, though Paddington had nothing in rounds 2 and 3 by number
		expect(filmById(db, film)!.status).toBe('active');
		// week 1's points are one list round old, not two
		const scores = new Map(standings(db, rules, 3, null).map((f) => [f.title, f.score]));
		expect(scores.get('Paddington')).toBe(1);
		// and week 2's, cast before the list fell asleep, still count as this round's
		expect(scores.get('Heat')).toBe(2);
		expect(pointsInWindow(db, film, 3, 2)).toBe(2);
	});

	it('changes its mind only while nobody has put a pick up', () => {
		const { db, rules } = freshDb('weekly');
		startSpecial(db, rules, 'halloween');
		expect(() => startSpecial(db, rules, 'halloween')).toThrow(
			expect.objectContaining({ code: 'special_on' })
		);
		stopSpecial(db, rules);
		expect(currentWeek(db)!.special).toBeNull();
		startSpecial(db, rules, 'halloween');
		nominateSpecial(db, rules, 'ala', { title: 'A' });
		expect(() => stopSpecial(db, rules)).toThrow(
			expect.objectContaining({ code: 'special_has_picks' })
		);
	});

	it('wears its look while in play and for the rest of its month', () => {
		const { db, rules } = freshDb('weekly', new Date('2026-08-03T10:00:00Z'));
		expect(lookAt(db)).toBeNull();
		startSpecial(db, rules, 'halloween');
		expect(lookAt(db)?.id).toBe('halloween');
		closeWeek(db, rules);
		// the round closed without a night; the look follows the month, which is
		// October for Halloween, so a round held in August has none to keep
		expect(lookAt(db)).toBeNull();

		const october = freshDb('weekly', new Date('2026-10-25T10:00:00Z'));
		october.db.prepare('UPDATE week SET closes_at = ?').run('2026-10-29T19:00:00.000Z');
		startSpecial(october.db, october.rules, 'halloween', new Date('2026-10-25T10:00:00Z'));
		closeWeek(october.db, october.rules, new Date('2026-10-29T19:00:00Z'));
		expect(lookAt(october.db, new Date('2026-10-31T21:00:00Z'))?.id).toBe('halloween');
		expect(lookAt(october.db, new Date('2026-10-31T23:30:00Z'))).toBeNull();
	});
});
