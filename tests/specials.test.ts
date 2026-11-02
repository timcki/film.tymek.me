import { describe, expect, it } from 'vitest';
import { filmById, holdFilm, nominate, setPoints, standings } from '../src/lib/server/films.js';
import { closeWeek, currentWeek, syncOpenWeek, weekByNumber } from '../src/lib/server/weeks.js';
import { closeRunoff, flashVote, openRunoff, runoffFilms } from '../src/lib/server/runoffs.js';
import { pointsInWindow } from '../src/lib/server/scoring.js';
import {
	nominateSpecial,
	picksUsed,
	setApproval,
	specialPicks,
	specialTurnout,
	startExtraNight,
	startSpecial,
	stopSpecialOn,
	stopSpecial
} from '../src/lib/server/specials.js';
import { lookAt, setLook } from '../src/lib/server/looks.js';
import { screenStats } from '../src/lib/server/stats.js';
import { xpBreakdown } from '../src/lib/server/xp.js';
import { bankBalance, spentInRound } from '../src/lib/server/people.js';
import { setFilmStatus } from '../src/lib/server/manage.js';
import { addNight } from '../src/lib/server/schedule.js';
import { addFilm, castBallot, forceAdvanceTo, freshDb } from './helpers.js';

/**
 * §3.6. A round given over to a special night: two picks each, approval voting
 * with the counts hidden until close, the most approved to the room, and the list
 * asleep throughout, so it wakes up exactly where it was left.
 */
describe('a special round', () => {
	function special() {
		const { db, rules } = freshDb('weekly');
		startSpecial(db, rules, 'approval');
		const pick = (person: string, title: string) => nominateSpecial(db, rules, person, { title });
		return { db, rules, pick };
	}

	it('gives each person one pick, kept off the list and outside its nomination slot', () => {
		const { db, rules, pick } = special();
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

	it('gives a pick back when an admin takes it down', () => {
		const { db, rules, pick } = special();
		const thing = pick('ala', 'The Thing');
		setFilmStatus(db, rules, thing, 'dropped', 1);
		expect(picksUsed(db, currentWeek(db)!, 'ala')).toBe(0);
		pick('ala', 'Suspiria');
	});

	it('holds a pick to the duplicate rules, the list included', () => {
		const { db, rules, pick } = special();
		addFilm(db, 'Alien', 'bartek', 1);
		expect(() => pick('ala', 'Alien')).toThrow(expect.objectContaining({ code: 'dup_active' }));
		pick('ala', 'The Thing');
		expect(() => pick('bartek', 'The Thing')).toThrow(expect.objectContaining({ code: 'dup_active' }));
	});

	it('takes a nominator’s own list film, told first, and off the list only if it wins', () => {
		for (const wins of [false, true]) {
			const { db, rules } = freshDb('weekly');
			const alien = addFilm(db, 'Alien', 'ala', 1);
			setPoints(db, rules, 'bartek', alien, 2);
			startSpecial(db, rules, 'approval');

			expect(() => nominateSpecial(db, rules, 'ala', { title: 'Alien' })).toThrow(
				expect.objectContaining({ code: 'from_list_unconfirmed', params: { title: 'Alien' } })
			);
			// somebody else's list film is still one the list will get to
			expect(() => nominateSpecial(db, rules, 'bartek', { title: 'Alien' }, null, true)).toThrow(
				expect.objectContaining({ code: 'dup_active' })
			);
			const copy = nominateSpecial(db, rules, 'ala', { title: 'Alien' }, null, true);
			const other = nominateSpecial(db, rules, 'celina', { title: 'Suspiria' });
			setApproval(db, rules, 'darek', wins ? copy : other, true);
			closeWeek(db, rules);
			closeRunoff(db, rules, openRunoff(db)!.id);

			expect(filmById(db, copy)!.status).toBe(wins ? 'watched' : 'dropped');
			expect(filmById(db, alien)!.status).toBe(wins ? 'dropped' : 'active');
			expect(spentInRound(db, 'bartek', currentWeek(db)!.number)).toBe(2);
		}
	});

	it('puts the list to sleep: no points, no nominations, no holds', () => {
		const { db, rules } = freshDb('weekly');
		const film = addFilm(db, 'Paddington', 'ala', 1);
		setPoints(db, rules, 'bartek', film, 1);
		startSpecial(db, rules, 'approval');

		const asleep = expect.objectContaining({ code: 'list_asleep' });
		expect(() => setPoints(db, rules, 'bartek', film, 2)).toThrow(asleep);
		expect(() => nominate(db, rules, 'celina', { title: 'Heat' })).toThrow(asleep);
		expect(() => holdFilm(db, 'ala', film)).toThrow(asleep);
		// what was spent before it began stands
		expect(filmById(db, film)!.score).toBe(1);
	});

	it('takes approvals freely, both ways, on any pick including your own', () => {
		const { db, rules, pick } = special();
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
		startSpecial(db, rules, 'approval');
		expect(() => setApproval(db, rules, 'bartek', film, true)).toThrow(
			expect.objectContaining({ code: 'not_a_pick' })
		);
	});

	it('keeps the counts to itself while the round is open', () => {
		const { db, rules, pick } = special();
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
		const { db, rules, pick } = special();
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
		const { db, rules, pick } = special();
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
		const { db, rules, pick } = special();
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
		startSpecial(db, rules, 'approval');
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

	it('wakes the list where it was left: what was spent and nominated is still this round’s', () => {
		const { db, rules } = freshDb('weekly');
		const film = addFilm(db, 'Paddington', 'ala', 1);
		const other = addFilm(db, 'Heat', 'bartek', 1);
		setPoints(db, rules, 'bartek', film, 2);
		nominate(db, rules, 'celina', { title: 'Alien' });
		startSpecial(db, rules, 'approval');
		const pick = nominateSpecial(db, rules, 'darek', { title: 'The Thing' });
		setApproval(db, rules, 'darek', pick, true);
		closeWeek(db, rules);
		closeRunoff(db, rules, openRunoff(db)!.id);
		expect(currentWeek(db)!.number).toBe(2);

		// the two points are still bartek's, against the same three
		expect(spentInRound(db, 'bartek', 2)).toBe(2);
		const mine = standings(db, rules, 2, 'bartek').find((f) => f.id === film)!;
		expect(mine.myPoints).toBe(2);
		expect(mine.myFloor).toBe(2);
		expect(() => setPoints(db, rules, 'bartek', other, 2)).toThrow(
			expect.objectContaining({ code: 'not_enough_points' })
		);
		expect(() => setPoints(db, rules, 'bartek', film, 1)).toThrow(
			expect.objectContaining({ code: 'votes_final' })
		);
		// adding goes on top of them rather than counting them twice
		setPoints(db, rules, 'bartek', film, 3);
		expect(filmById(db, film)!.score).toBe(3);
		expect(spentInRound(db, 'bartek', 2)).toBe(3);
		// and the round's nomination is spent
		expect(() => nominate(db, rules, 'celina', { title: 'Heat 2' })).toThrow(
			expect.objectContaining({ code: 'already_nominated' })
		);
	});

	it('wakes the list with its holds still standing', () => {
		const { db, rules } = freshDb('weekly');
		const other = addFilm(db, 'Heat', 'ala', 1);
		forceAdvanceTo(db, 2);
		const film = addFilm(db, 'Paddington', 'ala', 2);
		const third = addFilm(db, 'Alien', 'bartek', 2);
		setPoints(db, rules, 'bartek', film, 2);
		setPoints(db, rules, 'celina', third, 1);
		holdFilm(db, 'ala', film, 'away');
		startSpecial(db, rules, 'approval');
		setApproval(db, rules, 'darek', nominateSpecial(db, rules, 'darek', { title: 'The Thing' }), true);
		closeWeek(db, rules);
		closeRunoff(db, rules, openRunoff(db)!.id);

		expect(standings(db, rules, 3, null).find((f) => f.id === film)!.held?.reason).toBe('away');
		expect(() => holdFilm(db, 'ala', other)).toThrow(expect.objectContaining({ code: 'hold_taken' }));
		// tapping it again only rewrites the reason, in the row already there
		holdFilm(db, 'ala', film, 'still away');
		expect(db.prepare('SELECT COUNT(*) AS n FROM film_hold').get()).toEqual({ n: 1 });
		closeWeek(db, rules);
		expect(runoffFilms(db, openRunoff(db)!.id).map((f) => f.title)).toEqual(['Alien']);
	});

	it('banks once for the list round it slept through, counting what was spent before', () => {
		const { db, rules } = freshDb('banked');
		const film = addFilm(db, 'Paddington', 'ala', 1);
		setPoints(db, rules, 'bartek', film, 2);
		startSpecial(db, rules, 'approval');
		setApproval(db, rules, 'darek', nominateSpecial(db, rules, 'darek', { title: 'The Thing' }), true);
		closeWeek(db, rules);
		closeRunoff(db, rules, openRunoff(db)!.id);
		closeWeek(db, rules);
		closeRunoff(db, rules, openRunoff(db)!.id);

		expect(filmById(db, film)!.status).toBe('watched');
		expect(bankBalance(db, 'bartek')).toBe(2);
		expect(bankBalance(db, 'ala')).toBe(4);
	});

	it('runs an extra night on a date of its own, then gives the list back its night', () => {
		const { db, rules } = freshDb('weekly');
		const thursday = currentWeek(db)!.closes_at;
		const film = addFilm(db, 'Paddington', 'ala', 1);
		setPoints(db, rules, 'bartek', film, 2);
		expect(() =>
			startExtraNight(db, rules, 'approval', null, new Date(Date.parse(thursday) + 3600_000))
		).toThrow(expect.objectContaining({ code: 'extra_not_before' }));

		const sunday = new Date('2026-08-04T18:00:00Z');
		const week = startExtraNight(db, rules, 'approval', null, sunday);
		expect(week.special).toBe('approval');
		expect(week.closes_at).toBe(sunday.toISOString());
		setApproval(db, rules, 'darek', nominateSpecial(db, rules, 'darek', { title: 'The Thing' }), true);
		closeWeek(db, rules);
		closeRunoff(db, rules, openRunoff(db)!.id);

		const next = currentWeek(db)!;
		expect(next.special).toBeNull();
		expect(next.closes_at).toBe(thursday);
		expect(spentInRound(db, 'bartek', next.number)).toBe(2);
	});

	it('dates a round decided early by the night it was decided, and leaves the list its Thursday after a special one', () => {
		const { db, rules } = freshDb('weekly');
		const thursday = currentWeek(db)!.closes_at;
		startSpecial(db, rules, 'approval');
		setApproval(db, rules, 'darek', nominateSpecial(db, rules, 'darek', { title: 'The Thing' }), true);
		const tuesday = new Date('2026-08-04T18:00:00Z');
		closeWeek(db, rules, tuesday);
		closeRunoff(db, rules, openRunoff(db)!.id, tuesday);

		expect(weekByNumber(db, 1)!.closes_at).toBe(tuesday.toISOString());
		expect(currentWeek(db)!.closes_at).toBe(thursday);
	});

	it('closes a round on the nearest date, even one before the night the round before was due', () => {
		const { db, rules } = freshDb('weekly');
		const thursday = currentWeek(db)!.closes_at;
		const film = addFilm(db, 'Paddington', 'ala', 1);
		setPoints(db, rules, 'bartek', film, 2);
		closeWeek(db, rules);
		closeRunoff(db, rules, openRunoff(db)!.id);
		// with nothing planned it is the Thursday after the one just decided for
		expect(Date.parse(currentWeek(db)!.closes_at)).toBeGreaterThan(Date.parse(thursday));

		const wednesday = new Date(Date.parse(thursday) - 86_400_000);
		addNight(db, wednesday, null);
		expect(syncOpenWeek(db)!.closes_at).toBe(wednesday.toISOString());
	});

	it('does not put the default Thursday in the week of a night the list was decided on', () => {
		const { db, rules } = freshDb('weekly');
		const thursday = currentWeek(db)!.closes_at;
		const wednesday = new Date(Date.parse(thursday) - 86_400_000);
		addNight(db, wednesday, null);
		syncOpenWeek(db);
		const film = addFilm(db, 'Paddington', 'ala', 1);
		setPoints(db, rules, 'bartek', film, 2);
		closeWeek(db, rules, new Date(wednesday.getTime() + 1000));
		closeRunoff(db, rules, openRunoff(db)!.id);

		// Wednesday's list round is over, so the next count is not Thursday's of the same week
		expect(Date.parse(currentWeek(db)!.closes_at)).toBe(Date.parse(thursday) + 7 * 86_400_000);

		// a date added by hand for that same week is fine
		addNight(db, new Date(Date.parse(thursday) + 86_400_000), null);
		expect(syncOpenWeek(db)!.closes_at).toBe(new Date(Date.parse(thursday) + 86_400_000).toISOString());
	});

	it('allows an extra night before the night a round decided early was due', () => {
		const { db, rules } = freshDb('weekly');
		const thursday = currentWeek(db)!.closes_at;
		const film = addFilm(db, 'Paddington', 'ala', 1);
		setPoints(db, rules, 'bartek', film, 2);
		closeWeek(db, rules);
		closeRunoff(db, rules, openRunoff(db)!.id);

		const due = currentWeek(db)!.closes_at;
		const wednesday = new Date(Date.parse(thursday) - 86_400_000);
		expect(startExtraNight(db, rules, 'approval', null, wednesday).closes_at).toBe(wednesday.toISOString());

		// called off, the list round counts from the night it was due again
		stopSpecial(db, rules);
		expect(currentWeek(db)!.closes_at).toBe(due);
	});

	it('turns down an extra night when another night falls before it', () => {
		const { db, rules } = freshDb('weekly');
		const thursday = currentWeek(db)!.closes_at;
		addNight(db, new Date(Date.parse(thursday) - 2 * 86_400_000), null);
		const wednesday = new Date(Date.parse(thursday) - 86_400_000);
		expect(() => startExtraNight(db, rules, 'approval', null, wednesday)).toThrow(
			expect.objectContaining({ code: 'extra_too_early' })
		);
		expect(currentWeek(db)!.special).toBeNull();
	});

	it('is called off when its date is taken out of the calendar', () => {
		const { db, rules } = freshDb('weekly');
		const thursday = currentWeek(db)!.closes_at;
		const sunday = new Date('2026-08-04T18:00:00Z');
		startExtraNight(db, rules, 'approval', null, sunday);
		const extra = db.prepare('SELECT id FROM night WHERE extra = 1').get() as { id: number };

		expect(stopSpecialOn(db, rules, extra.id)).toBe(0);
		expect(currentWeek(db)!.special).toBeNull();
		expect(currentWeek(db)!.closes_at).toBe(thursday);
		expect(db.prepare('SELECT COUNT(*) AS n FROM night WHERE extra = 1').get()).toEqual({ n: 0 });

		// an ordinary night, with no special round on it, is none of its business
		const plain = addNight(db, new Date('2026-08-05T18:00:00Z'), null);
		expect(stopSpecialOn(db, rules, plain)).toBeNull();

		// a special round on an ordinary date is called off too, and the date stays for the caller
		syncOpenWeek(db);
		startSpecial(db, rules, 'approval');
		expect(currentWeek(db)!.closes_at).toBe('2026-08-05T18:00:00.000Z');
		expect(stopSpecialOn(db, rules, plain)).toBe(0);
		expect(currentWeek(db)!.special).toBeNull();
		expect(db.prepare('SELECT COUNT(*) AS n FROM night WHERE id = ?').get(plain)).toEqual({ n: 1 });
	});

	it('can be called off, with or without picks, while the round is open', () => {
		const { db, rules } = freshDb('weekly');
		startSpecial(db, rules, 'approval');
		expect(() => startSpecial(db, rules, 'approval')).toThrow(
			expect.objectContaining({ code: 'special_on' })
		);
		stopSpecial(db, rules);
		expect(currentWeek(db)!.special).toBeNull();
		startSpecial(db, rules, 'approval');
		nominateSpecial(db, rules, 'ala', { title: 'A' });
		expect(stopSpecial(db, rules)).toBe(1);
		expect(currentWeek(db)!.special).toBeNull();
		expect(specialPicks(db, currentWeek(db)!, 'ala')).toEqual([]);
	});

	it('still runs a round written down before the vote and the look were apart', () => {
		const { db, rules } = freshDb('weekly');
		db.prepare("UPDATE week SET special = 'halloween'").run();
		nominateSpecial(db, rules, 'ala', { title: 'A' });
		expect(() => nominateSpecial(db, rules, 'ala', { title: 'B' })).toThrow(
			expect.objectContaining({ code: 'picks_spent' })
		);
		expect(specialPicks(db, currentWeek(db)!, 'ala')).toHaveLength(1);
	});
});

/** §3.6: the look is the admin's to put on and take off, whatever the round votes by */
describe('the site look', () => {
	it('is not put on by a special round', () => {
		const { db, rules } = freshDb('weekly');
		startSpecial(db, rules, 'approval');
		expect(lookAt(db)).toBeNull();
	});

	it('stays on from round to round until it is taken off', () => {
		const { db } = freshDb('weekly');
		setLook(db, 'halloween');
		expect(lookAt(db)).toBe('halloween');
		forceAdvanceTo(db, 2);
		expect(currentWeek(db)?.number).toBe(2);
		expect(lookAt(db)).toBe('halloween');
		setLook(db, null);
		expect(lookAt(db)).toBeNull();
		// and the round it was worn in still says so
		expect(weekByNumber(db, 1)?.look).toBe('halloween');
	});
});
