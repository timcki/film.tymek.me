import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import {
	backing,
	bridesmaids,
	byCountry,
	byDecade,
	byDirector,
	byGenre,
	comebacks,
	counts,
	engagement,
	eraOf,
	lensOf,
	openness,
	participation,
	rewatches,
	votingHabits,
	whoseNights,
	roundRows,
	filmFacts,
	runtimes,
	screenStats,
	timelines,
	timing,
	watchedFilms,
	windowFor
} from '$lib/server/stats';

export const load: PageServerLoad = async ({ url, locals }) => {
	const db = getDb();
	// a link rather than a form, so the switch survives a page without JS and can
	// be shared as it was read
	const era = eraOf(url.searchParams.get('era'));
	const lens = lensOf(url.searchParams.get('lens'));
	const window = windowFor(db, era);
	const films = watchedFilms(db);

	return {
		era,
		lens,
		window,
		me: locals.person!.id,
		counts: counts(db, window),
		rounds: roundRows(db, window),
		openness: openness(db, window),
		backing: backing(db, window),
		nights: whoseNights(db, window),
		engagement: engagement(db, window),
		timing: timing(db, window),
		rewatches: rewatches(db, window),
		// the canon is deliberately outside the window; see watchedFilms. The rows
		// travel whole so a tapped bar can name the films inside it without a trip
		films,
		decades: byDecade(films),
		countries: byCountry(films),
		genres: byGenre(films),
		directors: byDirector(films),
		runtimes: runtimes(films),
		facts: filmFacts(films),
		screen: screenStats(db),
		bridesmaids: bridesmaids(db),
		comebacks: comebacks(db),
		timelines: timelines(films),
		// ballots only exist since the app, so the voting view counts from there whatever the era says
		voting:
			lens === 'voting'
				? { rounds: participation(db, windowFor(db, 'app')), habits: votingHabits(db, windowFor(db, 'app')) }
				: null
	};
};
