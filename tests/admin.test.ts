import { describe, expect, it } from 'vitest';
import { isAdmin, logAdmin, recentAudit, requireAdmin, seedAdmins } from '../src/lib/server/admin.js';
import {
	createPerson,
	deleteFilm,
	editFilm,
	roundFilms,
	managedPeople,
	reassignFilm,
	renamePerson,
	setBank,
	setFilmStatus,
	setPersonActive,
	setPersonAdmin
} from '../src/lib/server/manage.js';
import { filmById } from '../src/lib/server/films.js';
import { personById } from '../src/lib/server/people.js';
import { RuleError } from '../src/lib/server/types.js';
import { NOTICE_MAX, noticeAt, setNotice } from '../src/lib/server/notice.js';
import { addComment, reactComment } from '../src/lib/server/comments.js';
import { toggleSeen } from '../src/lib/server/seen.js';
import { placeHold } from '../src/lib/server/holds.js';
import { nominateSpecial, setApproval, startSpecial } from '../src/lib/server/specials.js';
import { REACTIONS } from '../src/lib/reactions.js';
import { addFilm, castBallot, forceAdvanceTo, freshDb } from './helpers.js';

const asPerson = (over: Record<string, unknown> = {}) =>
	({ id: 'ala', name: 'Ala', active: 1, is_admin: 1, ...over }) as never;

describe('who may reach the back office', () => {
	it('needs the flag and an active account', () => {
		expect(isAdmin(asPerson())).toBe(true);
		expect(isAdmin(asPerson({ is_admin: 0 }))).toBe(false);
		expect(isAdmin(asPerson({ active: 0 }))).toBe(false);
		expect(isAdmin(null)).toBe(false);
	});

	it('answers 404 rather than admitting the page exists', () => {
		expect(() => requireAdmin(asPerson({ is_admin: 0 }))).toThrowError(
			expect.objectContaining({ status: 404 })
		);
		expect(requireAdmin(asPerson()).id).toBe('ala');
	});

	it('seeds from the environment, granting only', () => {
		const { db } = freshDb('banked');
		process.env.ADMINS = 'ala, bartek';
		try {
			seedAdmins(db);
			expect(personById(db, 'ala')!.is_admin).toBe(1);
			expect(personById(db, 'bartek')!.is_admin).toBe(1);
			expect(personById(db, 'celina')!.is_admin).toBe(0);

			// a deploy must never hand admin back to someone it was taken from
			setPersonAdmin(db, 'bartek', 'ala', false);
			seedAdmins(db);
			expect(personById(db, 'ala')!.is_admin).toBe(1);
		} finally {
			delete process.env.ADMINS;
		}
	});
});

describe('managing people', () => {
	it('creates someone with a link and a first week of points', () => {
		const { db, rules } = freshDb('banked');
		const id = createPerson(db, rules, '  Nowa   Osoba ', '#6FA8DC');

		expect(id).toBe('nowa-osoba');
		const created = personById(db, id)!;
		expect(created.name).toBe('Nowa Osoba');
		expect(created.colour).toBe('#6fa8dc');
		expect(created.token.length).toBeGreaterThan(10);
		expect(managedPeople(db).find((p) => p.id === id)!.balance).toBe(rules.pointsPerWeek);
	});

	it('refuses a name that is already on the roster', () => {
		const { db, rules } = freshDb('banked');
		createPerson(db, rules, 'Nowa Osoba', '#6fa8dc');
		expect(() => createPerson(db, rules, 'nowa osoba', '#6fa8dc')).toThrow(RuleError);
	});

	it('keeps the id when someone is renamed, so their films stay theirs', () => {
		const { db, rules } = freshDb('banked');
		const film = addFilm(db, 'Theirs', 'ala', 1);
		renamePerson(db, 'ala', 'Ala Nowa', '#e8c34a');

		expect(personById(db, 'ala')!.name).toBe('Ala Nowa');
		expect(filmById(db, film)!.added_by).toBe('ala');
	});

	it('will not leave the room without an admin', () => {
		const { db } = freshDb('banked');
		setPersonAdmin(db, 'bartek', 'ala', true);

		// bartek is not an admin, so ala is the only one
		expect(() => setPersonAdmin(db, 'bartek', 'ala', false)).toThrow(RuleError);
		expect(() => setPersonActive(db, 'ala', false)).toThrow(RuleError);

		setPersonAdmin(db, 'ala', 'bartek', true);
		setPersonAdmin(db, 'bartek', 'ala', false);
		expect(personById(db, 'ala')!.is_admin).toBe(0);
	});

	it('stops an admin taking their own flag away', () => {
		const { db } = freshDb('banked');
		setPersonAdmin(db, 'celina', 'ala', true);
		setPersonAdmin(db, 'ala', 'bartek', true);
		expect(() => setPersonAdmin(db, 'ala', 'ala', false)).toThrow(RuleError);
	});

	it('holds a bank inside the cap', () => {
		const { db, rules } = freshDb('banked');
		setBank(db, rules, 'ala', 4);
		expect(managedPeople(db).find((p) => p.id === 'ala')!.balance).toBe(4);
		expect(() => setBank(db, rules, 'ala', 9)).toThrow(RuleError);
		expect(() => setBank(db, rules, 'ala', -1)).toThrow(RuleError);
	});

	it('keeps a deactivated person out without erasing what they did', () => {
		const { db } = freshDb('banked');
		const film = addFilm(db, 'Theirs', 'bartek', 1);
		setPersonActive(db, 'bartek', false);

		expect(personById(db, 'bartek')!.active).toBe(0);
		expect(filmById(db, film)!.added_by).toBe('bartek');
	});
});

describe('curating the films', () => {
	it('deletes only what nobody has voted for', () => {
		const { db } = freshDb('banked');
		const mistake = addFilm(db, 'Mistake', 'ala', 1);
		const backed = addFilm(db, 'Backed', 'bartek', 1);
		castBallot(db, 1, 'bartek', backed, 1);

		deleteFilm(db, mistake);
		expect(filmById(db, mistake)).toBeUndefined();
		expect(() => deleteFilm(db, backed)).toThrow(RuleError);
	});

	it('deletes a mistake somebody already talked about, ticked or held', () => {
		const { db } = freshDb('banked');
		const mistake = addFilm(db, 'Mistake', 'ala', 1);
		const comment = addComment(db, 'bartek', mistake, 'to chyba pomyłka');
		reactComment(db, 'celina', comment, REACTIONS[0]);
		toggleSeen(db, 'darek', mistake);
		placeHold(db, 1, mistake, 'ala', null);

		deleteFilm(db, mistake);
		expect(filmById(db, mistake)).toBeUndefined();
		const left = (table: string) =>
			(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
		expect([left('film_comment'), left('comment_react'), left('film_seen'), left('film_hold')]).toEqual([
			0, 0, 0, 0
		]);
	});

	it('moves a nomination but refuses to double up someone week', () => {
		const { db } = freshDb('banked');
		const film = addFilm(db, 'Wrongly filed', 'ala', 1);
		addFilm(db, 'Already theirs', 'bartek', 1);

		expect(() => reassignFilm(db, film, 'bartek')).toThrow(RuleError);
		reassignFilm(db, film, 'celina');
		expect(filmById(db, film)!.added_by).toBe('celina');
	});

	it('renames a film without letting it collide with another', () => {
		const { db } = freshDb('banked');
		const film = addFilm(db, 'Wrong Title', 'ala', 1);
		addFilm(db, 'Stalker', 'bartek', 1);

		const edit = {
			title: 'Stalker',
			year: null,
			director: null,
			genre: null,
			runtime: null,
			posterUrl: null,
			note: null
		};
		expect(() => editFilm(db, film, edit)).toThrow(RuleError);

		editFilm(db, film, { ...edit, title: 'Solaris', year: 1972 });
		const fixed = filmById(db, film)!;
		expect(fixed.title).toBe('Solaris');
		expect(fixed.title_key).toBe('solaris');
		expect(fixed.year).toBe(1972);
	});

	it('says a rename clashes with a film we watched the way a nomination would', () => {
		const { db, rules } = freshDb('banked');
		const film = addFilm(db, 'Wrong Title', 'ala', 1);
		const seen = addFilm(db, 'Stalker', 'bartek', 1);
		db.prepare(`UPDATE film SET status = 'watched', watched_week = 1 WHERE id = ?`).run(seen);

		const edit = { title: 'Stalker', year: null, director: null, genre: null, runtime: null, posterUrl: null, note: null };
		expect(() => editFilm(db, film, edit)).toThrow(expect.objectContaining({ code: 'dup_watched' }));
		// and a watched film is not sent back to the list from the round's tab
		expect(() => setFilmStatus(db, rules, seen, 'active', 1)).toThrow(expect.objectContaining({ code: 'no_film' }));
	});

	it('swaps a film for another from TMDB, underneath too, and keeps its votes', () => {
		const { db } = freshDb('banked');
		const film = addFilm(db, 'Solaris', 'ala', 1, { tmdbId: 593, overview: 'A space station.' });
		addFilm(db, 'Mirror', 'bartek', 1, { tmdbId: 1396 });
		castBallot(db, 1, 'celina', film, 2);
		const edit = {
			title: 'Stalker',
			year: 1979,
			director: 'Andrei Tarkovsky',
			genre: 'Drama',
			runtime: 162,
			posterUrl: null,
			note: null,
			replacement: { tmdbId: 1398, overview: 'A guide leads two men into the Zone.', countries: 'SU' }
		};
		expect(() => editFilm(db, film, { ...edit, title: 'Mirror 2', replacement: { ...edit.replacement, tmdbId: 1396 } })).toThrow(
			expect.objectContaining({ code: 'dup_active' })
		);

		editFilm(db, film, edit);
		const swapped = filmById(db, film)!;
		expect([swapped.title, swapped.tmdb_id, swapped.overview, swapped.countries]).toEqual([
			'Stalker',
			1398,
			'A guide leads two men into the Zone.',
			'SU'
		]);
		expect(db.prepare('SELECT points FROM ballot WHERE film_id = ?').get(film)).toEqual({ points: 2 });
	});

	it('still edits a film that shares its title with a rewatch', () => {
		const { db } = freshDb('banked');
		const first = addFilm(db, 'Stalker', 'ala', 1);
		const rewatch = addFilm(db, 'Stalker', 'bartek', 1);

		editFilm(db, rewatch, {
			title: 'Stalker',
			year: 1979,
			director: null,
			genre: null,
			runtime: null,
			posterUrl: 'https://image.tmdb.org/t/p/w342/stalker.jpg',
			note: null
		});
		expect(filmById(db, rewatch)!.poster_url).toBe('https://image.tmdb.org/t/p/w342/stalker.jpg');
		expect(filmById(db, first)!.poster_url).toBeNull();
	});

	// the demo's admin persona reaches this form too, and it writes the one field
	// every reader's browser then goes and fetches
	it('holds an admin edit to the same poster host as a nomination', () => {
		const { db } = freshDb('banked');
		const film = addFilm(db, 'Stalker', 'ala', 1);
		const edit = {
			title: 'Stalker',
			year: null,
			director: null,
			genre: null,
			runtime: null,
			posterUrl: 'http://attacker.example/tracker.gif',
			note: null
		};
		expect(() => editFilm(db, film, edit)).toThrow(/TMDB/);

		editFilm(db, film, { ...edit, posterUrl: 'https://image.tmdb.org/t/p/w342/abc.jpg' });
		expect(filmById(db, film)!.poster_url).toBe('https://image.tmdb.org/t/p/w342/abc.jpg');
	});

	it('lists every film whatever its status', () => {
		const { db } = freshDb('banked');
		addFilm(db, 'One', 'ala', 1);
		const two = addFilm(db, 'Two', 'bartek', 1);
		db.prepare(`UPDATE film SET status = 'dropped' WHERE id = ?`).run(two);

		expect(roundFilms(db).map((f) => f.title).sort()).toEqual(['One', 'Two']);
	});

	it('says whether a special pick has been ticked, which is what stops its deletion', () => {
		const { db, rules } = freshDb('weekly');
		startSpecial(db, rules, 'approval');
		const pick = nominateSpecial(db, rules, 'ala', { title: 'The Thing' });
		const ticks = () => roundFilms(db).find((f) => f.id === pick)!.approvals;
		expect(ticks()).toBe(0);
		setApproval(db, rules, 'bartek', pick, true);
		expect(ticks()).toBe(1);
		expect(() => deleteFilm(db, pick)).toThrow(expect.objectContaining({ code: 'film_has_ballots' }));
	});
});

describe('the audit trail', () => {
	it('keeps who did what, newest first', () => {
		const { db } = freshDb('banked');
		logAdmin(db, 'ala', 'night.add', '2026-08-05T18:00:00.000Z');
		logAdmin(db, 'bartek', 'person.rotate', 'celina');

		const rows = recentAudit(db);
		expect(rows[0].action).toBe('person.rotate');
		expect(rows[0].person_name).toBe('bartek');
		expect(rows[1].target).toBe('2026-08-05T18:00:00.000Z');
	});
});

describe('the announcement', () => {
	it('stays up from round to round until a blank one takes it down', () => {
		const { db } = freshDb('weekly');
		expect(noticeAt(db)).toBeNull();
		expect(setNotice(db, '  w czwartek   u Ani ')).toBe('w czwartek u Ani');
		forceAdvanceTo(db, 2);
		expect(noticeAt(db)).toBe('w czwartek u Ani');
		expect(setNotice(db, '   ')).toBeNull();
		expect(noticeAt(db)).toBeNull();
	});

	it('refuses one too long to be a line', () => {
		const { db } = freshDb('weekly');
		expect(() => setNotice(db, 'x'.repeat(NOTICE_MAX + 1))).toThrowError(
			expect.objectContaining({ code: 'notice_too_long' })
		);
	});
});
