/**
 * Polish is the default; film titles, genres and synopses stay in whatever TMDB
 * gives us. Everything the app says about itself lives here, in both languages,
 * so a copy change is one edit in one file.
 */
import { formatNight } from './datetime.js';

export type Lang = 'pl' | 'en';

export const LANGS: Lang[] = ['pl', 'en'];

export function isLang(value: string | undefined | null): value is Lang {
	return value === 'pl' || value === 'en';
}

export function langOf(value: string | undefined | null): Lang {
	return isLang(value) ? value : 'pl';
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

/* ---------------------------------------------------------------- plurals -- */

/** Polish has three forms: 1 / 2-4 / 5+, with 12-14 falling back to the last */
function pl3(n: number, one: string, few: string, many: string): string {
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

const plWeeks = (n: number) => pl3(n, 'tydzień', 'tygodnie', 'tygodni');
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

	week: (n: number) => string;
	/** the whole phrase, verb included, because the bar has no room for a sentence around it */
	timeLeft: (d: number, h: number, m: number, s: number) => string;
	votingClosed: string;
	roomPicking: (code: string) => string;
	openRoom: string;
	budgetPill: (left: number, budget: number, votes: boolean) => string;
	budgetHelp: (rules: RulesView) => string;

	shortlistHead: (n: number) => string;
	restHead: string;
	unit: (n: number, votes: boolean) => string;
	noBackers: string;
	btnAddPoint: string;
	btnVote: string;
	btnVoted: string;
	btnUndo: (s: number) => string;
	armHint: string;
	btnRenominate: string;
	warnDrops: string;
	warnFades: (n: number) => string;
	campaign: (n: number) => string;

	/* §3.5: a film sitting one round out at its nominator's request */
	holdCta: string;
	holdMine: string;
	holdBy: (name: string) => string;
	holdH: string;
	holdHint: (shortlistSize: number) => string;
	holdWhyPh: string;
	holdBtn: string;
	holdSave: string;
	holdRelease: string;
	holdSpent: (title: string) => string;
	holdSig: (name: string) => string;

	addedBy: (name: string, week: number) => string;
	nomPop: (week: number) => string;
	nomCta: string;
	nomCtaSub: string;
	nomDone: (title: string) => string;
	listEmpty: string;
	shelfArchive: (n: number) => string;
	shelfDropped: (n: number) => string;

	dGenre: string;
	dRuntime: string;
	dAdded: string;
	dBacked: string;
	dNobody: string;
	dEmpty: string;
	dNone: (left: number, votes: boolean) => string;
	dYours: (n: number, votes: boolean) => string;
	dBankLeft: (n: number) => string;
	dWeekLeft: (n: number, budget: number) => string;
	sortLabel: (rules: RulesView) => string;
	minutes: (n: number) => string;
	fadeNote: (rules: RulesView) => string;

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
	thPerson: string;
	thNominated: string;
	thWatched: string;
	noWinners: (n: number) => string;

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
	xpRowBacked: string;
	xpLadder: string;
	chlogH: string;
	chlogOk: string;
	/** closesAt is the current round's deadline, so the rules can name the real date */
	rules: (rules: RulesView, closesAt?: string | null) => Rule[];

	hostH: string;
	hostIdle: string;
	hostClose: string;
	hostQrH: string;
	/** said to the room off a projector, so it is an instruction, not a label */
	hostJoinH: string;
	hostTallyH: string;
	hostCastH: string;
	hostCastPick: string;
	hostLock: string;
	hostWinnerH: string;
	hostHeldH: string;
	roomCode: string;
	roomWho: string;
	roomFilter: string;
	roomGuest: string;
	/** the same person named rather than offered a button, for "voting as ..." */
	roomAsGuest: string;
	roomGuestNote: string;
	roomVotingAs: (name: string) => string;
	roomCheckedIn: string;
	roomFinal: string;
	roomArm: string;
	roomDecided: string;
	roomWinner: string;
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

	tNominated: (title: string) => string;
	tVoted: (title: string) => string;
	tUnvoted: string;
	tNoteSaved: string;
	tCommented: string;
	tRenominated: (title: string) => string;
	tRevived: (title: string) => string;
	tHeld: (title: string) => string;
	tReleased: (title: string) => string;
	tAvatarSaved: string;
	tAvatarRemoved: string;

	error: (code: string, params: ErrorParams, fallback: string) => string;
};

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
		out.push({ head: `${n} ${plWeeks(n)} bez punktów i film wypada.`, body: '' });
	} else {
		const n = r.attrition.afterWeeksAtZero;
		out.push({ head: `${n} ${plWeeks(n)} bez głosu i film trafia do archiwum.`, body: '' });
	}

	if (r.banking) {
		out.push({
			head: `Dostajesz ${r.pointsPerWeek} ${plPoints(r.pointsPerWeek)} tygodniowo i kumulują się, jeśli nie wydasz ich w danym tygodniu.`,
			body: `Maksymalnie możesz mieć ${r.bankCap} (jeśli masz ${r.bankCap} i nie zagłosujesz, te ${r.pointsPerWeek} ${plPoints(r.pointsPerWeek)} przepadają).`
		});
	} else if (votes) {
		out.push({
			head: 'Masz jeden głos tygodniowo.',
			body: 'Wykorzystaj go w danym tygodniu albo przepada.'
		});
	} else {
		out.push({
			head: `Dostajesz ${r.pointsPerWeek} ${plPoints(r.pointsPerWeek)} tygodniowo.`,
			body: 'Niewykorzystane przepadają po wieczorku, nic się nie kumuluje.'
		});
	}

	out.push({
		head: votes
			? 'Twój głos idzie na jeden film.'
			: 'Gdy głosujesz na film, możesz zużyć tyle punktów, ile masz dostępnych.',
		body: votes
			? 'Wybieraj uważnie, bo raz oddany zostaje.'
			: 'Po jednym co tydzień, żeby film nie odpadł z listy, albo wszystko naraz, żeby go przepchnąć.'
	});

	out.push({
		head: 'Punktów wydanych na film nie można cofać.',
		body: `Masz ${r.voteGraceSeconds} sekund na poprawienie pomyłki.`
	});

	if (r.scoring === 'fade') {
		out.push({
			head: `${votes ? 'Głosy' : 'Punkty'} na filmie tracą co tydzień ${fadePercent(r)}% wartości.`,
			body: 'Świeże głosy liczą się najbardziej, te z poprzednich tygodni powoli wygasają. Film utrzymuje się wysoko tylko wtedy, gdy dostaje świeże głosy co tydzień.'
		});
	} else {
		out.push({
			head:
				r.scoring === 'total'
					? `${votes ? 'Głosy' : 'Punkty'} kumulują się na filmie co tydzień.`
					: `Wynik to ten tydzień plus ${r.decayFactor} poprzedniego.`,
			body: r.scoring === 'total' ? '' : 'Nic nie kumuluje się na długo.'
		});
	}

	out.push({
		head: `${r.nominationsPerWeek === 1 ? 'Jedno' : r.nominationsPerWeek} zgłoszenie tygodniowo.`,
		body: 'Wykorzystaj w danym tygodniu albo przepada.'
	});

	out.push({
		head: closesAt
			? `Głosowanie zamyka się w dniu wieczorku: ${formatNight(closesAt, 'pl')}.`
			: 'Głosowanie zamyka się w dniu wieczorku.',
		body:
			`Terminy ustala kalendarz, więc wieczorek może wypaść w inny dzień niż zwykle. ` +
			`${r.shortlistSize} ${plFilms(r.shortlistSize)} z największą liczbą punktów trafiają do głosowania. ` +
			'Kod QR pojawia się na ekranie i głos mają tylko ci, którzy przyszli. ' +
			'Jeśli nikt nie zagłosuje, wygrywa najwyższy wynik.'
	});

	out.push({
		head: 'Nie będzie cię na wieczorku? Liberum veto usypia twój film na tydzień.',
		body:
			'Jeden film na tydzień i tylko taki, który sam zgłosiłeś. Nie idzie wtedy pod głosowanie ' +
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

	week: (n) => `Tydzień ${n}`,
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
	budgetPill: (left, budget, votes) =>
		votes ? `${left}/${budget} ${plVotes(budget)}` : `${left}/${budget} pkt`,
	budgetHelp: (r) => {
		if (r.banking) {
			return `Dostajesz ${r.pointsPerWeek} ${plPoints(r.pointsPerWeek)} co tydzień. Niewydane punkty akumulują się co tydzień, maksymalnie do ${r.bankCap}.`;
		}
		if (isVotes(r)) return 'Masz jeden głos tygodniowo. Wykorzystaj go albo przepada.';
		return `Dostajesz ${r.pointsPerWeek} ${plPoints(r.pointsPerWeek)} na tydzień. Niewykorzystane przepadają po wieczorku.`;
	},

	shortlistHead: (n) => (n === 3 ? 'Trójka na dziś' : `Czołowe ${n} na dziś`),
	restHead: 'Reszta listy',
	unit: (n, votes) => (votes ? plVotes(n) : 'pkt'),
	noBackers: '0 głosów',
	btnAddPoint: '+1 pkt',
	btnVote: 'Głosuj',
	btnVoted: '✓ twój głos',
	btnUndo: (s) => `Cofnij · ${s} s`,
	armHint: 'Kliknij drugi raz, żeby potwierdzić głos',
	btnRenominate: 'Zgłoś ponownie',
	warnDrops: 'odpada w tym tyg, jeśli nie dostanie głosów',
	warnFades: (n) => `znika za ${n} ${plWeeks(n)}`,
	campaign: (n) => `${n}. tydzień kampanii`,

	holdCta: 'Liberum veto',
	holdMine: 'Uśpiony przez ciebie',
	// nie „uśpiony przez Tymka”: imiona się odmieniają, a kropka nie
	holdBy: (name) => `Uśpiony · ${name}`,
	holdH: 'Nie będzie cię w tym tygodniu?',
	holdHint: (n) =>
		`Uśpiony film nie pójdzie pod głosowanie w sali, a jego miejsce zajmie kolejny z listy ` +
		`(do sali idzie ${n} ${plFilms(n)}). Punkty tracą na wartości normalnie, więc uśpienie kosztuje. ` +
		'Wycofać możesz aż do zamknięcia głosowania.',
	holdWhyPh: 'Czemu? Zobaczą wszyscy…',
	holdBtn: 'Liberum veto',
	holdSave: 'Zapisz powód',
	holdRelease: 'Wycofaj',
	holdSpent: (title) => `W tym tygodniu uśpiony jest już ${title}.`,
	holdSig: (name) => name,

	addedBy: (name, week) => `${name}, tydzień ${week}`,
	nomPop: (week) => `Zgłoszenie z tygodnia ${week}`,
	nomCta: '+ Zgłoś film',
	nomCtaSub: 'jedno zgłoszenie na osobę w tygodniu',
	nomDone: (title) => `Twoje zgłoszenie w tym tygodniu: ${title}`,
	listEmpty: 'Lista jest pusta. Zgłoś coś.',
	shelfArchive: (n) => `Archiwum · ${n} ${plFilms(n)} bez głosów`,
	shelfDropped: (n) => `Wypadły · ${n} ${plFilms(n)} bez wsparcia`,

	dGenre: 'Gatunek',
	dRuntime: 'Czas',
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
	dWeekLeft: (n, budget) => `${n} z ${budget} w tym tygodniu`,
	sortLabel: (r) => {
		if (r.scoring === 'fade') return `punkty tracą ${fadePercent(r)}% co tydzień`;
		if (r.scoring === 'decay') return `ten tydzień + ${r.decayFactor} poprzedniego`;
		return isVotes(r) ? 'wszystkie głosy od początku' : 'suma wszystkich wydanych punktów';
	},
	minutes: (n) => `${n} min`,
	fadeNote: (r) => `Punkty tracą ${fadePercent(r)}% wartości co tydzień`,

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
	nomHint: 'Jedno zgłoszenie na osobę w tygodniu.',
	nomPh: 'Szukaj po tytule…',
	nomSearching: 'szukam…',
	nomNone: (q) => `Nic nie znaleziono dla „${q}”.`,
	nomDup: 'już jest',
	nomOffline: 'Brak połączenia z TMDB, ale możesz wpisać tytuł ręcznie.',
	nomByHand: (title) => `Zgłoś „${title}” bez danych z TMDB`,

	watchedH: 'Obejrzane',
	fairH: 'Czyje filmy oglądamy',
	seenEmpty: 'Jeszcze żadnego wieczoru.',
	thPerson: 'Osoba',
	thNominated: 'Zgłoszone',
	thWatched: 'Obejrzane',
	noWinners: (n) => `${n} ${plWeeks(n)} zamknięto bez głosów, więc nic nie oglądaliśmy.`,

	youLang: 'Język',
	youPhoto: 'Zdjęcie profilowe',
	youPhone: 'Dodaj telefon',
	qrBody: 'Otwiera twój prywatny link na innym urządzeniu (np. telefonie)',
	youStats: 'Statystyki',
	youRules: 'Zasady',
	statPoints: 'Punkty wydane od początku',
	statWatched: 'Twoje filmy, które obejrzeliśmy',
	statCampaign: 'Najdłuższa kampania',
	statNom: 'Zgłoszenie w tym tygodniu',
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
	xpRowVote: 'Tygodnie z głosem',
	xpRowNominate: 'Zgłoszenia',
	xpRowWatched: 'Twoje filmy obejrzane',
	xpRowBacked: 'Trafieni zwycięzcy',
	xpLadder: 'Wszystkie poziomy',
	chlogH: 'Changelog',
	chlogOk: 'OK',
	rules: plRules,

	hostH: 'Prowadzący',
	hostIdle: 'Sala jeszcze nie głosuje.',
	hostClose: 'Zamknij tydzień teraz',
	hostQrH: 'Kod dla sali (można wyświetlić)',
	hostJoinH: 'Zeskanuj, żeby głosować',
	hostTallyH: 'Na żywo',
	hostCastH: 'Zagłosuj za kogoś, komu padł telefon',
	hostCastPick: 'teraz wybierz jego film',
	hostLock: 'Zatwierdź i puszczaj film',
	hostWinnerH: 'Dzisiaj oglądamy',
	hostHeldH: 'Uśpione do następnego razu',
	roomCode: 'kod sali',
	roomWho: 'Kto ty jesteś?',
	roomFilter: 'zacznij pisać imię',
	roomGuest: 'Jestem gościem',
	roomAsGuest: 'gość',
	roomGuestNote: 'Nie ma cię na liście? Zagłosuj jako gość, w sali też się liczy.',
	roomVotingAs: (name) => `głosujesz jako ${name}`,
	roomCheckedIn: 'obecność zapisana ✓',
	roomFinal: 'Masz jeden głos na wieczór.',
	roomArm: 'Dotknij jeszcze raz, żeby potwierdzić',
	roomDecided: 'Dzisiejszy wieczór rozstrzygnięty.',
	roomWinner: 'wygrywa',
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

	tNominated: (title) => `Zgłoszono: ${title}`,
	tVoted: (title) => `Głos na: ${title}`,
	tUnvoted: 'Głos wycofany',
	tNoteSaved: 'Notka zapisana',
	tCommented: 'Komentarz dodany',
	tRenominated: (title) => `Zgłoszono ponownie: ${title}, start od zera`,
	tRevived: (title) => `${title} wraca na listę`,
	tHeld: (title) => `${title} uśpiony do następnego razu`,
	tReleased: (title) => `${title} znowu gra o dziś`,
	tAvatarSaved: 'Zdjęcie zapisane',
	tAvatarRemoved: 'Zdjęcie usunięte',

	error: (code, p, fallback) => {
		switch (code) {
			case 'no_week':
				return 'Żaden tydzień nie jest jeszcze otwarty.';
			case 'room_picking':
				return 'Głosowanie zamknięte, sala właśnie wybiera film.';
			case 'week_closed':
				return 'Głosowanie w tym tygodniu jest zamknięte.';
			case 'deadline_passed':
				return 'Głosowanie zamknęło się o 20:00, film się zaczyna.';
			case 'already_nominated':
				return 'Masz już zgłoszenie w tym tygodniu.';
			case 'no_title':
				return 'Podaj tytuł filmu.';
			case 'dup_watched':
				return `${p.title} oglądaliśmy w tygodniu ${p.week}.`;
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
			case 'not_your_note':
				return 'Notkę zmienia tylko ten, kto zgłosił film.';
			case 'not_your_film':
				return 'Wstrzymać film może tylko ten, kto go zgłosił.';
			case 'hold_not_active':
				return `${p.title} nie jest na liście.`;
			case 'hold_taken':
				return `W tym tygodniu uśpiony jest już ${p.title}.`;
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
			case 'vote_locked':
				return 'Głos w sali jest ostateczny. Jedno kliknięcie decyduje o wieczorze.';
			case 'empty_comment':
				return 'Napisz najpierw coś.';
			case 'comment_too_long':
				return `Komentarz może mieć najwyżej ${p.max} znaków.`;
			case 'no_comment':
				return 'Nie ma takiego komentarza.';
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
		out.push({ head: `${n} silent ${en2(n, 'week', 'weeks')} and a film drops.`, body: '' });
	} else {
		const n = r.attrition.afterWeeksAtZero;
		out.push({ head: `${n} silent ${en2(n, 'week', 'weeks')} and a film is archived.`, body: '' });
	}

	if (r.banking) {
		out.push({
			head: `You get ${r.pointsPerWeek} points a week, and they carry over if you do not spend them.`,
			body: `You can hold ${r.bankCap} at most (on ${r.bankCap} already, a week without voting loses that week's ${r.pointsPerWeek}).`
		});
	} else if (votes) {
		out.push({
			head: 'One vote a week.',
			body: 'Use it that week or lose it.'
		});
	} else {
		out.push({
			head: `You get ${r.pointsPerWeek} points a week.`,
			body: 'Anything unspent is gone after the night; nothing carries over.'
		});
	}

	out.push({
		head: votes ? 'Your vote goes on one film.' : 'You can spend as many points on a film as you have.',
		body: votes
			? 'Pick carefully; once cast it stays.'
			: 'One a week to keep a film on the list, or the lot at once to force it through.'
	});

	out.push({
		head: 'A cast vote cannot be taken back.',
		body: `You get ${r.voteGraceSeconds} seconds to fix a slip, then it stands and points can only be added.`
	});

	if (r.scoring === 'fade') {
		out.push({
			head: `${votes ? 'Votes' : 'Points'} on a film lose ${fadePercent(r)}% of their value each week.`,
			body: 'Fresh votes weigh the most and old ones slowly fade, so a film stays high only while somebody still wants it.'
		});
	} else {
		out.push({
			head:
				r.scoring === 'total'
					? `${votes ? 'Votes' : 'Points'} accumulate on a film week after week.`
					: `A score is this week plus ${r.decayFactor} of last week.`,
			body: r.scoring === 'total' ? '' : 'Nothing accumulates for long.'
		});
	}

	out.push({
		head: `${r.nominationsPerWeek === 1 ? 'One' : r.nominationsPerWeek} nomination a week.`,
		body: 'Use it that week or lose it.'
	});

	out.push({
		head: closesAt
			? `Voting closes on the night itself: ${formatNight(closesAt, 'en')}.`
			: 'Voting closes on the night itself.',
		body:
			'The dates come from the calendar, so a film night can land on a different day than usual. ' +
			`The ${r.shortlistSize} films with the most points go to the vote. ` +
			'A QR goes up on the screen and only the people who turned up get a say. ' +
			'If nobody votes, the highest score wins.'
	});

	out.push({
		head: 'Not coming on the night? Liberum veto puts your film to sleep for a week.',
		body:
			'One film a week, and only one you nominated yourself. It stays out of the room vote and ' +
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

	week: (n) => `Week ${n}`,
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
	budgetPill: (left, budget, votes) =>
		votes ? `${left}/${budget} ${en2(budget, 'vote', 'votes')}` : `${left}/${budget} pts`,
	budgetHelp: (r) => {
		if (r.banking) {
			return `You get ${r.pointsPerWeek} points every week. Unspent points accumulate week to week, up to ${r.bankCap}.`;
		}
		if (isVotes(r)) return 'One vote a week. Use it or lose it.';
		return `You get ${r.pointsPerWeek} points a week. Anything unspent is gone after the night.`;
	},

	shortlistHead: (n) => (n === 3 ? "Tonight's three" : `Tonight's top ${n}`),
	restHead: 'The rest',
	unit: (n, votes) => (votes ? en2(n, 'vote', 'votes') : 'pts'),
	noBackers: '0 votes',
	btnAddPoint: '+1 point',
	btnVote: 'Vote',
	btnVoted: '✓ your vote',
	btnUndo: (s) => `Undo · ${s} s`,
	armHint: 'Tap again to confirm your vote',
	btnRenominate: 'Re-nominate',
	warnDrops: 'drops this week unless it gets votes',
	warnFades: (n) => `fades in ${n} ${en2(n, 'week', 'weeks')}`,
	campaign: (n) => `week ${n} of this campaign`,

	holdCta: 'Liberum veto',
	holdMine: 'Asleep, yours',
	holdBy: (name) => `Asleep · ${name}`,
	holdH: 'Not going to make it this week?',
	holdHint: (n) =>
		`Your film then stays out of the room's vote and the next one on the list takes its place ` +
		`(${n} ${en2(n, 'film goes', 'films go')} to the room). Its points fade as usual, so waiting costs ` +
		'something. You can undo it right up to the close.',
	holdWhyPh: 'Why? Everyone sees this…',
	holdBtn: 'Liberum veto',
	holdSave: 'Save the reason',
	holdRelease: 'Put it back',
	holdSpent: (title) => `${title} is already asleep this week.`,
	holdSig: (name) => name,

	addedBy: (name, week) => `${name}, week ${week}`,
	nomPop: (week) => `Nominated in week ${week}`,
	nomCta: '+ Nominate a film',
	nomCtaSub: 'one nomination per person per week',
	nomDone: (title) => `You nominated ${title} this week`,
	listEmpty: 'Nothing on the list. Nominate something.',
	shelfArchive: (n) => `Archive · ${n} ${en2(n, 'film', 'films')} nobody has voted for`,
	shelfDropped: (n) => `Dropped · ${n} ${en2(n, 'film', 'films')} that ran out of support`,

	dGenre: 'Genre',
	dRuntime: 'Runtime',
	dAdded: 'Nominated by',
	dBacked: 'Backed by',
	dNobody: 'nobody yet',
	dEmpty: 'unknown',
	dNone: (n, votes) =>
		`You haven't backed this yet, you have ${n} ${votes ? en2(n, 'vote', 'votes') : en2(n, 'point', 'points')} left`,
	dYours: (n, votes) =>
		`${n} ${votes ? en2(n, 'vote', 'votes') : en2(n, 'point', 'points')} from you`,
	dBankLeft: (n) => `${n} left in your bank`,
	dWeekLeft: (n, budget) => `${n} of ${budget} left this week`,
	sortLabel: (r) => {
		if (r.scoring === 'fade') return `points fade ${fadePercent(r)}% a week`;
		if (r.scoring === 'decay') return `this week plus ${r.decayFactor} of last week`;
		return isVotes(r) ? 'all-time votes' : 'total points ever spent';
	},
	minutes: (n) => `${n} min`,
	fadeNote: (r) => `Points lose ${fadePercent(r)}% of their value each week`,

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
	nomHint: 'One nomination per person per week.',
	nomPh: 'Search by title…',
	nomSearching: 'searching…',
	nomNone: (q) => `Nothing found for “${q}”.`,
	nomDup: 'already here',
	nomOffline: "Couldn't reach TMDB, but you can still type a title by hand.",
	nomByHand: (title) => `Nominate “${title}” with no TMDB data`,

	watchedH: 'Watched',
	fairH: 'Who gets their films watched',
	seenEmpty: 'No film nights yet.',
	thPerson: 'Person',
	thNominated: 'Nominated',
	thWatched: 'Watched',
	noWinners: (n) =>
		`${n} ${en2(n, 'week', 'weeks')} closed with nobody voting, so nothing was watched.`,

	youLang: 'Language',
	youPhoto: 'Profile picture',
	youPhone: 'Add your phone',
	qrBody: 'Opens your personal link on another device (your phone, say)',
	youStats: 'Statistics',
	youRules: 'The rules',
	statPoints: 'Points spent, all time',
	statWatched: 'Your nominations we watched',
	statCampaign: 'Longest campaign',
	statNom: 'Nomination this week',
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
	xpRowVote: 'Weeks voted',
	xpRowNominate: 'Nominations',
	xpRowWatched: 'Your films watched',
	xpRowBacked: 'Winners backed',
	xpLadder: 'All levels',
	chlogH: "What's new",
	chlogOk: 'Got it',
	rules: enRules,

	hostH: 'Host',
	hostIdle: 'The room is not voting yet.',
	hostClose: 'Close the week now',
	hostQrH: 'Room QR (safe to project)',
	hostJoinH: 'Scan to vote',
	hostTallyH: 'Live tally',
	hostCastH: 'Cast for someone whose phone is dead',
	hostCastPick: 'now pick their film',
	hostLock: 'Lock it in and start the film',
	hostWinnerH: 'Tonight we are watching',
	hostHeldH: 'Asleep until another night',
	roomCode: 'room code',
	roomWho: 'Who are you?',
	roomFilter: 'type to filter',
	roomGuest: "I'm a guest",
	roomAsGuest: 'a guest',
	roomGuestNote: 'Not on the list? Vote as a guest; it still counts in the room.',
	roomVotingAs: (name) => `voting as ${name}`,
	roomCheckedIn: 'checked in ✓',
	roomFinal: 'You have one vote for the night.',
	roomArm: 'Tap again to lock it in',
	roomDecided: 'Tonight is decided.',
	roomWinner: 'winner',
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

	tNominated: (title) => `Nominated ${title}`,
	tVoted: (title) => `Voted for ${title}`,
	tUnvoted: 'Vote pulled back',
	tNoteSaved: 'Note saved',
	tCommented: 'Comment added',
	tRenominated: (title) => `Re-nominated ${title}, starting from zero`,
	tRevived: (title) => `${title} is back on the list`,
	tHeld: (title) => `${title} is asleep until another night`,
	tReleased: (title) => `${title} is in the running again`,
	tAvatarSaved: 'Picture saved',
	tAvatarRemoved: 'Picture removed',

	error: (_code, _params, fallback) => fallback
};

export const DICT: Record<Lang, Dict> = { pl, en };

export function dictFor(lang: string | undefined | null): Dict {
	return DICT[langOf(lang)];
}
