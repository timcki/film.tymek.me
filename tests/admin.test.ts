import { describe, expect, it } from 'vitest';
import { isAdmin, logAdmin, recentAudit, requireAdmin, seedAdmins } from '../src/lib/server/admin.js';
import {
	createPerson,
	deleteFilm,
	editFilm,
	roundFilms,
	managedPeople,
	markWatched,
	reassignFilm,
	renamePerson,
	setBank,
	setPersonActive,
	setPersonAdmin
} from '../src/lib/server/manage.js';
import { filmById } from '../src/lib/server/films.js';
import { personById } from '../src/lib/server/people.js';
import { RuleError } from '../src/lib/server/types.js';
import { addFilm, castBallot, freshDb } from './helpers.js';

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

	it('moves a nomination but refuses to double up someone week', () => {
		const { db } = freshDb('banked');
		const film = addFilm(db, 'Wrongly filed', 'ala', 1);
		addFilm(db, 'Already theirs', 'bartek', 1);

		expect(() => reassignFilm(db, film, 'bartek')).toThrow(RuleError);
		reassignFilm(db, film, 'celina');
		expect(filmById(db, film)!.added_by).toBe('celina');
	});

	it('records a night that happened outside the app', () => {
		const { db, rules } = freshDb('banked');
		const film = addFilm(db, 'Watched at Piotr', 'ala', 1);
		castBallot(db, 1, 'ala', film, 2);

		markWatched(db, rules, film, 1, 1);

		const watched = filmById(db, film)!;
		expect(watched.status).toBe('watched');
		expect(watched.watched_week).toBe(1);
		expect(watched.final_score).toBe(2);
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
