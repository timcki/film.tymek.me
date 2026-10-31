/**
 * The back office. Kept in its own file rather than swelling i18n.ts, because
 * two people ever see these strings and nobody editing the members' copy should
 * have to scroll past them.
 */
import type { Lang } from './i18n.js';

export type AdminDict = {
	adminH: string;
	navCalendar: string;
	navPeople: string;
	navFilms: string;
	navWatched: string;
	navHost: string;
	navBack: string;

	/* calendar */
	calH: string;
	calIntro: string;
	calNextH: string;
	calFromCalendar: string;
	calFromDefault: string;
	calDefaultNote: (date: string) => string;
	calAddH: string;
	calWhen: string;
	calNote: string;
	calNotePh: string;
	calAdd: string;
	calUpcomingH: string;
	calPastH: string;
	calEmpty: string;
	calPastEmpty: string;
	calClosesRound: string;
	calOverdue: string;
	calSkipped: string;
	calUsed: (evening: number) => string;
	calRunsTo: (date: string) => string;
	calSkip: string;
	calUnskip: string;
	calDelete: string;
	calEdit: string;
	calSave: string;
	calCancel: string;
	/** §3.6: giving the open round over to a special night */
	spcH: string;
	spcIntro: string;
	spcStart: (name: string) => string;
	spcOn: (name: string) => string;
	spcStop: string;
	spcLocked: string;

	/* people */
	peoH: string;
	peoAddH: string;
	peoName: string;
	peoColour: string;
	peoAdd: string;
	peoInactiveH: string;
	peoAdminBadge: string;
	peoYou: string;
	peoStats: (nominated: number, watched: number) => string;
	peoBank: string;
	peoLinkH: string;
	peoRotate: string;
	peoRotateNote: string;
	peoMakeAdmin: string;
	peoDropAdmin: string;
	peoDeactivate: string;
	peoActivate: string;
	peoSave: string;
	peoEdit: string;
	peoCancel: string;
	peoNewLink: (name: string) => string;

	/* films */
	filH: string;
	filStatus: (status: string) => string;
	filBy: (name: string, evening: number) => string;
	filBallots: (n: number) => string;
	filEdit: string;
	filSave: string;
	filCancel: string;
	filTitle: string;
	filYear: string;
	filDirector: string;
	filGenre: string;
	filRuntime: string;
	filPoster: string;
	filNote: string;
	filActivate: string;
	filArchive: string;
	filDrop: string;
	filDelete: string;
	filDeleteNote: string;
	filReassignH: string;
	filReassign: string;
	/* §3.5: placing somebody's hold for them, because the ask came by group chat */
	filHold: string;
	filHoldWhy: string;
	filRelease: string;
	filEmpty: string;

	/* the round in play */
	rndH: string;
	rndIntro: string;

	/* what we have watched, and writing down what no round decided */
	watH: string;
	watIntro: string;
	watAddH: string;
	watSearchPh: string;
	watNoResults: string;
	watByHand: string;
	watWhen: string;
	watWhere: string;
	/** a film night that happened and was never written down */
	watFilmNight: string;
	watWho: string;
	watAdd: string;
	watAddAnyway: string;
	watCancel: string;
	watEmpty: string;

	/* audit */
	audH: string;
	audEmpty: string;
	audLine: (who: string, action: string, target: string) => string;

	error: (code: string, params: Record<string, string | number>, fallback: string) => string;
};

// 'archived' is not the archive: it means the film ran out of votes and left the
// list, and a single vote brings it back. Calling both the same thing is how a
// film ends up in the wrong one
const STATUS_PL: Record<string, string> = {
	active: 'na liście',
	archived: 'poza listą',
	dropped: 'wypadł',
	watched: 'obejrzany'
};

const pl: AdminDict = {
	adminH: 'Panel',
	navCalendar: 'Kalendarz',
	navPeople: 'Ludzie',
	navFilms: 'Filmy',
	navWatched: 'Obejrzane',
	navHost: 'Prowadzący',
	navBack: '← Wróć do aplikacji',

	calH: 'Terminy wieczorków',
	calIntro:
		'Runda kończy się w najbliższym zaplanowanym terminie. Pominięcie terminu przedłuża rundę do następnego, a punkty dostajecie po każdym obejrzanym filmie, nie co tydzień.',
	calNextH: 'Bieżąca runda kończy się',
	calFromCalendar: 'z kalendarza',
	calFromDefault: 'termin domyślny',
	calDefaultNote: (date) =>
		`Nic nie jest zaplanowane, więc runda skończy się ${date}. Dodaj termin, żeby to zmienić.`,
	calAddH: 'Dodaj termin',
	calWhen: 'Kiedy',
	calNote: 'Notka',
	calNotePh: 'np. u Piotra',
	calAdd: 'Dodaj',
	calUpcomingH: 'Nadchodzące',
	calPastH: 'Minione',
	calEmpty: 'Nic nie zaplanowane.',
	calPastEmpty: 'Jeszcze żadnego wieczorku z kalendarza.',
	calClosesRound: 'zamyka bieżącą rundę',
	calOverdue: 'termin minął',
	calSkipped: 'pominięty',
	calUsed: (evening) => `wieczorek ${evening}`,
	calRunsTo: (date) => `runda potrwa do ${date}`,
	calSkip: 'Pomiń',
	calUnskip: 'Przywróć',
	calDelete: 'Usuń',
	calEdit: 'Zmień',
	calSave: 'Zapisz',
	calCancel: 'Anuluj',
	spcH: 'Wieczór specjalny',
	spcIntro:
		'Oddaje bieżącą rundę jednemu wieczorowi z własnymi propozycjami i własnym głosowaniem. ' +
		'Lista śpi do jego końca: nikt nie wydaje punktów, nic nie traci na wartości i nic nie wypada. ' +
		'Punkty wydane w tej rundzie wcześniej zostają.',
	spcStart: (name) => `Zrób z tej rundy ${name}`,
	spcOn: (name) => `Ta runda to ${name}.`,
	spcStop: 'Odwołaj',
	spcLocked: 'Ktoś już zgłosił propozycję, więc runda dobiegnie końca.',

	peoH: 'Ludzie',
	peoAddH: 'Dodaj osobę',
	peoName: 'Imię i nazwisko',
	peoColour: 'Kolor',
	peoAdd: 'Dodaj',
	peoInactiveH: 'Nieaktywni',
	peoAdminBadge: 'admin',
	peoYou: 'to ty',
	peoStats: (nominated, watched) => `${nominated} zgłoszeń · ${watched} obejrzanych`,
	peoBank: 'Bank',
	peoLinkH: 'Prywatny link',
	peoRotate: 'Nowy link',
	peoRotateNote: 'Stary link przestaje działać od razu.',
	peoMakeAdmin: 'Zrób adminem',
	peoDropAdmin: 'Odbierz admina',
	peoDeactivate: 'Dezaktywuj',
	peoActivate: 'Aktywuj',
	peoSave: 'Zapisz',
	peoEdit: 'Zmień',
	peoCancel: 'Anuluj',
	peoNewLink: (name) => `Nowy link dla ${name}. Przekaż go osobiście.`,

	filH: 'Filmy',
	filStatus: (status) => STATUS_PL[status] ?? status,
	filBy: (name, evening) => `${name}, na wieczorek ${evening}`,
	filBallots: (n) => `${n} głosów w bazie`,
	filEdit: 'Edytuj',
	filSave: 'Zapisz',
	filCancel: 'Anuluj',
	filTitle: 'Tytuł',
	filYear: 'Rok',
	filDirector: 'Reżyseria',
	filGenre: 'Gatunek',
	filRuntime: 'Czas (min)',
	filPoster: 'Plakat (URL)',
	filNote: 'Notka',
	filActivate: 'Na listę',
	filArchive: 'Poza listę',
	filDrop: 'Wyrzuć',
	filDelete: 'Usuń na zawsze',
	filDeleteNote: 'Tylko dla filmów bez ani jednego głosu.',
	filReassignH: 'Zgłaszający',
	filReassign: 'Przepisz',
	filHold: 'Liberum veto',
	filHoldWhy: 'Powód (opcjonalnie)',
	filRelease: 'Wycofaj',
	filEmpty: 'Brak filmów.',

	rndH: 'Bieżąca runda',
	rndIntro: 'Filmy, na które teraz się głosuje. Obejrzane są w zakładce Obejrzane.',

	watH: 'Obejrzane',
	watIntro:
		'Wszystko, co obejrzeliśmy, wieczorek po wieczorku. Tu dopisujesz filmy obejrzane poza głosowaniem: kino, wyjazd albo wieczorek, którego nikt nie zapisał. Nic stąd nie trafia na listę do głosowania.',
	watAddH: 'Dopisz obejrzany film',
	watSearchPh: 'Szukaj w TMDB…',
	watNoResults: 'Nic nie znaleziono.',
	watByHand: 'Wpisz ręcznie',
	watWhen: 'Kiedy',
	watWhere: 'Gdzie',
	watFilmNight: 'Zwykły wieczorek',
	watWho: 'Kto zaproponował',
	watAdd: 'Dopisz',
	watAddAnyway: 'Dopisz mimo to',
	watCancel: 'Anuluj',
	watEmpty: 'Jeszcze nic nie obejrzeliśmy.',

	audH: 'Ostatnie zmiany',
	audEmpty: 'Jeszcze nic.',
	audLine: (who, action, target) => `${who} · ${action}${target ? ` · ${target}` : ''}`,

	error: (code, p, fallback) => {
		switch (code) {
			case 'night_exists':
				return 'Taki termin już jest w kalendarzu.';
			case 'no_night':
				return 'Nie ma takiego terminu.';
			case 'night_used':
				return 'Ten wieczorek już się odbył.';
			case 'bad_date':
				return 'Podaj datę i godzinę.';
			case 'name_required':
				return 'Podaj imię.';
			case 'name_too_long':
				return `Imię może mieć najwyżej ${p.max} znaków.`;
			case 'person_exists':
				return `${p.name} jest już na liście.`;
			case 'no_person':
				return 'Nie ma takiej osoby.';
			case 'last_admin':
				return 'To ostatni admin. Najpierw zrób adminem kogoś innego.';
			case 'not_yourself':
				return 'Nie możesz odebrać admina sobie. Poproś drugiego admina.';
			case 'bad_colour':
				return 'Kolor musi być w formacie #rrggbb.';
			case 'bad_balance':
				return `Bank mieści od 0 do ${p.cap} punktów.`;
			case 'no_film':
				return 'Nie ma takiego filmu.';
			case 'hold_not_active':
				return `${p.title} nie jest na liście.`;
			case 'hold_taken':
				return `Ta osoba uśpiła w tym tygodniu ${p.title}.`;
			case 'film_has_ballots':
				return 'Ktoś na niego głosował. Zdejmij go z listy zamiast usuwać.';
			case 'film_watched':
				return 'Ten film już oglądaliśmy.';
			case 'nomination_clash':
				return 'Ta osoba ma już zgłoszenie w tej rundzie.';
			case 'use_mark_watched':
				return 'Obejrzany film wybiera runda albo dopisuje się go w zakładce Obejrzane.';
			case 'no_title':
				return 'Podaj tytuł.';
			case 'dup_active':
				return `${p.title} jest już na liście.`;
			case 'dup_recorded':
				return p.evening
					? `${p.title} oglądaliśmy już na wieczorku ${p.evening}.`
					: `${p.title} jest na liście do głosowania.`;
			case 'watched_future':
				return 'Ta data jeszcze nie nadeszła.';
			case 'no_round_then':
				return 'Żadna runda nie obejmuje tej daty.';
			case 'night_not_yet':
				return 'Ta runda jeszcze nie miała swojego wieczorku. Jeśli to było wyjście, wybierz miejsce.';
			case 'night_taken':
				return `Tego wieczorku oglądaliśmy ${p.title}. Jeśli to było osobne wyjście, wybierz miejsce.`;
			case 'film_archival':
				return `${p.title} to zapis dawnego wieczoru, nie można na niego głosować.`;
			case 'special_on':
				return 'Ta runda już jest specjalna.';
			case 'special_has_picks':
				return 'Ktoś już zgłosił propozycję, więc runda dobiegnie końca.';
			case 'no_special':
				return 'Ta runda nie jest specjalna.';
			case 'room_picking':
				return 'Sala właśnie wybiera film.';
			case 'week_closed':
				return 'Ta runda jest zamknięta.';
			case 'deadline_passed':
				return 'Termin tej rundy już minął.';
			default:
				return fallback;
		}
	}
};

const STATUS_EN: Record<string, string> = {
	active: 'on the list',
	archived: 'archived',
	dropped: 'dropped',
	watched: 'watched'
};

const en: AdminDict = {
	adminH: 'Admin',
	navCalendar: 'Calendar',
	navPeople: 'People',
	navFilms: 'Films',
	navWatched: 'Watched',
	navHost: 'Host',
	navBack: '← Back to the app',

	calH: 'Film night dates',
	calIntro:
		'A round ends on the next planned date. Skipping one runs the round on to the date after, and points are handed out after each film we watch rather than every week.',
	calNextH: 'This round closes',
	calFromCalendar: 'from the calendar',
	calFromDefault: 'default date',
	calDefaultNote: (date) =>
		`Nothing is planned, so the round will end ${date}. Add a date to change that.`,
	calAddH: 'Add a date',
	calWhen: 'When',
	calNote: 'Note',
	calNotePh: "e.g. at Piotr's",
	calAdd: 'Add',
	calUpcomingH: 'Coming up',
	calPastH: 'Past',
	calEmpty: 'Nothing planned.',
	calPastEmpty: 'No film night has run off the calendar yet.',
	calClosesRound: 'closes the current round',
	calOverdue: 'overdue',
	calSkipped: 'skipped',
	calUsed: (evening) => `night ${evening}`,
	calRunsTo: (date) => `the round runs to ${date}`,
	calSkip: 'Skip',
	calUnskip: 'Restore',
	calDelete: 'Delete',
	calEdit: 'Change',
	calSave: 'Save',
	calCancel: 'Cancel',
	spcH: 'Special night',
	spcIntro:
		'Gives the current round over to one night with its own picks and its own vote. ' +
		'The list sleeps until it is over: nobody spends points, nothing fades and nothing drops. ' +
		'Points already spent this round stay where they are.',
	spcStart: (name) => `Make this round ${name}`,
	spcOn: (name) => `This round is ${name}.`,
	spcStop: 'Call it off',
	spcLocked: 'Somebody has already put a pick up, so the round runs its course.',

	peoH: 'People',
	peoAddH: 'Add someone',
	peoName: 'Name',
	peoColour: 'Colour',
	peoAdd: 'Add',
	peoInactiveH: 'Inactive',
	peoAdminBadge: 'admin',
	peoYou: "that's you",
	peoStats: (nominated, watched) => `${nominated} nominated · ${watched} watched`,
	peoBank: 'Bank',
	peoLinkH: 'Personal link',
	peoRotate: 'New link',
	peoRotateNote: 'The old one stops working immediately.',
	peoMakeAdmin: 'Make admin',
	peoDropAdmin: 'Remove admin',
	peoDeactivate: 'Deactivate',
	peoActivate: 'Activate',
	peoSave: 'Save',
	peoEdit: 'Edit',
	peoCancel: 'Cancel',
	peoNewLink: (name) => `New link for ${name}. Hand it over in person.`,

	filH: 'Films',
	filStatus: (status) => STATUS_EN[status] ?? status,
	filBy: (name, evening) => `${name}, for night ${evening}`,
	filBallots: (n) => `${n} ballots on record`,
	filEdit: 'Edit',
	filSave: 'Save',
	filCancel: 'Cancel',
	filTitle: 'Title',
	filYear: 'Year',
	filDirector: 'Director',
	filGenre: 'Genre',
	filRuntime: 'Runtime (min)',
	filPoster: 'Poster (URL)',
	filNote: 'Note',
	filActivate: 'Put on the list',
	filArchive: 'Take off the list',
	filDrop: 'Drop',
	filDelete: 'Delete for good',
	filDeleteNote: 'Only for films nobody has voted for.',
	filReassignH: 'Nominated by',
	filReassign: 'Reassign',
	filHold: 'Liberum veto',
	filHoldWhy: 'Reason (optional)',
	filRelease: 'Put it back',
	filEmpty: 'No films.',

	rndH: 'Current round',
	rndIntro: 'What the room is voting on now. Watched films are under Watched.',

	watH: 'Watched',
	watIntro:
		'Everything we have watched, a night at a time. This is where a film watched outside the voting gets written down: the cinema, a trip, or a film night nobody recorded. Nothing here reaches the voting list.',
	watAddH: 'Add a film we watched',
	watSearchPh: 'Search TMDB…',
	watNoResults: 'Nothing found.',
	watByHand: 'Type it by hand',
	watWhen: 'When',
	watWhere: 'Where',
	watFilmNight: 'A regular film night',
	watWho: 'Suggested by',
	watAdd: 'Add',
	watAddAnyway: 'Add anyway',
	watCancel: 'Cancel',
	watEmpty: 'Nothing watched yet.',

	audH: 'Recent changes',
	audEmpty: 'Nothing yet.',
	audLine: (who, action, target) => `${who} · ${action}${target ? ` · ${target}` : ''}`,

	error: (_code, _params, fallback) => fallback
};

export const ADMIN_DICT: Record<Lang, AdminDict> = { pl, en };

export function adminDict(lang: Lang): AdminDict {
	return ADMIN_DICT[lang];
}
