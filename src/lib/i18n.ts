/**
 * Polish is the default; film titles, genres and synopses stay in whatever TMDB
 * gives us. Everything the app says about itself lives here, in both languages,
 * so a copy change is one edit in one file.
 */
import { formatNight } from './datetime.js';
import type { Outing } from './outings.js';
import { ruleFromParams, rulesOf, type CodedId, type CustomWeek, type WeekRule } from './custom-weeks.js';

export type Lang = 'pl' | 'en';

export const LANGS: Lang[] = ['pl', 'en'];

export function isLang(value: string | undefined | null): value is Lang {
	return value === 'pl' || value === 'en';
}

/**
 * The reader's language, Polish unless they have said otherwise. The fallback is
 * an argument because the demo answers this differently: the twenty-two speak
 * Polish, and whoever a portfolio sends is being shown the app rather than using
 * it, so English is the better first screen there.
 */
export function langOf(value: string | undefined | null, fallback: Lang = 'pl'): Lang {
	return isLang(value) ? value : fallback;
}

/**
 * The shape `+layout.server.ts` sends to the browser. Deliberately not the
 * server's RuleSet: `$lib/server` may not be imported from client code.
 */
export type RulesView = {
	id: string;
	label: string;
	pointsPerWeek: number;
	banking: boolean;
	bankCap: number;
	scoring: 'total' | 'decay' | 'fade';
	decayFactor: number;
	attrition:
		| { kind: 'archive'; afterWeeksAtZero: number }
		| { kind: 'drop'; afterWeeksWithoutPoints: number };
	nominationsPerWeek: number;
	shortlistSize: number;
	voteGraceSeconds: number;
};

/** one point a week and no banking means the currency reads as votes, not points */
export function isVotes(rules: RulesView): boolean {
	return rules.pointsPerWeek === 1 && !rules.banking;
}

export type Rule = { head: string; body: string };

/** how much of a point's value is gone after a week under 'fade', as a percentage */
export function fadePercent(r: RulesView): number {
	return Math.round((1 - r.decayFactor) * 100);
}

/** scores are fractional under 'fade'; one decimal is plenty for the eye */
export function fmtScore(n: number): string {
	const rounded = Math.round(n * 10) / 10;
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export type ErrorParams = Record<string, string | number>;

/** §3.6: the parts of a special round its own rules screen reads */
export type SpecialView = {
	id: string;
	picksPerPerson: number;
	shortlistSize: number;
	/** §3.7: the admin's name, description and rules, when the round has them */
	custom?: CustomWeek | null;
};

/** country or language names in the reader's language, as "a, b or c" */
function oneOf(lang: Lang, type: 'region' | 'language', codes: string[]): string {
	const names = new Intl.DisplayNames([lang], { type });
	return orList(
		lang,
		codes.map((code) => {
			try {
				return names.of(code) ?? code;
			} catch {
				return code;
			}
		})
	);
}

function orList(lang: Lang, items: string[]): string {
	return new Intl.ListFormat(lang, { type: 'disjunction' }).format(items);
}

/* ---------------------------------------------------------------- plurals -- */

/** Polish has three forms: 1 / 2-4 / 5+, with 12-14 falling back to the last */
export function pl3(n: number, one: string, few: string, many: string): string {
	if (n === 1) return one;
	const unit = n % 10;
	const hundred = n % 100;
	return unit >= 2 && unit <= 4 && !(hundred >= 12 && hundred <= 14) ? few : many;
}

function en2(n: number, one: string, many: string): string {
	return n === 1 ? one : many;
}

/**
 * "zostały 2 dni". The verb agrees with the numeral the same three ways the
 * noun does, and at one it also has to agree with the noun's gender: został
 * dzień, została godzina.
 */
const plLeft = (n: number, one: string, few: string, many: string, fem = false) =>
	`${pl3(n, fem ? 'została' : 'został', 'zostały', 'zostało')} ${n} ${pl3(n, one, few, many)}`;

const plRounds = (n: number) => pl3(n, 'runda', 'rundy', 'rund');
/** the same after "za", "temu" and the like, where one round is "rundę" */
const plRoundsAcc = (n: number) => pl3(n, 'rundę', 'rundy', 'rund');
const plPoints = (n: number) => pl3(n, 'punkt', 'punkty', 'punktów');
const plVotes = (n: number) => pl3(n, 'głos', 'głosy', 'głosów');
const plFilms = (n: number) => pl3(n, 'film', 'filmy', 'filmów');

/* ------------------------------------------------------------------- dict -- */

export type Dict = {
	lang: Lang;
	appTitle: string;
	tabList: string;
	menu: string;
	close: string;
	tabSeen: string;
	tabYou: string;
	tabAdmin: string;

	themeAuto: string;
	themeDark: string;
	themeLight: string;
	themeBanana: string;
	/** the accent switch's dots, said by name to a screen reader and on hover */
	accentNames: Record<'rose' | 'lavender' | 'periwinkle' | 'sky' | 'seafoam' | 'sage', string>;

	/** a film night by its number: the nights we watched something, counted from the first */
	evening: (n: number) => string;
	/** where we watched a film that was not a film night */
	outing: (where: Outing) => string;
	/** the mark on a film night a special round decided, an extra night's included */
	nightSpecial: string;
	/** the whole phrase, verb included, because the bar has no room for a sentence around it */
	timeLeft: (d: number, h: number, m: number, s: number) => string;
	votingClosed: string;
	roomPicking: (code: string) => string;
	openRoom: string;
	/** the bar's way into the room's vote while it picks, where the + was */
	roomGo: string;
	budgetPill: (left: number, budget: number, votes: boolean) => string;
	budgetHelp: (rules: RulesView) => string;

	restHead: string;
	unit: (n: number, votes: boolean) => string;
	/** when, counted back from the open week: "this week", "last week", "3 weeks ago" */
	weeksAgo: (n: number) => string;
	noBackers: string;
	btnAddPoint: string;
	btnVote: string;
	btnVoted: string;
	btnUndo: (s: number) => string;
	btnRenominate: string;
	warnDrops: string;
	/** beside the + of a film about to go: what happens unless somebody uses it */
	rescue: string;
	warnFades: (n: number) => string;

	/* §3.5: a film sitting one round out at its nominator's request */
	holdCta: string;
	holdMine: string;
	/** a sleeper's card, before whose call it was: what is happening to it */
	holdWhat: string;
	holdH: string;
	holdHint: (shortlistSize: number) => string;
	holdWhyPh: string;
	holdBtn: string;
	holdSave: string;
	holdRelease: string;
	holdSpent: (title: string) => string;
	holdSig: (name: string) => string;

	addedBy: (name: string, week: number) => string;
	nomPop: (evening: number) => string;
	nomDone: (title: string) => string;
	listEmpty: string;
	shelfArchive: (n: number) => string;
	shelfDropped: (n: number) => string;

	dAdded: string;
	dBacked: string;
	dNobody: string;
	dEmpty: string;
	dNone: (left: number, votes: boolean) => string;
	dYours: (n: number, votes: boolean) => string;
	dBankLeft: (n: number) => string;
	dWeekLeft: (n: number, budget: number) => string;
	minutes: (n: number) => string;
	fadeNote: (rules: RulesView) => string;
	/** what the score fades to next week if nobody spends anything more on it */
	scoreNext: string;
	/** the score's weeks too old to still add a digit, as one line */
	scoreOlder: string;

	noteQ: string;
	notePh: string;
	noteConfirm: string;
	noteBack: string;
	noteEdit: string;
	noteAdd: string;
	noteSave: string;
	noteCancel: string;
	noteSig: (name: string) => string;

	nomH: string;
	/** the bar's way to the nomination modal: a word, so it is never taken for the cards' + */
	btnAddFilm: string;
	nomHint: string;
	nomPh: string;
	nomSearching: string;
	nomNone: (q: string) => string;
	nomDup: string;
	nomOffline: string;
	nomByHand: (title: string) => string;

	watchedH: string;
	fairH: string;
	seenEmpty: string;
	thWatched: string;

	/* --------------------------------------------------- the statistics screen -- */
	tabStats: string;
	statsH: string;
	tmdbLink: string;
	lensPeople: string;
	lensFilms: string;
	lensVoting: string;
	histIntro: string;
	histOpen: string;
	histNoFilm: string;
	histVoted: (n: number, of: number) => string;
	histFull: (n: number) => string;
	histPoints: (points: number, films: number) => string;
	histOnWinner: (points: number, share: number) => string;
	histRoom: (n: number) => string;
	histSharesH: string;
	histVotedShare: string;
	histFullShare: string;
	histWinnerShare: string;
	habH: string;
	habIntro: string;
	habChartH: string;
	habOneLine: string;
	habAgainLine: string;
	habOwnLine: string;
	habRun: (title: string, rounds: number) => string;
	habHint: string;
	habCardOne: string;
	habCardAgain: string;
	habCardOwn: string;
	habCardLeader: string;
	habCardHalf: string;
	habCardRun: string;
	habPeopleH: string;
	habX: string;
	habY: string;
	habPerson: (rounds: number, of: number, films: string, again: number, own: number) => string;
	eraApp: string;
	eraAll: string;
	eraNoteApp: (from: number, to: number) => string;
	eraNoteAll: (from: number, to: number) => string;
	statsEmpty: string;

	roundsH: string;
	roundsSub: string;
	keyVoted: string;
	keyAttended: string;
	keyRoster: string;

	openH: string;
	/** the same figure named for a card label, where the heading would not fit */
	openTag: string;
	openSub: (votes: boolean) => string;
	/** shown until somebody has been picked, and gone once they have */
	pickHint: string;
	openMine: string;
	openTheirs: string;
	avgOf: (value: string) => string;


	timingH: string;
	timingSub: string;
	tickOpens: string;
	tickHalf: string;
	tickCloses: string;

	engageH: string;
	engageX: string;
	engageY: string;

	rewatchH: string;
	rewatchSub: (evenings: number) => string;
	rewatchTag: string;
	ringH: string;
	ringSub: (votes: boolean) => string;
	ringHint: string;
	ringOut: string;
	ringIn: string;
	ringNone: string;

	/** the compact units the fact cards are written in */
	weeksShort: (n: number) => string;
	/** a film's standing on the list, said in a few words */
	filmState: (status: 'active' | 'dropped' | 'archived') => string;
	bridesH: string;
	bridesSub: string;
	backH: string;
	backSub: string;
	backLine: (drops: number, weeks: number) => string;
	newerH: string;
	newerSub: string;
	newerYear: string;
	newerLen: string;
	newerLine: (from: string, to: string) => string;
	factsH: string;
	factLongest: string;
	factShortest: string;
	factOldest: string;
	factWait: string;
	factLongestWait: string;
	factScore: string;
	factBest: string;
	factWaiting: string;

	decadeH: string;
	genreH: string;
	genreSub: string;
	directorH: string;
	directorNone: string;
	countryH: string;
	countrySub: string;
	countryNone: string;
	runtimeH: string;
	runtimeSub: (min: number, max: number, mean: number) => string;

	youLang: string;
	youPhoto: string;
	youPhone: string;
	qrBody: string;
	youStats: string;
	youRules: string;
	statPoints: string;
	statWatched: string;
	statCampaign: string;
	statNom: string;
	statBank: string;
	statRules: string;
	vUsed: string;
	vOpen: string;
	avatarPick: string;
	avatarChange: string;
	avatarRemove: string;
	avatarHint: string;
	rotateH: string;
	rotateBtn: string;
	rotateNote: string;
	rotated: string;
	/** the XP ladder's rung names; same length as LEVELS in $lib/levels */
	levels: string[];
	youXp: string;
	xpNext: (n: number) => string;
	xpTop: string;
	xpRowAttend: string;
	xpRowVote: string;
	xpRowNominate: string;
	xpRowWatched: string;
	xpLadder: string;
	chlogH: string;
	chlogOk: string;
	/** closesAt is the current round's deadline, so the rules can name the real date */
	rules: (rules: RulesView, closesAt?: string | null) => Rule[];

	hostH: string;
	hostIdle: string;
	hostClose: string;
	/** said to the room off a projector, so it is an instruction, not a label */
	hostJoinH: string;
	hostCastH: string;
	hostCastPick: string;
	hostLock: string;
	hostWinnerH: string;
	hostNoVotes: string;
	hostOnlyFilm: string;
	hostRankingGuest: (n: number) => string;
	hostReplay: string;
	/** §7.3, the unit after a ballot slot's points */
	racePts: (n: number) => string;
	/** the winner is level on points with the runner-up */
	raceTie: string;
	raceShowAll: string;
	raceHideAll: string;
	hostRevealClosed: string;
	hostRevealGo: string;
	hostRevealCounting: string;
	hostHeldH: string;
	roomCode: string;
	/** the face in the room's bar, which leads back to the list */
	roomHome: string;
	roomWho: string;
	roomFilter: string;
	roomGuest: string;
	/** the same person named rather than offered a button, for "voting as ..." */
	roomAsGuest: string;
	roomGuestNote: string;
	roomVotingAs: (name: string) => string;
	roomCheckedIn: string;
	/** §7.2: private rankings remain editable until close. */
	/** §7.3, above the phone's ranking: what each place earns, for n films */
	roomPoints: (n: number) => string;
	roomRankSave: string;
	roomRankSaved: string;
	roomRankUnsaved: string;
	/** under the save once it is pressed: it works both ways */
	roomRankUndo: string;
	roomRankPosition: (n: number) => string;
	roomResults: string;
	/** §7.2: a closed room whose count has not yet run on the projector */
	roomLookUp: string;
	roomLookUpSub: string;
	votes: (n: number) => string;
	turnoutWord: (n: number) => string;

	commentsH: (n: number) => string;
	commentMore: (n: number) => string;
	reactAdd: string;
	dSeen: string;
	seenBtn: string;
	commentNone: string;
	commentPh: string;
	commentSend: string;
	commentDelete: string;
	commentDeleteSure: string;

	tNominated: (title: string) => string;
	tNoteSaved: string;
	tCommented: string;
	tRenominated: (title: string) => string;
	tHeld: (title: string) => string;
	tReleased: (title: string) => string;
	tAvatarSaved: string;
	tAvatarRemoved: string;

	/** the public demo's standing disclaimer, and the three people it can be */
	demoWhat: string;
	demoResets: string;
	demoAs: string;
	demoMember: string;
	demoAdmin: string;
	demoFresh: string;

	/** §3.6: a special round, said from the numbers the round actually runs on */
	spName: (id: string) => string;
	/** the look decides what kind of film the first rule asks for */
	spRules: (s: SpecialView, closesAt?: string | null, look?: string | null) => Rule[];
	/** §3.6: a look an admin can put on the whole site */
	lookName: (id: string) => string;
	spMine: (used: number, max: number) => string;
	/** the bar's + chip, said out loud */
	spAddAria: (left: number) => string;
	/** the same +, greyed once every pick is in, and what a tap on it says: which ones */
	spAddDone: (titles: string[]) => string;
	/** under a nominator's face on a special round's pick */
	spNomPop: (name: string) => string;
	spEmptyH: string;
	spEmpty: string;
	spEmptyCta: string;
	spYes: string;
	spPicking: string;
	spNomH: (name: string) => string;
	spNomHint: (max: number) => string;
	/** §3.6: said before a pick goes up that is the viewer's own film on the list */
	spFromList: string;
	/** §3.7: one of a custom week's rules, as the page lists it and a refusal names it */
	weekRule: (rule: WeekRule) => string;
	/** TMDB's genres, by id */
	genreName: (id: number) => string;
	/** a search result the week's rules already rule out */
	spOff: string;

	error: (code: string, params: ErrorParams, fallback: string) => string;
};

const GENRES_PL: Record<number, string> = { 28: 'Akcja', 12: 'Przygodowy', 16: 'Animacja', 35: 'Komedia', 80: 'Kryminał', 99: 'Dokumentalny', 18: 'Dramat', 10751: 'Familijny', 14: 'Fantasy', 36: 'Historyczny', 27: 'Horror', 10402: 'Muzyczny', 9648: 'Tajemnica', 10749: 'Romans', 878: 'Sci-Fi', 53: 'Thriller', 10752: 'Wojenny', 37: 'Western' };
const CODED_PL: Record<CodedId, string> = { woman_director: 'Wyreżyserowany przez kobietę.' };
const CODED_EN: Record<CodedId, string> = { woman_director: 'Directed by a woman.' };
const GENRES_EN: Record<number, string> = { 28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction', 53: 'Thriller', 10752: 'War', 37: 'Western' };

/* --------------------------------------------------------------- polish -- */

/**
 * The six rules as the group states them, with every number read from the rule
 * set that is actually running. Switching RULES rewrites this text, so it cannot
 * drift from what the engine does.
 */
const plRules = (r: RulesView, closesAt?: string | null): Rule[] => {
	const out: Rule[] = [];
	const votes = isVotes(r);

	if (r.attrition.kind === 'drop') {
		const n = r.attrition.afterWeeksWithoutPoints;
		out.push({ head: `${n} ${plRounds(n)} bez punktów i film wypada.`, body: '' });
	} else {
		const n = r.attrition.afterWeeksAtZero;
		out.push({ head: `${n} ${plRounds(n)} bez głosu i film trafia do archiwum.`, body: '' });
	}

	if (r.banking) {
		out.push({
			head: `Dostajesz ${r.pointsPerWeek} ${plPoints(r.pointsPerWeek)} na rundę i kumulują się, jeśli nie wydasz ich w danej rundzie.`,
			body: `Maksymalnie możesz mieć ${r.bankCap} (jeśli masz ${r.bankCap} i nie zagłosujesz, te ${r.pointsPerWeek} ${plPoints(r.pointsPerWeek)} przepadają).`
		});
	} else if (votes) {
		out.push({
			head: 'Masz jeden głos na rundę.',
			body: 'Wykorzystaj go w danej rundzie albo przepada.'
		});
	} else {
		out.push({
			head: `Dostajesz ${r.pointsPerWeek} ${plPoints(r.pointsPerWeek)} na rundę.`,
			body: 'Niewykorzystane przepadają po wieczorku, nic się nie kumuluje.'
		});
	}

	out.push({
		head: votes
			? 'Twój głos idzie na jeden film.'
			: 'Gdy głosujesz na film, możesz zużyć tyle punktów, ile masz dostępnych.',
		body: votes
			? 'Wybieraj uważnie, bo raz oddany zostaje.'
			: 'Po jednym co rundę, żeby film nie odpadł z listy, albo wszystko naraz, żeby go przepchnąć.'
	});

	out.push({
		head: 'Punktów wydanych na film nie można cofać.',
		body:
			`Masz ${r.voteGraceSeconds} sekund na poprawienie pomyłki. ` +
			'Dotyczy to punktów wydawanych w ciągu rundy: głos w sali można przenosić ' +
			'do samego rozstrzygnięcia.'
	});

	if (r.scoring === 'fade') {
		out.push({
			head: `${votes ? 'Głosy' : 'Punkty'} na filmie tracą co rundę ${fadePercent(r)}% wartości.`,
			body: 'Świeże głosy liczą się najbardziej, te z poprzednich rund powoli wygasają. Film utrzymuje się wysoko tylko wtedy, gdy dostaje świeże głosy co rundę.'
		});
	} else {
		out.push({
			head:
				r.scoring === 'total'
					? `${votes ? 'Głosy' : 'Punkty'} kumulują się na filmie z rundy na rundę.`
					: `Wynik to ta runda plus ${r.decayFactor} poprzedniej.`,
			body: r.scoring === 'total' ? '' : 'Nic nie kumuluje się na długo.'
		});
	}

	out.push({
		head: `${r.nominationsPerWeek === 1 ? 'Jedno' : r.nominationsPerWeek} zgłoszenie na rundę.`,
		body: 'Wykorzystaj w danej rundzie albo przepada.'
	});

	out.push({
		head: closesAt
			? `Głosowanie zamyka się w dniu wieczorku: ${formatNight(closesAt, 'pl')}.`
			: 'Głosowanie zamyka się w dniu wieczorku.',
		body:
			`Terminy ustala kalendarz, więc wieczorek może wypaść w inny dzień niż zwykle. ` +
			`${r.shortlistSize} ${plFilms(r.shortlistSize)} z największą liczbą punktów trafiają do głosowania. ` +
			'Kod QR pojawia się na ekranie i głos mają tylko ci, którzy przyszli. ' +
			'Każdy układa filmy od najlepszego do najsłabszego. Rankingi są prywatne do zamknięcia głosowania. ' +
			`Za miejsca w rankingu film dostaje punkty (${Array.from({ length: r.shortlistSize }, (_, i) => r.shortlistSize - 1 - i).join('/')}); wygrywa najwięcej punktów, a remis rozstrzyga kolejność listy. ` +
			'Jeśli nikt nie zagłosuje, wygrywa najwyższy wynik.'
	});

	out.push({
		head: 'Nie będzie cię na wieczorku? Uśpij swój film na jedną rundę.',
		body:
			'Jeden film na rundę i tylko taki, który sam zgłosiłeś. Nie idzie wtedy pod głosowanie ' +
			'w sali, a jego miejsce zajmuje kolejny z listy. Punkty tracą na wartości normalnie, ' +
			'więc uśpienie kosztuje. Widzą to wszyscy, żeby zdążyli przerzucić głosy gdzie indziej.'
	});

	return out;
};

const pl: Dict = {
	lang: 'pl',
	appTitle: 'Wieczorki filmowe',
	tabList: 'Lista',
	menu: 'Menu',
	close: 'zamknij',
	tabSeen: 'Obejrzane',
	tabYou: 'Ty',
	tabAdmin: 'Panel',

	themeAuto: 'Jak w telefonie',
	themeDark: 'Ciemny',
	themeLight: 'Jasny',
	themeBanana: 'Bananowo',
	accentNames: {
		rose: 'Róż',
		lavender: 'Lawenda',
		periwinkle: 'Barwinek',
		sky: 'Błękit',
		seafoam: 'Morska piana',
		sage: 'Szałwia'
	},

	evening: (n) => `Wieczorek ${n}`,
	outing: (where) => ({ cinema: 'Kino', trip: 'Wyjazd' })[where],
	nightSpecial: 'Wieczór specjalny',
	// tiered: only the unit that matters now, down to seconds in the last minute
	timeLeft: (d, h, m, s) => {
		if (d) return plLeft(d, 'dzień', 'dni', 'dni');
		if (h) return plLeft(h, 'godzina', 'godziny', 'godzin', true);
		if (m) return plLeft(m, 'minuta', 'minuty', 'minut', true);
		return plLeft(s, 'sekunda', 'sekundy', 'sekund', true);
	},
	votingClosed: 'głosowanie zamknięte',
	roomPicking: (code) => `sala wybiera, kod ${code}`,
	openRoom: 'Wybierz film na dziś',
	roomGo: 'Głosuj',
	budgetPill: (left, budget, votes) =>
		votes ? `${left}/${budget} ${plVotes(budget)}` : `${left}/${budget} pkt`,
	budgetHelp: (r) => {
		if (r.banking) {
			return `Dostajesz ${r.pointsPerWeek} ${plPoints(r.pointsPerWeek)} co rundę. Niewydane punkty akumulują się z rundy na rundę, maksymalnie do ${r.bankCap}.`;
		}
		if (isVotes(r)) return 'Masz jeden głos na rundę. Wykorzystaj go albo przepada.';
		return `Dostajesz ${r.pointsPerWeek} ${plPoints(r.pointsPerWeek)} na rundę. Niewykorzystane przepadają po wieczorku.`;
	},

	restHead: 'Reszta listy',
	unit: (n, votes) => (votes ? plVotes(n) : 'pkt'),
	weeksAgo: (n) => (n <= 0 ? 'w tej rundzie' : n === 1 ? 'rundę temu' : `${n} ${plRoundsAcc(n)} temu`),
	noBackers: '0 głosów',
	btnAddPoint: '+1 pkt',
	btnVote: 'Głosuj',
	btnVoted: '✓ twój głos',
	btnUndo: (s) => `Cofnij · ${s} s`,
	btnRenominate: 'Zgłoś ponownie',
	warnDrops: 'odpada w tej rundzie, jeśli nie dostanie głosów',
	rescue: 'odpada bez głosów',
	warnFades: (n) => `znika za ${n} ${plRoundsAcc(n)}`,

	holdCta: 'Uśpij',
	holdMine: 'twoja decyzja',
	holdWhat: 'śpi tę rundę',
	// nie „uśpiony przez Tymka”: imiona się odmieniają, a kropka nie
	holdH: 'Nie będzie cię w tej rundzie?',
	holdHint: (n) =>
		`Uśpiony film nie pójdzie pod głosowanie w sali, a jego miejsce zajmie kolejny z listy ` +
		`(do sali idzie ${n} ${plFilms(n)}). Punkty tracą na wartości normalnie, więc uśpienie kosztuje. ` +
		'Wycofać możesz aż do zamknięcia głosowania.',
	holdWhyPh: 'Czemu? Zobaczą wszyscy…',
	holdBtn: 'Uśpij',
	holdSave: 'Zapisz powód',
	holdRelease: 'Wycofaj',
	holdSpent: (title) => `W tej rundzie uśpiony jest już ${title}.`,
	holdSig: (name) => name,

	addedBy: (name, week) => `${name}, runda ${week}`,
	nomPop: (evening) => `Zgłoszenie na wieczorek ${evening}`,
	nomDone: (title) => `Twoje zgłoszenie w tej rundzie: ${title}`,
	listEmpty: 'Lista jest pusta. Zgłoś coś.',
	shelfArchive: (n) => `Archiwum · ${n} ${plFilms(n)} bez głosów`,
	shelfDropped: (n) => `Wypadły · ${n} ${plFilms(n)} bez wsparcia`,

	dAdded: 'Zgłosił',
	dBacked: 'Wsparcie',
	dNobody: 'nikt',
	dEmpty: 'brak',
	dNone: (n, votes) =>
		`Nie ma tu jeszcze twojego głosu, ${pl3(n, 'został', 'zostały', 'zostało')} ci ${n} ${
			votes ? plVotes(n) : plPoints(n)
		}`,
	dYours: (n, votes) =>
		votes ? `${n} ${plVotes(n)} od ciebie` : `${n} ${plPoints(n)} od ciebie`,
	dBankLeft: (n) => `${n} ${plPoints(n)} w banku`,
	dWeekLeft: (n, budget) => `${n} z ${budget} w tej rundzie`,
	minutes: (n) => `${n} min`,
	fadeNote: (r) => `Punkty tracą ${fadePercent(r)}% wartości co rundę`,
	scoreNext: 'Za rundę',
	scoreOlder: 'wcześniej',

	noteQ: 'Dlaczego ten film? (opcjonalnie)',
	notePh: 'Krótka notka dla reszty…',
	noteConfirm: 'Zgłoś film',
	noteBack: '← wróć',
	noteEdit: 'Edytuj notkę',
	noteAdd: 'Dodaj notkę',
	noteSave: 'Zapisz',
	noteCancel: 'Anuluj',
	noteSig: (name) => name,

	nomH: 'Zgłoś film',
	btnAddFilm: 'Film',
	nomHint: 'Jedno zgłoszenie na osobę w rundzie.',
	nomPh: 'Szukaj po tytule…',
	nomSearching: 'szukam…',
	nomNone: (q) => `Nic nie znaleziono dla „${q}”.`,
	nomDup: 'już jest',
	nomOffline: 'Brak połączenia z TMDB, ale możesz wpisać tytuł ręcznie.',
	nomByHand: (title) => `Zgłoś „${title}” bez danych z TMDB`,

	watchedH: 'Obejrzane',
	fairH: 'Czyje filmy oglądamy',
	seenEmpty: 'Jeszcze żadnego wieczoru.',
	thWatched: 'Obejrzane',
	tabStats: 'Statystyki',
	statsH: 'Statystyki',
	tmdbLink: 'Zobacz na TMDB',
	lensPeople: 'Ludzie',
	lensFilms: 'Filmy',
	lensVoting: 'Głosowanie',
	histIntro:
		'Każda runda listy od pierwszego głosu. Wieczór specjalny nie ma tu osobnego wiersza: punkty wydane przed nim liczą się do rundy, która przyszła po nim.',
	histOpen: 'trwa',
	histNoFilm: 'bez filmu',
	histVoted: (n, of) => `głosowało ${n} z ${of}`,
	histFull: (n) => `wszystko wydało: ${n}`,
	histPoints: (points, films) => `${points} pkt na ${films} ${pl3(films, 'film', 'filmy', 'filmów')}`,
	histOnWinner: (points, share) => `na zwycięzcę ${points} (${share}%)`,
	histRoom: (n) => `w sali: ${n}`,
	histSharesH: 'Jak wydawano punkty',
	histVotedShare: 'głosowali (z wszystkich)',
	histFullShare: 'wydali wszystko (z głosujących)',
	histWinnerShare: 'punkty na zwycięzcę (ze wszystkich)',
	habH: 'Jak ludzie głosują',
	habIntro: 'Od pierwszego głosu do dziś.',
	habChartH: 'Jak dzielono punkty',
	habOneLine: 'wszystko na jeden film (z głosujących)',
	habAgainLine: 'na film popierany już wcześniej (z punktów)',
	habOwnLine: 'na własne zgłoszenie (z punktów)',
	habRun: (title, rounds) => `najdłużej: ${title}, ${rounds} ${pl3(rounds, 'runda', 'rundy', 'rund')} z rzędu`,
	habHint: 'Najedź albo naciśnij rundę lub twarz, żeby zobaczyć szczegóły.',
	habCardOne: 'wszystko na jeden film',
	habCardAgain: 'na film popierany wcześniej',
	habCardOwn: 'na własne zgłoszenie',
	habCardLeader: 'wygrał lider punktów',
	habCardHalf: 'daje połowę punktów',
	habCardRun: 'z rzędu na jeden film',
	habPeopleH: 'Każdy z osobna',
	habX: 'filmów na rundę',
	habY: '% na popierane wcześniej',
	habPerson: (rounds, of, films, again, own) =>
		`głosy w ${rounds} z ${of} rund · średnio ${films} filmu na rundę · ${again}% na popierane wcześniej · ${own}% na własne`,
	eraApp: 'Od startu apki',
	eraAll: 'Cała historia',
	eraNoteApp: (from, to) =>
		`Rundy ${from}-${to}. Wieczory sprzed apki nie mają oddanych głosów, więc średnia z nich nic by nie znaczyła.`,
	eraNoteAll: (from, to) =>
		`Rundy ${from}-${to}, razem z wieczorami sprzed apki. Głosy są tylko z późniejszych rund, więc wszystko, co je liczy, wygląda tu rzadziej.`,
	statsEmpty: 'Za mało rund, żeby cokolwiek z tego wyczytać.',

	roundsH: 'Kto się pojawia',
	roundsSub: 'Ilu zagłosowało i ilu przyszło, runda po rundzie.',
	keyVoted: 'Zagłosowało',
	keyAttended: 'Przyszło',
	keyRoster: 'Wszyscy',

	openH: 'Otwartość na propozycje innych',
	openTag: 'Otwartość',
	pickHint: 'Naciśnij na rząd żeby podświetlić statystyki.',
	openSub: (votes) =>
		`Ile ${votes ? 'głosów' : 'punktów'} każdy oddaje na cudze zgłoszenia, a ile na własne.`,
	openTheirs: 'Na cudze',
	openMine: 'Na swoje',
	avgOf: (value) => `Średnia: ${value}`,


	timingH: 'Kiedy padają głosy',
	timingSub: 'Kropka: kiedy w rundzie padł głos. Kreska: kiedy pada średnio.',
	tickOpens: 'otwarcie',
	tickHalf: 'połowa',
	tickCloses: 'deadline',

	engageH: 'Kto głosuje i kto przychodzi',
	engageX: 'rundy z głosem',
	engageY: 'wieczory na miejscu',

	rewatchH: 'Kto najczęściej oglądał powtórkę',
	rewatchSub: (n) =>
		`Ile z ${n} ${pl3(n, 'obejrzanego filmu', 'obejrzanych filmów', 'obejrzanych filmów')} każdy znał już wcześniej, czyli zaznaczył „Już widziałem” przed ich wieczorkiem.`,
	rewatchTag: 'powtórki',
	ringH: 'Kto kogo wspiera',
	ringSub: (votes) =>
		`Wstążka prowadzi od tego, kto ${votes ? 'głosuje' : 'wydaje punkty'}, do tego, kto zgłosił film, i jest tym grubsza, im więcej poszło. Kropka jest tam, gdzie ${votes ? 'głosy' : 'punkty'} trafiają. Własne filmy nie wchodzą w grę.`,
	ringHint: 'Naciśnij czyjeś zdjęcie, żeby zobaczyć, kogo ta osoba wspiera i kto wspiera ją.',
	ringOut: 'Wspiera',
	ringIn: 'Wspierany przez',
	ringNone: 'nikogo',

	weeksShort: (n) => `${n} ${plRounds(n)}`,
	filmState: (status) =>
		status === 'active' ? 'wciąż na liście' : status === 'dropped' ? 'wypadł' : 'w archiwum',
	bridesH: 'Zawsze druga',
	bridesSub:
		'Filmy, które co najmniej dwa razy trafiły do sali i za każdym razem przegrały. Żaden jeszcze nie został obejrzany.',
	backH: 'Powroty',
	backSub: 'Filmy, które wypadły z listy, a potem ktoś zgłosił je jeszcze raz.',
	backLine: (drops, weeks) =>
		`wypadł ${drops === 1 ? 'raz' : `${drops}×`}, wrócił po ${weeks} ${plRounds(weeks)}`,
	newerH: 'Trendy',
	newerSub:
		'Każdy film w dniu, w którym go obejrzeliśmy. Linia przerywana to ogólny kierunek, falista to mediana dziewięciu filmów wokół. Skala obejmuje 90% filmów, skrajne siedzą na brzegu jako kółka.',
	newerYear: 'Rok premiery',
	newerLen: 'Długość filmu',
	newerLine: (from, to) => `Kierunek: od ${from} do ${to}.`,
	factsH: 'W liczbach',
	factLongest: 'Najdłuższy',
	factShortest: 'Najkrótszy',
	factOldest: 'Najstarszy',
	factWait: 'Średnio czeka',
	factLongestWait: 'Najdłużej czekał',
	factScore: 'Średnio wygrywa z',
	factBest: 'Najwyższy wynik',
	factWaiting: 'Najdłużej czeka',

	decadeH: 'Dekady',
	genreH: 'Gatunki',
	genreSub: 'Film liczy się w każdym swoim gatunku, więc sumy są większe niż liczba filmów.',
	directorH: 'Reżyserzy do których wracamy',
	directorNone: 'Jeszcze do nikogo nie wróciliśmy.',
	countryH: 'Skąd są filmy',
	countrySub: 'Kraje produkcji według TMDB. Koprodukcja liczy się każdemu z krajów. Naciśnij kraj, żeby zobaczyć jego filmy.',
	countryNone: 'Jeszcze nie wiemy, skąd są nasze filmy.',
	runtimeH: 'Długości',
	runtimeSub: (min, max, mean) => `Od ${min} do ${max} minut, typowo ${mean}.`,

	youLang: 'Język',
	youPhoto: 'Zdjęcie profilowe',
	youPhone: 'Dodaj telefon',
	qrBody: 'Otwiera twój prywatny link na innym urządzeniu (np. telefonie)',
	youStats: 'Statystyki',
	youRules: 'Zasady',
	statPoints: 'Punkty wydane od początku',
	statWatched: 'Twoje filmy, które obejrzeliśmy',
	statCampaign: 'Najdłuższa kampania',
	statNom: 'Zgłoszenie w tej rundzie',
	statBank: 'Bank',
	statRules: 'Zasady',
	vUsed: 'wykorzystane',
	vOpen: 'wolne',
	avatarPick: 'Wybierz zdjęcie',
	avatarChange: 'Zmień zdjęcie',
	avatarRemove: 'Usuń',
	avatarHint: 'Widoczne przy twoich głosach',
	rotateH: 'Zgubiłeś link?',
	rotateBtn: 'Wygeneruj nowy link',
	rotateNote: 'Możesz użyć, jeśli chcesz zresetować swój link, stary przestaje wtedy działać',
	rotated: 'Nowy link gotowy. Każde twoje inne urządzenie musi zeskanować kod jeszcze raz.',
	levels: [
		'Widz',
		'Bywalec',
		'Zapaleniec',
		'Kinofil',
		'Kinoman',
		'Maniak kina',
		'Znawca',
		'Koneser',
		'Krytyk',
		'Kurator',
		'Ikona',
		'Legenda kina'
	],
	youXp: 'Doświadczenie',
	xpNext: (n) => `${n} XP do następnego poziomu`,
	xpTop: 'najwyższy poziom',
	xpRowAttend: 'Wieczorki',
	xpRowVote: 'Rundy z głosem',
	xpRowNominate: 'Zgłoszenia',
	xpRowWatched: 'Twoje filmy obejrzane',
	xpLadder: 'Wszystkie poziomy',
	chlogH: 'Changelog',
	chlogOk: 'OK',
	rules: plRules,

	hostH: 'Prowadzący',
	hostIdle: 'Sala jeszcze nie głosuje',
	hostClose: 'Zamknij rundę teraz',
	hostJoinH: 'Zeskanuj, żeby głosować',
	hostCastH: 'Zagłosuj za kogoś, komu padł telefon',
	hostCastPick: 'Ułóż filmy w jego kolejności. Nie rób tego na projektorze, jeśli ranking ma pozostać prywatny.',
	hostLock: 'Zatwierdź i puszczaj film',
	hostWinnerH: 'Dzisiaj oglądamy',
	hostNoVotes: 'Nikt nie zagłosował. Wybraliśmy film według wyniku z tej rundy, a przy remisie według starszeństwa zgłoszenia.',
	hostOnlyFilm: 'W finale był tylko jeden film, więc sala go potwierdziła.',
	hostRankingGuest: (n) => `Gość ${n}`,
	hostReplay: 'Policz jeszcze raz',
	racePts: () => 'pkt',
	raceTie: 'Remis w punktach rozstrzyga wynik z rundy, a potem starsze zgłoszenie.',
	raceShowAll: 'Pokaż wszystkie głosy',
	raceHideAll: 'Ukryj głosy',
	hostRevealClosed: 'Głosowanie zamknięte',
	hostRevealGo: 'Liczymy!',
	hostRevealCounting: 'Liczymy głosy',
	hostHeldH: 'Uśpione do następnego razu',
	roomCode: 'kod sali',
	roomHome: 'Wróć do strony głównej',
	roomWho: 'Kto ty jesteś?',
	roomFilter: 'zacznij pisać imię',
	roomGuest: 'Jestem gościem',
	roomAsGuest: 'gość',
	roomGuestNote: 'Nie ma cię na liście? Zagłosuj jako gość, w sali też się liczy.',
	roomVotingAs: (name) => `głosujesz jako ${name}`,
	roomCheckedIn: 'obecność zapisana ✓',
	roomPoints: (n) =>
		Array.from({ length: n }, (_, i) => {
			const worth = n - 1 - i;
			const place = i === n - 1 ? 'ostatnie' : `${i + 1}. miejsce`;
			return `${place}: ${worth} ${pl3(worth, 'punkt', 'punkty', 'punktów')}`;
		})
			.join(', ')
			.replace(/^./, (c) => c.toUpperCase()) + '. Wygrywa film z największą sumą.',
	roomRankSave: 'Zapisz ranking',
	roomRankSaved: 'Ranking zapisany ✓',
	roomRankUnsaved: 'Zmiany niezapisane. Poprzedni ranking nadal się liczy.',
	roomRankUndo: 'dotknij, żeby wycofać',
	roomRankPosition: (n) => `miejsce ${n}`,
	roomResults: 'Jak wybraliśmy film',
	roomLookUp: 'Patrz na ekran',
	roomLookUpSub: 'Głosowanie zamknięte. Wynik pojawi się tutaj, kiedy sala zobaczy go na ekranie.',
	votes: (n) => `${n} ${plVotes(n)}`,
	turnoutWord: (n) => pl3(n, 'osoba zagłosowała', 'osoby zagłosowały', 'osób zagłosowało'),

	commentsH: (n) => `${n} ${pl3(n, 'komentarz', 'komentarze', 'komentarzy')}`,
	commentNone: 'Nikt jeszcze nic nie napisał.',
	commentMore: (n) => `…i jeszcze ${n}`,
	reactAdd: 'Dodaj reakcję',
	dSeen: 'Kto już widział',
	seenBtn: 'Już widziałem',
	commentPh: 'Napisz komentarz…',
	commentSend: 'Dodaj komentarz',
	commentDelete: 'Usuń',
	commentDeleteSure: 'Na pewno?',

	tNominated: (title) => `Zgłoszono: ${title}`,
	tNoteSaved: 'Notka zapisana',
	tCommented: 'Komentarz dodany',
	tRenominated: (title) => `Zgłoszono ponownie: ${title}, start od zera`,
	tHeld: (title) => `${title} uśpiony do następnego razu`,
	tReleased: (title) => `${title} znowu gra o dziś`,
	tAvatarSaved: 'Zdjęcie zapisane',
	tAvatarRemoved: 'Zdjęcie usunięte',

	demoWhat:
		'To jest demo. Imiona, twarze i komentarze są zmyślone; filmy, wyniki, punkty i cała historia są prawdziwe.',
	demoResets: 'Kopia odtwarza się co godzinę, więc możesz tu klikać do woli.',
	demoAs: 'jesteś jako',
	demoMember: 'uczestnik',
	demoAdmin: 'admin',
	demoFresh: 'ktoś, kto jeszcze nie głosował',

	spName: (id) => (id === 'halloween' ? 'Halloween' : 'Wieczór specjalny'),
	spRules: (s, closesAt, look) => [
		{
			head: `${s.picksPerPerson} ${pl3(s.picksPerPerson, 'propozycja', 'propozycje', 'propozycji')} na osobę.`,
			body: s.custom?.about
				? s.custom.about
				: look === 'halloween'
					? 'Coś spooky, scary i dziwnego, najlepiej nieoczywistego.'
					: look === 'swieta'
						? 'Coś na zimowy wieczór: świątecznego albo wcale, byle pod koc.'
						: look === 'prl'
							? 'Coś jak z plakatu z polskiej szkoły: polskie kino, kino zza żelaznej kurtyny albo po prostu coś starego.'
							: look === 'folk'
								? 'Coś z ludowej skrzyni: baśnie, mity i legendy, folk horror, kino słowiańskie albo po prostu wieś, las i to, co w nim straszy.'
								: 'Coś, co chcesz obejrzeć z resztą, najlepiej nieoczywistego.'
		},
		...(s.custom && rulesOf(s.custom.rules).length
			? [
					{
						head: 'Film musi spełniać zasady tygodnia.',
						body: rulesOf(s.custom.rules).map((rule) => pl.weekRule(rule)).join(' ')
					}
				]
			: []),
		{
			head: 'Zaznacz każdy film, który chcesz zobaczyć.',
			body: 'Bez limitu (swoje też). Zdanie można zmieniać do zamknięcia głosowania.'
		},
		{
			head: 'Wyniki są ukryte do końca głosowania.',
			body:
				'Widać tylko, kto już zagłosował. ' +
				(closesAt ? `Głosowanie zamyka się ${formatNight(closesAt, 'pl')}. ` : '') +
				`${s.shortlistSize} ${plFilms(s.shortlistSize)} z największą liczbą zaznaczeń wybieramy jak zawsze.`
		},
		{
			head: 'Zwykła lista jest uśpiona w tej rundzie.',
			body: 'Nic nie traci na wartości i nic nie odpada. Po tym wieczorze lista wraca do stanu sprzed niego.'
		}
	],
	lookName: (id) =>
		id === 'halloween'
			? 'Halloween'
			: id === 'swieta'
				? 'Święta'
				: id === 'prl'
					? 'PRL'
					: id === 'folk'
						? 'Ludowo'
						: id,
	spMine: (used, max) => `Twoje propozycje: ${used} z ${max}`,
	spAddAria: (left) => `Zgłoś film, ${plLeft(left, 'propozycja', 'propozycje', 'propozycji', true)}`,
	spAddDone: (titles) =>
		`${titles.length > 1 ? 'Twoje propozycje' : 'Twoja propozycja'}: ${titles.join(', ')}`,
	spNomPop: (name) => `Propozycja na ${name}`,
	spEmptyH: 'Jeszcze pusto.',
	spEmpty: 'Zgłoś pierwszy film.',
	spEmptyCta: 'Zgłoś film',
	spYes: 'Chcę obejrzeć',
	spPicking: 'Głosowanie zamknięte. Sala wybiera najczęściej zaznaczane.',
	spNomH: (name) => `Zgłoś film na ${name}`,
	spNomHint: (max) =>
		`${max} ${pl3(max, 'propozycja', 'propozycje', 'propozycji')} na osobę, bez powtórek.`,
	spFromList:
		'To twój film z listy. Jeśli wygra ten wieczór, oglądamy go i znika z listy. Jeśli przegra, zostaje na liście, jakby nic się nie stało.',
	weekRule: (rule) => {
		const minutes = (n: number) => `${n} ${pl3(n, 'minuta', 'minuty', 'minut')}`;
		switch (rule.kind) {
			case 'countries':
				return `Kraj produkcji: ${oneOf('pl', 'region', rule.codes)}.`;
			case 'languages':
				return `Język oryginału: ${oneOf('pl', 'language', rule.codes)}.`;
			case 'genres':
				return `Gatunek: ${orList('pl', rule.ids.map((id) => (GENRES_PL[id] ?? String(id)).toLowerCase()))}.`;
			case 'years':
				if (rule.from != null && rule.to != null) return `Z lat ${rule.from}-${rule.to}.`;
				return rule.from != null ? `Z ${rule.from} roku albo późniejszy.` : `Z ${rule.to} roku albo wcześniejszy.`;
			case 'runtime':
				if (rule.min != null && rule.max != null) return `Od ${rule.min} do ${minutes(rule.max)}.`;
				return rule.max != null ? `Najwyżej ${minutes(rule.max)}.` : `Co najmniej ${minutes(rule.min ?? 0)}.`;
			case 'directors':
				return `Reżyseria: ${orList('pl', rule.names)}.`;
			case 'coded':
				return CODED_PL[rule.id];
			case 'tmdb':
				return 'Film musi pochodzić z wyszukiwarki TMDB, żeby dało się sprawdzić zasady.';
		}
	},
	genreName: (id) => GENRES_PL[id] ?? String(id),
	spOff: 'nie pasuje do zasad tygodnia',

	error: (code, p, fallback) => {
		switch (code) {
			case 'no_week':
				return 'Żadna runda nie jest jeszcze otwarta.';
			case 'room_picking':
				return 'Głosowanie zamknięte, sala właśnie wybiera film.';
			case 'week_closed':
				return 'Głosowanie w tej rundzie jest zamknięte.';
			case 'deadline_passed':
				return 'Głosowanie już się zamknęło, film się zaczyna.';
			case 'already_nominated':
				return 'Masz już zgłoszenie w tej rundzie.';
			case 'no_title':
				return 'Podaj tytuł filmu.';
			case 'dup_watched':
				return `${p.title} oglądaliśmy na wieczorku ${p.evening}.`;
			case 'dup_archived':
				return `${p.title} jest w archiwum; jeden głos go przywraca.`;
			case 'dup_active':
				return `${p.title} jest już na liście.`;
			case 'no_film':
				return 'Nie ma takiego filmu.';
			case 'not_dropped':
				return 'Ten film nie wypadł z listy.';
			case 'watched_already':
				return `${p.title} już oglądaliśmy.`;
			case 'film_dropped':
				return `${p.title} wypadł z listy; zgłoś go ponownie.`;
			case 'bad_points':
				return 'Punkty muszą być liczbą całkowitą.';
			case 'votes_final':
				return `Punkt wydany na film jest ostateczny. Na cofnięcie pomyłki masz ${p.seconds} s od kliknięcia.`;
			case 'not_enough_points':
				return `Zostało ci ${p.left} z ${p.allowance}, więc ${p.points} to za dużo.`;
			case 'note_too_long':
				return `Notka może mieć najwyżej ${p.max} znaków.`;
			case 'title_too_long':
				return `Tytuł może mieć najwyżej ${p.max} znaków.`;
			case 'overview_too_long':
				return `Opis może mieć najwyżej ${p.max} znaków.`;
			case 'bad_poster':
				return 'Plakat musi pochodzić z TMDB.';
			case 'not_your_note':
				return 'Notkę zmienia tylko ten, kto zgłosił film.';
			case 'not_your_film':
				return 'Wstrzymać film może tylko ten, kto go zgłosił.';
			case 'hold_not_active':
				return `${p.title} nie jest na liście.`;
			case 'hold_taken':
				return `W tej rundzie uśpiony jest już ${p.title}.`;
			case 'empty_file':
				return 'Pusty plik.';
			case 'avatar_too_big':
				return `Zdjęcie jest za duże, maksymalnie ${p.mb} MB.`;
			case 'avatar_not_image':
				return 'To nie jest JPEG, PNG ani WebP.';
			case 'no_runoff':
				return 'Sala nie głosuje.';
			case 'runoff_decided':
				return 'Ten wieczór jest już rozstrzygnięty.';
			case 'runoff_expired':
				return 'Głosowanie w sali wygasło.';
			case 'film_not_in_runoff':
				return 'Tego filmu nie ma w dzisiejszej trójce.';
			case 'invalid_ranking':
				return 'Ułóż wszystkie filmy, każdy dokładnie raz.';
			case 'empty_comment':
				return 'Napisz najpierw coś.';
			case 'comment_too_long':
				return `Komentarz może mieć najwyżej ${p.max} znaków.`;
			case 'no_comment':
				return 'Nie ma takiego komentarza.';
			case 'demo_no_upload':
				return 'W demo nie wgrywamy zdjęć.';
			case 'demo_no_rotate':
				return 'W demo nie ma linków do zmiany.';
			case 'no_person':
				return 'Nie ma takiej osoby na liście.';
			case 'list_asleep':
				return 'Zwykła lista śpi do końca rundy specjalnej.';
			case 'no_special':
				return 'Ta runda nie jest specjalna.';
			case 'picks_spent':
				return `Masz już ${p.max} ${pl3(Number(p.max), 'propozycję', 'propozycje', 'propozycji')}, więcej się nie da.`;
			case 'from_list_unconfirmed':
				return `${p.title} to twój film z listy. Jeśli wygra ten wieczór, zniknie z listy. Wybierz go jeszcze raz, żeby to potwierdzić.`;
			case 'not_a_pick':
				return 'To nie jest żadna z propozycji tej rundy.';
			case 'special_pick':
				return `Na ${p.title} nie daje się punktów, tylko się go zaznacza.`;
			case 'off_theme':
				return offTheme('pl', p, fallback);
			default:
				return fallback;
		}
	}
};

/* -------------------------------------------------------------- english -- */

const enRules = (r: RulesView, closesAt?: string | null): Rule[] => {
	const out: Rule[] = [];
	const votes = isVotes(r);

	if (r.attrition.kind === 'drop') {
		const n = r.attrition.afterWeeksWithoutPoints;
		out.push({ head: `${n} silent ${en2(n, 'round', 'rounds')} and a film drops.`, body: '' });
	} else {
		const n = r.attrition.afterWeeksAtZero;
		out.push({ head: `${n} silent ${en2(n, 'round', 'rounds')} and a film is archived.`, body: '' });
	}

	if (r.banking) {
		out.push({
			head: `You get ${r.pointsPerWeek} points a round, and they carry over if you do not spend them.`,
			body: `You can hold ${r.bankCap} at most (on ${r.bankCap} already, a round without voting loses that round's ${r.pointsPerWeek}).`
		});
	} else if (votes) {
		out.push({
			head: 'One vote a round.',
			body: 'Use it that round or lose it.'
		});
	} else {
		out.push({
			head: `You get ${r.pointsPerWeek} points a round.`,
			body: 'Anything unspent is gone after the night; nothing carries over.'
		});
	}

	out.push({
		head: votes ? 'Your vote goes on one film.' : 'You can spend as many points on a film as you have.',
		body: votes
			? 'Pick carefully; once cast it stays.'
			: 'One a round to keep a film on the list, or the lot at once to force it through.'
	});

	out.push({
		head: 'A cast vote cannot be taken back.',
		body:
			`You get ${r.voteGraceSeconds} seconds to fix a slip, then it stands and points can only ` +
			'be added. That is the points for the round; a vote in the room moves freely until the night is decided.'
	});

	if (r.scoring === 'fade') {
		out.push({
			head: `${votes ? 'Votes' : 'Points'} on a film lose ${fadePercent(r)}% of their value each round.`,
			body: 'Fresh votes weigh the most and old ones slowly fade, so a film stays high only while somebody still wants it.'
		});
	} else {
		out.push({
			head:
				r.scoring === 'total'
					? `${votes ? 'Votes' : 'Points'} accumulate on a film round after round.`
					: `A score is this round plus ${r.decayFactor} of the last.`,
			body: r.scoring === 'total' ? '' : 'Nothing accumulates for long.'
		});
	}

	out.push({
		head: `${r.nominationsPerWeek === 1 ? 'One' : r.nominationsPerWeek} nomination a round.`,
		body: 'Use it that round or lose it.'
	});

	out.push({
		head: closesAt
			? `Voting closes on the night itself: ${formatNight(closesAt, 'en')}.`
			: 'Voting closes on the night itself.',
		body:
			'The dates come from the calendar, so a film night can land on a different day than usual. ' +
			`The ${r.shortlistSize} films with the most points go to the vote. ` +
			'A QR goes up on the screen and only the people who turned up get a say. ' +
			'Everyone ranks the films from favourite to least favourite, privately until voting closes. ' +
			`Each place earns points (${Array.from({ length: r.shortlistSize }, (_, i) => r.shortlistSize - 1 - i).join('/')}); the most points wins, and shortlist order breaks a tie. ` +
			'If nobody votes, the highest score wins.'
	});

	out.push({
		head: 'Not coming on the night? Put your film to sleep for a round.',
		body:
			'One film a round, and only one you nominated yourself. It stays out of the room vote and ' +
			'the next film on the list takes its place. Its points fade as usual, so waiting costs ' +
			'something. Everyone sees it, so there is time to put votes somewhere else.'
	});

	return out;
};

const en: Dict = {
	lang: 'en',
	appTitle: 'Film Night',
	tabList: 'List',
	menu: 'Menu',
	close: 'close',
	tabSeen: 'Watched',
	tabYou: 'You',
	tabAdmin: 'Admin',

	themeAuto: 'Match the phone',
	themeDark: 'Dark',
	themeLight: 'Light',
	themeBanana: 'Bananas',
	accentNames: {
		rose: 'Rose',
		lavender: 'Lavender',
		periwinkle: 'Periwinkle',
		sky: 'Sky',
		seafoam: 'Seafoam',
		sage: 'Sage'
	},

	evening: (n) => `Night ${n}`,
	outing: (where) => ({ cinema: 'Cinema', trip: 'Trip' })[where],
	nightSpecial: 'Special night',
	// tiered: only the unit that matters now, down to seconds in the last minute
	timeLeft: (d, h, m, s) =>
		d
			? `${d} ${en2(d, 'day', 'days')} left`
			: h
				? `${h} ${en2(h, 'hour', 'hours')} left`
				: m
					? `${m} min left`
					: `${s} s left`,
	votingClosed: 'voting is closed',
	roomPicking: (code) => `the room is picking, code ${code}`,
	openRoom: "Pick tonight's film",
	roomGo: 'Vote',
	budgetPill: (left, budget, votes) =>
		votes ? `${left}/${budget} ${en2(budget, 'vote', 'votes')}` : `${left}/${budget} pts`,
	budgetHelp: (r) => {
		if (r.banking) {
			return `You get ${r.pointsPerWeek} points every round. Unspent points accumulate round to round, up to ${r.bankCap}.`;
		}
		if (isVotes(r)) return 'One vote a round. Use it or lose it.';
		return `You get ${r.pointsPerWeek} points a round. Anything unspent is gone after the night.`;
	},

	restHead: 'The rest',
	unit: (n, votes) => (votes ? en2(n, 'vote', 'votes') : en2(n, 'pt', 'pts')),
	weeksAgo: (n) => (n <= 0 ? 'this round' : n === 1 ? 'last round' : `${n} rounds ago`),
	noBackers: '0 votes',
	btnAddPoint: '+1 point',
	btnVote: 'Vote',
	btnVoted: '✓ your vote',
	btnUndo: (s) => `Undo · ${s} s`,
	btnRenominate: 'Re-nominate',
	warnDrops: 'drops this round unless it gets votes',
	rescue: 'drops without votes',
	warnFades: (n) => `fades in ${n} ${en2(n, 'round', 'rounds')}`,

	holdCta: 'Put to sleep',
	holdMine: 'your call',
	holdWhat: 'sitting this round out',
	holdH: 'Not going to make it this round?',
	holdHint: (n) =>
		`Your film then stays out of the room's vote and the next one on the list takes its place ` +
		`(${n} ${en2(n, 'film goes', 'films go')} to the room). Its points fade as usual, so waiting costs ` +
		'something. You can undo it right up to the close.',
	holdWhyPh: 'Why? Everyone sees this…',
	holdBtn: 'Put to sleep',
	holdSave: 'Save the reason',
	holdRelease: 'Put it back',
	holdSpent: (title) => `${title} is already asleep this round.`,
	holdSig: (name) => name,

	addedBy: (name, week) => `${name}, round ${week}`,
	nomPop: (evening) => `Nominated for night ${evening}`,
	nomDone: (title) => `You nominated ${title} this round`,
	listEmpty: 'Nothing on the list. Nominate something.',
	shelfArchive: (n) => `Archive · ${n} ${en2(n, 'film', 'films')} nobody has voted for`,
	shelfDropped: (n) => `Dropped · ${n} ${en2(n, 'film', 'films')} that ran out of support`,

	dAdded: 'Nominated by',
	dBacked: 'Backed by',
	dNobody: 'nobody yet',
	dEmpty: 'unknown',
	dNone: (n, votes) =>
		`You haven't backed this yet, you have ${n} ${votes ? en2(n, 'vote', 'votes') : en2(n, 'point', 'points')} left`,
	dYours: (n, votes) =>
		`${n} ${votes ? en2(n, 'vote', 'votes') : en2(n, 'point', 'points')} from you`,
	dBankLeft: (n) => `${n} left in your bank`,
	dWeekLeft: (n, budget) => `${n} of ${budget} left this round`,
	minutes: (n) => `${n} min`,
	fadeNote: (r) => `Points lose ${fadePercent(r)}% of their value each round`,
	scoreNext: 'Next round',
	scoreOlder: 'earlier',

	noteQ: 'Why this one? (optional)',
	notePh: 'A short note for the others…',
	noteConfirm: 'Nominate',
	noteBack: '← back',
	noteEdit: 'Edit note',
	noteAdd: 'Add a note',
	noteSave: 'Save',
	noteCancel: 'Cancel',
	noteSig: (name) => name,

	nomH: 'Nominate a film',
	btnAddFilm: 'Film',
	nomHint: 'One nomination per person per round.',
	nomPh: 'Search by title…',
	nomSearching: 'searching…',
	nomNone: (q) => `Nothing found for “${q}”.`,
	nomDup: 'already here',
	nomOffline: "Couldn't reach TMDB, but you can still type a title by hand.",
	nomByHand: (title) => `Nominate “${title}” with no TMDB data`,

	watchedH: 'Watched',
	fairH: 'Who gets their films watched',
	seenEmpty: 'No film nights yet.',
	thWatched: 'Watched',
	tabStats: 'Stats',
	statsH: 'Statistics',
	tmdbLink: 'See it on TMDB',
	lensPeople: 'People',
	lensFilms: 'Films',
	lensVoting: 'Voting',
	histIntro:
		'Every list round since the first vote. A special night has no row of its own: points spent before it count towards the round that came after it.',
	histOpen: 'still open',
	histNoFilm: 'no film',
	histVoted: (n, of) => `${n} of ${of} voted`,
	histFull: (n) => `${n} spent it all`,
	histPoints: (points, films) => `${points} pts on ${films} ${films === 1 ? 'film' : 'films'}`,
	histOnWinner: (points, share) => `${points} on the winner (${share}%)`,
	histRoom: (n) => `${n} in the room`,
	histSharesH: 'How the points went',
	histVotedShare: 'voted (of everyone)',
	histFullShare: 'spent it all (of those who voted)',
	histWinnerShare: 'points on the winner (of all points)',
	habH: 'How people vote',
	habIntro: 'From the first vote to today.',
	habChartH: 'How the points were split',
	habOneLine: 'all on one film (of voters)',
	habAgainLine: 'to a film backed before (of points)',
	habOwnLine: 'to their own nomination (of points)',
	habRun: (title, rounds) => `longest: ${title}, ${rounds} rounds in a row`,
	habHint: 'Point at or press a round or a face for the details.',
	habCardOne: 'all on one film',
	habCardAgain: 'to a film backed before',
	habCardOwn: 'to their own nomination',
	habCardLeader: 'points leader won',
	habCardHalf: 'give half the points',
	habCardRun: 'rounds in a row, one film',
	habPeopleH: 'Each person',
	habX: 'films a round',
	habY: '% to films backed before',
	habPerson: (rounds, of, films, again, own) =>
		`voted in ${rounds} of ${of} rounds · ${films} films a round · ${again}% to films backed before · ${own}% own`,
	eraApp: 'Since the app',
	eraAll: 'All time',
	eraNoteApp: (from, to) =>
		`Rounds ${from}-${to}. The nights before the app have no ballots behind them, so an average taken over those would mean nothing.`,
	eraNoteAll: (from, to) =>
		`Rounds ${from}-${to}, the nights before the app included. Ballots only exist for the later rounds, so anything counted in votes looks thinner here.`,
	statsEmpty: 'Not enough rounds to read anything into yet.',

	roundsH: 'Who shows up',
	roundsSub: 'How many voted and how many came, round by round.',
	keyVoted: 'Voted',
	keyAttended: 'In the room',
	keyRoster: 'The roster',

	openH: "Openness to other people's picks",
	openTag: 'Openness',
	pickHint: 'Press a row to light up its stats.',
	openSub: (votes) =>
		`How much of each person's ${votes ? 'voting' : 'spending'} goes to everyone else's films, and how much to the ones they nominated themselves.`,
	openTheirs: "Other people's",
	openMine: 'Own films',
	avgOf: (value) => `Average: ${value}`,


	timingH: 'When the votes land',
	timingSub: 'A dot: when in the round a vote was cast. The pip: when one usually is.',
	tickOpens: 'opens',
	tickHalf: 'halfway',
	tickCloses: 'deadline',

	engageH: 'Who votes and who turns up',
	engageX: 'rounds voted in',
	engageY: 'nights in the room',

	rewatchH: 'Who sat through the most rewatches',
	rewatchSub: (n) =>
		`How many of the ${n} ${en2(n, 'film', 'films')} we watched each person knew already, going by the “Seen it already” they ticked before its evening.`,
	rewatchTag: 'rewatches',
	ringH: 'Who backs whom',
	ringSub: (votes) =>
		`A ribbon runs from whoever ${votes ? 'votes' : 'spends points'} to whoever nominated the film, and the more went, the thicker it is. The dot is where the ${votes ? 'votes' : 'points'} land. Your own films do not count.`,
	ringHint: 'Press anyone\'s photo to see who they back and who backs them.',
	ringOut: 'Backs',
	ringIn: 'Backed by',
	ringNone: 'nobody',

	weeksShort: (n) => `${n} ${en2(n, 'round', 'rounds')}`,
	filmState: (status) =>
		status === 'active' ? 'still on the list' : status === 'dropped' ? 'dropped' : 'archived',
	bridesH: 'Always the bridesmaid',
	bridesSub:
		'Films that reached the room at least twice and lost every time. None has been watched yet.',
	backH: 'Comebacks',
	backSub: 'Films that dropped off the list and were nominated again.',
	backLine: (drops, weeks) =>
		`dropped ${drops === 1 ? 'once' : `${drops}×`}, back ${weeks} ${en2(weeks, 'round', 'rounds')} later`,
	newerH: 'Trends',
	newerSub:
		'Every film on the day we watched it. The dashed line is the overall direction, the wavy one the median of the nine films around each. The scale covers 90% of the films; the extremes sit on the edge as rings.',
	newerYear: 'Release year',
	newerLen: 'Running time',
	newerLine: (from, to) => `Direction: from ${from} to ${to}.`,
	factsH: 'In numbers',
	factLongest: 'Longest',
	factShortest: 'Shortest',
	factOldest: 'Oldest',
	factWait: 'Typical wait',
	factLongestWait: 'Longest wait',
	factScore: 'Typically wins with',
	factBest: 'Highest score',
	factWaiting: 'Longest on the list',

	decadeH: 'Decades',
	genreH: 'Genres',
	genreSub: 'A film counts under each of its genres, so these add up to more than the films.',
	directorH: 'Directors we come back to',
	directorNone: 'Nobody twice yet.',
	countryH: 'Where the films come from',
	countrySub: 'Production countries as TMDB lists them. A co-production counts for every country in it. Tap a country to see its films.',
	countryNone: 'We do not know where our films come from yet.',
	runtimeH: 'Runtimes',
	runtimeSub: (min, max, mean) => `From ${min} to ${max} minutes, typically ${mean}.`,

	youLang: 'Language',
	youPhoto: 'Profile picture',
	youPhone: 'Add your phone',
	qrBody: 'Opens your personal link on another device (your phone, say)',
	youStats: 'Statistics',
	youRules: 'The rules',
	statPoints: 'Points spent, all time',
	statWatched: 'Your nominations we watched',
	statCampaign: 'Longest campaign',
	statNom: 'Nomination this round',
	statBank: 'Bank',
	statRules: 'Rule set',
	vUsed: 'used',
	vOpen: 'open',
	avatarPick: 'Choose a picture',
	avatarChange: 'Change picture',
	avatarRemove: 'Remove',
	avatarHint: 'Shown next to your votes',
	rotateH: 'Lost the link?',
	rotateBtn: 'Issue a new link',
	rotateNote: 'Use this if you want to reset your link; the old one then stops working',
	rotated: 'New link issued. Every other device of yours needs to scan again.',
	levels: [
		'Viewer',
		'Regular',
		'Enthusiast',
		'Film Buff',
		'Cinephile',
		'Film Fanatic',
		'Aficionado',
		'Connoisseur',
		'Critic',
		'Curator',
		'Icon',
		'Screen Legend'
	],
	youXp: 'Experience',
	xpNext: (n) => `${n} XP to the next level`,
	xpTop: 'top level',
	xpRowAttend: 'Nights attended',
	xpRowVote: 'Rounds voted',
	xpRowNominate: 'Nominations',
	xpRowWatched: 'Your films watched',
	xpLadder: 'All levels',
	chlogH: "What's new",
	chlogOk: 'Got it',
	rules: enRules,

	hostH: 'Host',
	hostIdle: 'The room is not voting yet',
	hostClose: 'Close the round now',
	hostJoinH: 'Scan to vote',
	hostCastH: 'Cast for someone whose phone is dead',
	hostCastPick: 'Enter their ranking. Use a screen that is not projected if they want it kept private.',
	hostLock: 'Lock it in and start the film',
	hostWinnerH: 'Tonight we are watching',
	hostNoVotes: 'Nobody voted. The score this round decided, with older nominations breaking a tie.',
	hostOnlyFilm: 'There was only one shortlisted film, so the room confirmed it.',
	hostRankingGuest: (n) => `Guest ${n}`,
	hostReplay: 'Count again',
	racePts: (n) => (n === 1 ? 'pt' : 'pts'),
	raceTie: 'A tie on points goes to the higher score this round, then the older nomination.',
	raceShowAll: 'Show every vote',
	raceHideAll: 'Hide the votes',
	hostRevealClosed: 'Voting is closed',
	hostRevealGo: 'Count the votes!',
	hostRevealCounting: 'Counting the votes',
	hostHeldH: 'Asleep until another night',
	roomCode: 'room code',
	roomHome: 'Back to the main page',
	roomWho: 'Who are you?',
	roomFilter: 'type to filter',
	roomGuest: "I'm a guest",
	roomAsGuest: 'a guest',
	roomGuestNote: 'Not on the list? Vote as a guest; it still counts in the room.',
	roomVotingAs: (name) => `voting as ${name}`,
	roomCheckedIn: 'checked in ✓',
	roomPoints: (n) =>
		Array.from({ length: n }, (_, i) => {
			const worth = n - 1 - i;
			const place = i === n - 1 ? 'last' : i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`;
			return `${place} gets ${worth} ${en2(worth, 'point', 'points')}`;
		})
			.join(', ')
			.replace(/^./, (c) => c.toUpperCase()) + '. The film with the most points wins.',
	roomRankSave: 'Save ranking',
	roomRankSaved: 'Ranking saved ✓',
	roomRankUnsaved: 'Unsaved changes. Your previous ranking still counts.',
	roomRankUndo: 'tap to take it back',
	roomRankPosition: (n) => `rank ${n}`,
	roomResults: 'How we chose the film',
	roomLookUp: 'Look at the screen',
	roomLookUpSub: 'Voting is closed. The result shows up here once the room has seen it on the screen.',
	votes: (n) => `${n} ${en2(n, 'vote', 'votes')}`,
	turnoutWord: (n) => `${en2(n, 'person', 'people')} voted`,

	commentsH: (n) => `${n} ${en2(n, 'comment', 'comments')}`,
	commentNone: 'Nobody has said anything yet.',
	commentMore: (n) => `…and ${n} more`,
	reactAdd: 'Add a reaction',
	dSeen: 'Seen it before',
	seenBtn: 'Seen it already',
	commentPh: 'Add your two cents…',
	commentSend: 'Add comment',
	commentDelete: 'Delete',
	commentDeleteSure: 'Sure?',

	tNominated: (title) => `Nominated ${title}`,
	tNoteSaved: 'Note saved',
	tCommented: 'Comment added',
	tRenominated: (title) => `Re-nominated ${title}, starting from zero`,
	tHeld: (title) => `${title} is asleep until another night`,
	tReleased: (title) => `${title} is in the running again`,
	tAvatarSaved: 'Picture saved',
	tAvatarRemoved: 'Picture removed',

	demoWhat:
		'This is a demo. The names, the faces and the comments are invented; the films, the scores, the points and the whole history are real.',
	demoResets: 'The copy is rebuilt every hour, so click anything you like.',
	demoAs: 'you are',
	demoMember: 'a member',
	demoAdmin: 'the admin',
	demoFresh: 'someone who has not voted yet',

	spName: (id) => (id === 'halloween' ? 'Halloween' : 'Special night'),
	spRules: (s, closesAt, look) => [
		{
			head: `${s.picksPerPerson} ${en2(s.picksPerPerson, 'pick', 'picks')} each.`,
			body: s.custom?.about
				? s.custom.about
				: look === 'halloween'
					? 'Something spooky, scary or strange.'
					: look === 'swieta'
						? 'Something for a winter night: festive or not at all, as long as it suits a blanket.'
						: look === 'prl'
							? 'Something off a Polish School poster: Polish cinema, cinema from behind the Iron Curtain, or just something old.'
							: look === 'folk'
								? 'Something out of the folk chest: fairy tales, myths and legends, folk horror, Slavic cinema, or just a village, a forest and whatever haunts it.'
								: 'Something you want to watch with the rest, ideally not the obvious one.'
		},
		...(s.custom && rulesOf(s.custom.rules).length
			? [
					{
						head: 'The film has to fit the week.',
						body: rulesOf(s.custom.rules).map((rule) => en.weekRule(rule)).join(' ')
					}
				]
			: []),
		{
			head: 'Tick every film you want to watch.',
			body: 'As many as you like, your own as well. You can change your mind until voting closes.'
		},
		{
			head: 'The counts stay hidden until the voting closes.',
			body:
				'All anyone can see is who has voted. ' +
				(closesAt ? `Voting closes ${formatNight(closesAt, 'en')}. ` : '') +
				`The ${s.shortlistSize} most ticked ${en2(s.shortlistSize, 'film is', 'films are')} chosen as usual.`
		},
		{
			head: 'The regular list is asleep.',
			body: 'Nothing fades and nothing drops. Afterwards the list goes back to where it was.'
		}
	],
	lookName: (id) =>
		id === 'halloween'
			? 'Halloween'
			: id === 'swieta'
				? 'Christmas'
				: id === 'prl'
					? 'Polish poster'
					: id === 'folk'
						? 'Slavic folk'
						: id,
	spMine: (used, max) => `Your picks: ${used} of ${max}`,
	spAddAria: (left) => `Propose a film, ${left} ${en2(left, 'pick', 'picks')} left`,
	spAddDone: (titles) =>
		`You already put up ${titles.join(', ')}`,
	spNomPop: (name) => `Picked for ${name}`,
	spEmptyH: 'Nothing here yet.',
	spEmpty: 'Put the first one up.',
	spEmptyCta: 'Put one up',
	spYes: 'I want to see it',
	spPicking: 'Voting is closed. The room is choosing between the most ticked.',
	spNomH: (name) => `Put up a film for ${name}`,
	spNomHint: (max) => `${max} ${en2(max, 'pick', 'picks')} each, no repeats.`,
	spFromList:
		'This is your film from the list. If it wins the night, we watch it and it leaves the list. If it loses, it stays on the list as if nothing had happened.',
	weekRule: (rule) => {
		const minutes = (n: number) => `${n} ${en2(n, 'minute', 'minutes')}`;
		switch (rule.kind) {
			case 'countries':
				return `Production country: ${oneOf('en', 'region', rule.codes)}.`;
			case 'languages':
				return `Original language: ${oneOf('en', 'language', rule.codes)}.`;
			case 'genres':
				return `Genre: ${orList('en', rule.ids.map((id) => GENRES_EN[id] ?? String(id)))}.`;
			case 'years':
				if (rule.from != null && rule.to != null) return `Released ${rule.from}-${rule.to}.`;
				return rule.from != null ? `Released in ${rule.from} or later.` : `Released in ${rule.to} or earlier.`;
			case 'runtime':
				if (rule.min != null && rule.max != null) return `${rule.min} to ${minutes(rule.max)}.`;
				return rule.max != null ? `At most ${minutes(rule.max)}.` : `At least ${minutes(rule.min ?? 0)}.`;
			case 'directors':
				return `Directed by ${orList('en', rule.names)}.`;
			case 'coded':
				return CODED_EN[rule.id];
			case 'tmdb':
				return 'It has to come from the TMDB search, so the rules can be checked.';
		}
	},
	genreName: (id) => GENRES_EN[id] ?? String(id),
	spOff: 'does not fit this week',

	error: (code, p, fallback) => (code === 'off_theme' ? offTheme('en', p, fallback) : fallback)
};

/** §3.7: a pick refused for breaking one of the week's rules, named in the reader's words */
function offTheme(lang: Lang, p: ErrorParams, fallback: string): string {
	const rule = ruleFromParams(p);
	if (!rule) return fallback;
	if (rule.kind === 'tmdb') {
		return lang === 'pl'
			? 'Ten tydzień ma zasady, a TMDB nie powiedziało nic o tym filmie. Wybierz go z wyszukiwarki albo spróbuj za chwilę.'
			: 'This week has rules and TMDB told us nothing about that film. Pick it from the search, or try again in a moment.';
	}
	const line = DICT[lang].weekRule(rule);
	return lang === 'pl' ? `Nie pasuje do zasad tygodnia. ${line}` : `That film does not fit this week. ${line}`;
}

export const DICT: Record<Lang, Dict> = { pl, en };

export function dictFor(lang: string | undefined | null): Dict {
	return DICT[langOf(lang)];
}
