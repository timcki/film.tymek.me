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
	/** what an armed destructive button says before the second tap */
	sure: string;

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
	/** §3.6: how the open round votes, and what the whole site looks like */
	spcH: string;
	spcVote: string;
	spcList: string;
	spcIntro: string;
	spcLocked: string;
	spcSeePicks: string;
	/** §3.7: setting a special round up as a custom week */
	cwIntro: string;
	cwName: string;
	cwAbout: string;
	cwAboutPh: string;
	cwPicks: string;
	cwRulesH: string;
	cwRulesIntro: string;
	cwCountries: string;
	cwLanguages: string;
	cwFind: string;
	cwRulesLocked: string;
	cwEdit: string;
	cwSave: string;
	cwGenres: string;
	cwYears: string;
	cwRuntime: string;
	cwFrom: string;
	cwTo: string;
	cwDirectors: string;
	cwDirectorsPh: string;
	cwCoded: string;
	cwStart: string;
	cwCancel: string;
	cwNoRules: string;
	lookLabel: string;
	lookDefault: string;
	lookIntro: string;
	noticeH: string;
	noticePh: string;
	noticeSave: string;
	noticeIntro: string;

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
	filSearchPh: string;
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
	/* §3.5: placing somebody's hold for them, because the ask came by group chat */
	filHold: string;
	filHoldWhy: string;
	filRelease: string;
	filHeld: string;
	filEmpty: string;
	/** §3.6: the open special round's picks, kept apart from the list */
	filPicksH: (round: string) => string;
	filPicksIntro: string;
	filTicked: (any: boolean) => string;
	filTickedNote: string;

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
	watMove: string;
	watCancel: string;
	watEmpty: string;

	/* audit */
	audH: string;
	audEmpty: string;
	backupH: string;
	backupIntro: string;
	backupGet: string;
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
	sure: 'Na pewno?',

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
	spcH: 'Ta runda',
	spcVote: 'Głosowanie',
	spcList: 'Zwykłe, z listy',
	spcIntro:
		'Wieczór specjalny ma własne propozycje i własne głosowanie. ' +
		'Lista śpi do jego końca: nikt nie wydaje punktów, nic nie traci na wartości i nic nie wypada. ' +
		'Punkty wydane w tej rundzie wcześniej zostają. Odwołać go można, dopóki nikt nic nie zgłosił.',
	spcLocked: 'Ktoś już zgłosił propozycję, więc runda dobiegnie końca.',
	spcSeePicks: 'Zobacz propozycje',
	cwIntro: 'Wszystko jest opcjonalne. Bez nazwy i zasad to zwykły wieczór specjalny.',
	cwName: 'Nazwa',
	cwAbout: 'Opis',
	cwAboutPh: 'np. Tylko polskie kino, od Wajdy po dziś',
	cwPicks: 'Propozycji na osobę',
	cwRulesH: 'Zasady',
	cwRulesIntro:
		'Film musi spełnić każdą ustawioną zasadę, a w każdej wystarczy jedna z wybranych wartości. ' +
		'Sprawdzamy to w TMDB przy zgłoszeniu, więc z zasadami nie da się wpisać tytułu ręcznie.',
	cwCountries: 'Kraj produkcji',
	cwLanguages: 'Język oryginału',
	cwFind: 'Szukaj…',
	cwRulesLocked: 'Ktoś już zgłosił propozycję, więc zasad nie da się już zmienić.',
	cwEdit: 'Zmień',
	cwSave: 'Zapisz',
	cwGenres: 'Gatunek',
	cwYears: 'Rok premiery',
	cwRuntime: 'Długość w minutach',
	cwFrom: 'od',
	cwTo: 'do',
	cwDirectors: 'Reżyseria',
	cwDirectorsPh: 'np. Kieślowski, Holland',
	cwCoded: 'Inne',
	cwStart: 'Zacznij',
	cwCancel: 'Anuluj',
	cwNoRules: 'Bez zasad: pasuje każdy film.',
	lookLabel: 'Wygląd strony',
	lookDefault: 'Domyślny (każdy wybiera sam)',
	lookIntro:
		'Domyślnie każdy wybiera sobie ciemny, jasny albo bananowy. Inny wygląd widzą wszyscy, dopóki go nie zmienisz.',
	noticeH: 'Ogłoszenie',
	noticePh: 'np. W czwartek oglądamy u Ani',
	noticeSave: 'Zapisz',
	noticeIntro:
		'Pasek nad każdą stroną, dla wszystkich, dopóki go nie zmienisz. Każdy może go u siebie zamknąć. Puste pole zdejmuje ogłoszenie.',

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

	filSearchPh: 'Szukaj filmu…',
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
	filDeleteNote: 'Nie da się usunąć: ktoś już na niego głosował.',
	filReassignH: 'Zgłaszający',
	filHold: 'Liberum veto',
	filHoldWhy: 'Powód (opcjonalnie)',
	filRelease: 'Wycofaj',
	filHeld: 'veto',
	filPicksH: (round) => `Propozycje: ${round}`,
	filPicksIntro:
		'Dopóki tu coś jest, wieczoru specjalnego nie da się odwołać ani zmienić jego zasad. ' +
		'Usunąć można propozycję, której nikt jeszcze nie zaznaczył.',
	filTicked: (any) => (any ? 'ktoś już zaznaczył' : 'nikt jeszcze nie zaznaczył'),
	filTickedNote: 'Nie da się usunąć: ktoś już ją zaznaczył.',
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
	watMove: 'Zapisz kiedy i gdzie',
	watCancel: 'Anuluj',
	watEmpty: 'Jeszcze nic nie obejrzeliśmy.',

	audH: 'Ostatnie zmiany',
	audEmpty: 'Jeszcze nic.',
	backupH: 'Kopia zapasowa',
	backupIntro:
		'Cała baza w jednym pliku, taka jak teraz. Są w niej osobiste linki wszystkich, więc trzymaj ją u siebie i nikomu nie wysyłaj.',
	backupGet: 'Pobierz kopię',
	audLine: (who, action, target) => `${who} · ${action}${target ? ` · ${target}` : ''}`,

	error: (code, p, fallback) => {
		switch (code) {
			case 'night_exists':
				return 'Taki termin już jest w kalendarzu.';
			case 'no_night':
				return 'Nie ma takiego terminu.';
			case 'night_used':
				return 'Ten wieczorek już się odbył.';
			case 'night_past':
				return 'Ten termin już minął. Wybierz datę w przyszłości.';
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
				return `Ta osoba uśpiła w tej rundzie ${p.title}.`;
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
			case 'no_look':
				return 'Nie ma takiego wyglądu.';
			case 'custom_name_long':
				return `Nazwa może mieć najwyżej ${p.max} znaków.`;
			case 'custom_about_long':
				return `Opis może mieć najwyżej ${p.max} znaków.`;
			case 'custom_picks':
				return `Każdy może zgłosić od 1 do ${p.max} propozycji.`;
			case 'custom_years':
				return 'Lata muszą być między 1870 a 2100, a „od” nie później niż „do”.';
			case 'custom_rules_locked':
				return 'Ktoś już zgłosił propozycję, więc zasad nie da się już zmienić.';
			case 'custom_picks_used':
				return `Ktoś zgłosił już tyle propozycji: ${p.most}. Mniej się nie da.`;
			case 'custom_runtime':
				return 'Długość musi być między 1 a 1000 minut, a „od” nie więcej niż „do”.';
			case 'notice_too_long':
				return `Ogłoszenie może mieć najwyżej ${p.max} znaków.`;
			case 'not_a_record':
				return 'Ten film wybrała runda, więc zostaje przy jej wieczorku.';
			case 'room_picking':
				return 'Sala właśnie wybiera film.';
			case 'week_closed':
				return 'Ta runda jest zamknięta.';
			case 'deadline_passed':
				return 'Termin tej rundy już minął.';
			case 'title_too_long':
				return `Tytuł może mieć najwyżej ${p.max} znaków.`;
			case 'note_too_long':
				return `Notka może mieć najwyżej ${p.max} znaków.`;
			case 'bad_poster':
				return 'Plakat musi pochodzić z TMDB.';
			case 'list_asleep':
				return 'Zwykła lista śpi do końca specjalnej rundy.';
			case 'demo_no_rotate':
				return 'W demo nie ma linków do zmiany.';
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
	sure: 'Sure?',

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
	spcH: 'This round',
	spcVote: 'Voting',
	spcList: 'The usual, off the list',
	spcIntro:
		'A special night has its own picks and its own vote. ' +
		'The list sleeps until it is over: nobody spends points, nothing fades and nothing drops. ' +
		'Points already spent this round stay where they are. It can be called off until somebody puts a pick up.',
	spcLocked: 'Somebody has already put a pick up, so the round runs its course.',
	spcSeePicks: 'See the picks',
	cwIntro: 'Everything is optional. With no name and no rules it is a plain special night.',
	cwName: 'Name',
	cwAbout: 'Description',
	cwAboutPh: 'e.g. Polish cinema only, from Wajda to now',
	cwPicks: 'Picks each',
	cwRulesH: 'Rules',
	cwRulesIntro:
		'A film has to meet every rule that is set, and any one of the values chosen for each. ' +
		'TMDB is asked when the pick goes up, so a week with rules takes no typed-in titles.',
	cwCountries: 'Production country',
	cwLanguages: 'Original language',
	cwFind: 'Search…',
	cwRulesLocked: 'Somebody has already put a pick up, so the rules can no longer change.',
	cwEdit: 'Change',
	cwSave: 'Save',
	cwGenres: 'Genre',
	cwYears: 'Release year',
	cwRuntime: 'Runtime in minutes',
	cwFrom: 'from',
	cwTo: 'to',
	cwDirectors: 'Director',
	cwDirectorsPh: 'e.g. Kieślowski, Holland',
	cwCoded: 'Other',
	cwStart: 'Start',
	cwCancel: 'Cancel',
	cwNoRules: 'No rules: any film fits.',
	lookLabel: 'Site look',
	lookDefault: 'Default (everyone picks their own)',
	lookIntro:
		'By default everyone picks dark, light or banana for themselves. Any other look is what everybody sees until you change it.',
	noticeH: 'Announcement',
	noticePh: 'e.g. Thursday we watch at Ania’s',
	noticeSave: 'Save',
	noticeIntro:
		'A bar above every page, for everyone, until you change it. Anyone can close it for themselves. An empty field takes it down.',

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

	filSearchPh: 'Find a film…',
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
	filDeleteNote: 'Cannot be deleted: somebody has voted for it.',
	filReassignH: 'Nominated by',
	filHold: 'Liberum veto',
	filHoldWhy: 'Reason (optional)',
	filRelease: 'Put it back',
	filHeld: 'held',
	filPicksH: (round) => `Picks: ${round}`,
	filPicksIntro:
		'While anything is here, the special night cannot be called off and its rules cannot change. ' +
		'A pick nobody has ticked yet can be deleted.',
	filTicked: (any) => (any ? 'somebody has ticked it' : 'nobody has ticked it yet'),
	filTickedNote: 'Cannot be deleted: somebody has ticked it.',
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
	watMove: 'Save when and where',
	watCancel: 'Cancel',
	watEmpty: 'Nothing watched yet.',

	audH: 'Recent changes',
	audEmpty: 'Nothing yet.',
	backupH: 'Backup',
	backupIntro:
		'The whole database in one file, as it is right now. It holds everyone’s personal links, so keep it to yourself and send it to nobody.',
	backupGet: 'Download a copy',
	audLine: (who, action, target) => `${who} · ${action}${target ? ` · ${target}` : ''}`,

	error: (_code, _params, fallback) => fallback
};

export const ADMIN_DICT: Record<Lang, AdminDict> = { pl, en };

export function adminDict(lang: Lang): AdminDict {
	return ADMIN_DICT[lang];
}
