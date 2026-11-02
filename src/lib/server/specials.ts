import type { DB } from './db.js';
import { immediate } from './db.js';
import type { Face, Film, Week } from './types.js';
import { RuleError } from './types.js';
import type { RuleSet } from './rules.js';
import { iso } from './time.js';
import { titleKey } from './rules.js';
import { avatarUrl } from './people.js';
import { rescoreAll } from './scoring.js';
import { rexpAll } from './xp.js';
import { assertNotDuplicate, filmById, insertFilm, type NominationInput } from './films.js';
import { currentWeek, requireOpenWeek, requireSpecialWeek, syncOpenWeek } from './weeks.js';
import { addNight } from './schedule.js';
import { SPECIALS, specialOf, type Special, type SpecialId } from '../specials.js';
import { customOf, rulesOf, type CustomWeek } from '../custom-weeks.js';
import { assertFits } from './custom-weeks.js';
import type { Facts } from './tmdb.js';

/**
 * §3.6. An admin gives the open round over to a special night. The list goes to
 * sleep on the spot: points already spent this round stand, nothing more can be
 * spent or nominated, and the round will not age anything on it.
 */
export function startSpecial(
	db: DB,
	rules: RuleSet,
	id: SpecialId,
	custom: CustomWeek | null = null,
	now: Date = new Date()
): Week {
	return immediate(db, () => {
		const week = requireOpenWeek(db, now);
		if (week.special) throw new RuleError('special_on', 'this round is already a special one');
		db.prepare('UPDATE week SET special = ?, custom = ? WHERE number = ?').run(
			SPECIALS[id].id,
			custom ? JSON.stringify(custom) : null,
			week.number
		);
		rescoreAll(db, rules, week.number);
		return currentWeek(db) as Week;
	});
}

/**
 * §3.6: an extra night. A date of its own goes into the calendar ahead of the
 * round's night, and the round becomes a special one closing there, all in one
 * step: a date added on its own would close the list early instead. Once it
 * is over the list wakes where it was and runs on to the night it had.
 */
export function startExtraNight(
	db: DB,
	rules: RuleSet,
	id: SpecialId,
	custom: CustomWeek | null,
	at: Date,
	now: Date = new Date()
): Week {
	return immediate(db, () => {
		const week = requireOpenWeek(db, now);
		if (week.special) throw new RuleError('special_on', 'this round is already a special one');
		if (at.getTime() >= new Date(week.closes_at).getTime()) {
			throw new RuleError('extra_not_before', 'an extra night has to come before the round closes');
		}
		addNight(db, at, custom?.name ?? null, now, true);
		// a round decided before its night counts from that night (deadlineAnchor),
		// so a date between the two would sit in the calendar closing nothing
		if (syncOpenWeek(db)?.closes_at !== iso(at)) {
			throw new RuleError(
				'extra_too_early',
				'the round before ended ahead of its date, so an extra night has to come after that date'
			);
		}
		return startSpecial(db, rules, id, custom, now);
	});
}

/**
 * How long an extra night started on the spot may run before it closes by
 * itself. It is a guard against one being forgotten, not a schedule: the group
 * closes it from /host as soon as it has chosen.
 */
export const EXTRA_NOW_MS = 2 * 60 * 60 * 1000;

/**
 * §3.6: an extra night with no date to fill in, for when the group has got
 * together and wants to choose a film there and then. It is the dated one
 * (`startExtraNight`) with its date set to a couple of hours from now, so it
 * leaves the list exactly where it was and can be called off the same way.
 */
export function startExtraNow(db: DB, rules: RuleSet, now: Date = new Date()): Week {
	// to the minute, like every date typed into the calendar
	const at = new Date(Math.floor((now.getTime() + EXTRA_NOW_MS) / 60_000) * 60_000);
	return startExtraNight(db, rules, 'approval', null, at, now);
}

/**
 * §3.6: changing your mind. A round can be called off for as long as it is open,
 * picks and all: nothing has been decided, the counts were never seen, and every
 * pick can be put up again, so what goes is erased rather than kept as history
 * (§1.5 is about what was decided). The list was only asleep, so it wakes as it
 * was. An extra night's own date goes out of the calendar with it, which is what
 * hands the list round back the night it had. Returns how many picks went.
 */
export function stopSpecial(db: DB, rules: RuleSet, now: Date = new Date()): number {
	return immediate(db, () => {
		const week = requireSpecialWeek(db, now);
		const picks = db
			.prepare('SELECT id FROM film WHERE special = ? AND added_week = ?')
			.all(week.special, week.number) as { id: number }[];
		for (const { id } of picks) {
			db.prepare('DELETE FROM approval WHERE film_id = ?').run(id);
			db.prepare(
				'DELETE FROM comment_react WHERE comment_id IN (SELECT id FROM film_comment WHERE film_id = ?)'
			).run(id);
			db.prepare('DELETE FROM film_comment WHERE film_id = ?').run(id);
			db.prepare('DELETE FROM film_seen WHERE film_id = ?').run(id);
			db.prepare('DELETE FROM film WHERE id = ?').run(id);
		}
		db.prepare('UPDATE week SET special = NULL, custom = NULL WHERE number = ?').run(week.number);
		db.prepare(`DELETE FROM night WHERE extra = 1 AND status = 'planned' AND at = ?`).run(
			week.closes_at
		);
		syncOpenWeek(db);
		rescoreAll(db, rules, week.number);
		rexpAll(db);
		return picks.length;
	});
}

/**
 * §3.7: a running week put right. Its name, description and how many picks each
 * can change at any time; its rules only while nobody has picked, or a pick
 * already up could stop fitting. Fewer picks than somebody has already put up
 * would take one of theirs back, so that is refused as well.
 */
export function editSpecial(db: DB, custom: CustomWeek, now: Date = new Date()): Week {
	return immediate(db, () => {
		const week = requireSpecialWeek(db, now);
		const counts = db
			.prepare(
				'SELECT COUNT(*) AS n FROM film WHERE special = ? AND added_week = ? GROUP BY added_by'
			)
			.all(week.special, week.number) as { n: number }[];
		const most = Math.max(0, ...counts.map((c) => c.n));
		const before = JSON.stringify(rulesOf(customOf(week.custom)?.rules ?? {}));
		if (counts.length && JSON.stringify(rulesOf(custom.rules)) !== before) {
			throw new RuleError('custom_rules_locked', 'somebody has already picked under these rules');
		}
		if (custom.picks < most) {
			throw new RuleError('custom_picks_used', `somebody has already put up ${most}, so it cannot go lower`, { most });
		}
		db.prepare('UPDATE week SET custom = ? WHERE number = ?').run(JSON.stringify(custom), week.number);
		return currentWeek(db) as Week;
	});
}

/** a pick an admin took down gives its owner the pick back */
function picksOf(db: DB, week: Week, personId: string): number {
	return (
		db
			.prepare(
				`SELECT COUNT(*) AS n FROM film
				 WHERE added_by = ? AND added_week = ? AND special = ? AND status = 'active'`
			)
			.get(personId, week.number, week.special) as { n: number }
	).n;
}

/** §3.7: a custom week says how many picks each, otherwise the special round does */
export function picksAllowed(week: Week): number {
	return customOf(week.custom)?.picks ?? (specialOf(week.special) as Special).picksPerPerson;
}

/**
 * §3.6: the viewer's own film waiting on the list that this would be, the same
 * question `sameFilm` in titles.ts asks on the page
 */
export function ownListFilm(db: DB, personId: string, input: NominationInput): Film | undefined {
	return db
		.prepare(
			`SELECT * FROM film
			 WHERE added_by = ? AND status = 'active' AND archival = 0 AND special IS NULL
			   AND CASE WHEN tmdb_id IS NOT NULL AND ? IS NOT NULL THEN tmdb_id = ? ELSE title_key = ? END
			 LIMIT 1`
		)
		.get(personId, input.tmdbId, input.tmdbId, titleKey(input.title)) as Film | undefined;
}

/**
 * §3.6: a pick for the night. A few each rather than one, and the usual
 * duplicate rules (§4.1) against everything, the list included: a film already
 * waiting on the list is one the list will get to. The one exception is the
 * nominator's own list film, which they may put up for the night as well, having been
 * told (`fromList`) that a win takes it off the list. §3.7: in a custom week it
 * also has to meet the week's rules, checked against what TMDB says about it.
 */
export function nominateSpecial(
	db: DB,
	rules: RuleSet,
	personId: string,
	input: NominationInput,
	facts: Facts | null = null,
	fromList = false,
	now: Date = new Date()
): number {
	return immediate(db, () => {
		const week = requireSpecialWeek(db, now);
		const max = picksAllowed(week);
		if (picksOf(db, week, personId) >= max) {
			throw new RuleError('picks_spent', `you have put up all ${max} of yours`, { max });
		}
		assertFits(customOf(week.custom), facts);
		const own = ownListFilm(db, personId, input);
		if (own && !fromList) {
			throw new RuleError(
				'from_list_unconfirmed',
				`${own.title} is your film on the list, and winning the night takes it off; pick it again to confirm`,
				{ title: own.title }
			);
		}
		assertNotDuplicate(db, input, own?.id ?? null);
		const id = insertFilm(db, input, personId, week.number, week.special);
		if (own) db.prepare('UPDATE film SET from_list = ? WHERE id = ?').run(own.id, id);
		rescoreAll(db, rules, week.number);
		rexpAll(db);
		return id;
	});
}

/**
 * §3.6: approval voting. A tick on a pick says "I would happily watch this",
 * as many ticks as you like, your own picks included, and taken back freely until
 * the round closes: nobody can see the counts, so there is nothing to react to.
 * Returns whether the viewer approves of the pick afterwards.
 */
export function setApproval(
	db: DB,
	rules: RuleSet,
	personId: string,
	filmId: number,
	on: boolean,
	now: Date = new Date()
): boolean {
	return immediate(db, () => {
		const week = requireSpecialWeek(db, now);
		const film = filmById(db, filmId);
		if (
			!film ||
			film.special !== week.special ||
			film.added_week !== week.number ||
			film.status !== 'active'
		) {
			throw new RuleError('not_a_pick', 'that is not one of this round’s picks');
		}
		if (on) {
			db.prepare(
				'INSERT OR IGNORE INTO approval (film_id, person_id, created_at) VALUES (?, ?, ?)'
			).run(filmId, personId, iso(now));
		} else {
			db.prepare('DELETE FROM approval WHERE film_id = ? AND person_id = ?').run(filmId, personId);
		}
		rescoreAll(db, rules, week.number);
		rexpAll(db);
		return on;
	});
}

export type SpecialPick = Film & {
	nominator: Face & { xp: number };
	/** whether the viewer has ticked it; nobody else's ticks leave the server */
	approved: boolean;
};

/**
 * The round's picks as the page may show them while it is open: in the order
 * they were put up, so the order says nothing about the counts, with score taken
 * off for the same reason.
 */
export function specialPicks(db: DB, week: Week, viewerId: string | null): SpecialPick[] {
	const films = db
		.prepare(
			`SELECT f.*, p.name AS nom_name, p.colour AS nom_colour, p.xp AS nom_xp,
			        p.avatar_updated_at AS nom_avatar,
			        EXISTS (SELECT 1 FROM approval a WHERE a.film_id = f.id AND a.person_id = ?) AS approved
			 FROM film f JOIN person p ON p.id = f.added_by
			 WHERE f.special = ? AND f.added_week = ? AND f.status = 'active'
			 ORDER BY f.created_at, f.id`
		)
		.all(viewerId, week.special, week.number) as (Film & {
		nom_name: string;
		nom_colour: string;
		nom_xp: number;
		nom_avatar: string | null;
		approved: number;
	})[];
	return films.map(({ nom_name, nom_colour, nom_xp, nom_avatar, approved, ...film }) => ({
		...film,
		score: 0,
		nominator: {
			id: film.added_by,
			name: nom_name,
			colour: nom_colour,
			xp: nom_xp,
			avatar: avatarUrl(film.added_by, nom_avatar)
		},
		approved: Boolean(approved)
	}));
}

export type SpecialTurnout = {
	/** who has ticked anything, most recent first; never what they ticked */
	voters: (Face & { xp: number })[];
	roster: number;
};

export function specialTurnout(db: DB, week: Week): SpecialTurnout {
	const rows = db
		.prepare(
			`SELECT p.id, p.name, p.colour, p.avatar_updated_at, p.xp, MAX(a.created_at) AS last
			 FROM approval a
			 JOIN film f ON f.id = a.film_id
			 JOIN person p ON p.id = a.person_id
			 WHERE f.special = ? AND f.added_week = ?
			 GROUP BY p.id
			 ORDER BY last DESC, p.name COLLATE NOCASE`
		)
		.all(week.special, week.number) as {
		id: string;
		name: string;
		colour: string;
		avatar_updated_at: string | null;
		xp: number;
	}[];
	const { roster } = db.prepare('SELECT COUNT(*) AS roster FROM person WHERE active = 1').get() as {
		roster: number;
	};
	return {
		voters: rows.map((row) => ({
			id: row.id,
			name: row.name,
			colour: row.colour,
			avatar: avatarUrl(row.id, row.avatar_updated_at),
			xp: row.xp
		})),
		roster
	};
}

/** how many of their picks this person has put up this round */
export function picksUsed(db: DB, week: Week, personId: string): number {
	return week.special ? picksOf(db, week, personId) : 0;
}
