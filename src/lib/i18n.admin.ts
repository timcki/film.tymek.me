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
	navArchive: string;
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
	calUsed: (week: number) => string;
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
	filBy: (name: string, week: number) => string;
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
	filWatchedH: string;
	filWeek: string;
	filMarkWatched: string;
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

	/* the archive */
	arcH: string;
	arcIntro: string;
	arcProgress: (done: number, total: number) => string;
	arcOnlyUnattributed: string;
	arcAllNights: string;
	arcWinner: string;
	arcNothing: string;
	arcWho: string;
	arcAddOpen: string;
	arcAddH: (week: number) => string;
	arcSearchPh: string;
	arcNoResults: string;
	arcByHand: string;
	arcWasWatched: string;
	arcWasProposed: string;
	arcAdd: string;
	arcAddAnyway: string;
	arcCancel: string;
	arcMoveH: string;
	arcMove: string;
	arcEmpty: string;

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
	navArchive: 'Archiwum',
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
	calUsed: (week) => `runda ${week}`,
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
	filBy: (name, week) => `${name}, tydzień ${week}`,
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
	filWatchedH: 'Oznacz jako obejrzany',
	filWeek: 'Tydzień',
	filMarkWatched: 'Zapisz jako obejrzany',
	filReassignH: 'Zgłaszający',
	filReassign: 'Przepisz',
	filHold: 'Liberum veto',
	filHoldWhy: 'Powód (opcjonalnie)',
	filRelease: 'Wycofaj',
	filEmpty: 'Brak filmów.',

	rndH: 'Bieżąca runda',
	rndIntro: 'Filmy, na które teraz się głosuje. Obejrzane trafiają do archiwum.',

	arcH: 'Archiwum',
	arcIntro:
		'Zapis tego, co już się wydarzyło, wieczór po wieczorze. Nic tutaj nie trafia na listę do głosowania.',
	arcProgress: (done, total) => `${done} z ${total} filmów przypisanych`,
	arcOnlyUnattributed: 'Tylko nieprzypisane',
	arcAllNights: 'Wszystkie wieczory',
	arcWinner: 'Obejrzany',
	arcNothing: 'Nic nie zapisano.',
	arcWho: 'Kto zaproponował',
	arcAddOpen: '+ Dopisz film',
	arcAddH: (week) => `Dopisz film do tygodnia ${week}`,
	arcSearchPh: 'Szukaj w TMDB…',
	arcNoResults: 'Nic nie znaleziono.',
	arcByHand: 'Wpisz ręcznie',
	arcWasWatched: 'Obejrzeliśmy go tego wieczoru',
	arcWasProposed: 'Tylko zaproponowany',
	arcAdd: 'Dopisz',
	arcAddAnyway: 'Dopisz mimo to',
	arcCancel: 'Anuluj',
	arcMoveH: 'Wieczór',
	arcMove: 'Przenieś',
	arcEmpty: 'Archiwum jest puste.',

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
				return 'Ktoś na niego głosował. Przenieś do archiwum zamiast usuwać.';
			case 'film_watched':
				return 'Ten film już oglądaliśmy.';
			case 'nomination_clash':
				return 'Ta osoba ma już zgłoszenie z tego tygodnia.';
			case 'no_such_week':
				return `Nie ma tygodnia ${p.week}.`;
			case 'use_mark_watched':
				return 'Użyj „oznacz jako obejrzany”, żeby zapisać tydzień.';
			case 'no_title':
				return 'Podaj tytuł.';
			case 'dup_active':
				return `${p.title} jest już na liście.`;
			case 'week_has_winner':
				return `W tygodniu ${p.week} oglądaliśmy już ${p.title}.`;
			case 'dup_archival':
				return `${p.title} jest już zapisany (tydzień ${p.week}).`;
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
	navArchive: 'Archive',
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
	calUsed: (week) => `round ${week}`,
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
	filBy: (name, week) => `${name}, week ${week}`,
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
	filWatchedH: 'Mark as watched',
	filWeek: 'Week',
	filMarkWatched: 'Record as watched',
	filReassignH: 'Nominated by',
	filReassign: 'Reassign',
	filHold: 'Liberum veto',
	filHoldWhy: 'Reason (optional)',
	filRelease: 'Put it back',
	filEmpty: 'No films.',

	rndH: 'Current round',
	rndIntro: 'What the room is voting on now. Watched films move to the archive.',

	arcH: 'Archive',
	arcIntro:
		'The record of what already happened, a night at a time. Nothing here reaches the voting list.',
	arcProgress: (done, total) => `${done} of ${total} films attributed`,
	arcOnlyUnattributed: 'Unattributed only',
	arcAllNights: 'All nights',
	arcWinner: 'Watched',
	arcNothing: 'Nothing written down.',
	arcWho: 'Suggested by',
	arcAddOpen: '+ Add a film',
	arcAddH: (week) => `Add a film to week ${week}`,
	arcSearchPh: 'Search TMDB…',
	arcNoResults: 'Nothing found.',
	arcByHand: 'Type it by hand',
	arcWasWatched: 'We watched it that night',
	arcWasProposed: 'Only proposed',
	arcAdd: 'Add',
	arcAddAnyway: 'Add anyway',
	arcCancel: 'Cancel',
	arcMoveH: 'Night',
	arcMove: 'Move',
	arcEmpty: 'The archive is empty.',

	audH: 'Recent changes',
	audEmpty: 'Nothing yet.',
	audLine: (who, action, target) => `${who} · ${action}${target ? ` · ${target}` : ''}`,

	error: (_code, _params, fallback) => fallback
};

export const ADMIN_DICT: Record<Lang, AdminDict> = { pl, en };

export function adminDict(lang: Lang): AdminDict {
	return ADMIN_DICT[lang];
}
