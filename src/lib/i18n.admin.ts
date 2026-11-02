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
	/** the trap: a date before the round's own closes the list there */
	calAddHint: (night: string) => string;
	calUpcomingH: string;
	calPastH: string;
	calEmpty: string;
	calPastEmpty: string;
	calClosesRound: string;
	calOverdue: string;
	calUsed: (evening: number) => string;
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
	spcStopAsk: (extra: boolean) => string;
	spcStopGo: string;
	spcStopKeep: string;
	xnBtn: string;
	xnIntro: string;
	xnBusy: string;
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
	/** §3.6: a special round on a date of its own, before the round's night */
	cwExtra: string;
	cwExtraHint: (night: string) => string;
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
	/** another film from TMDB in this one's place, votes kept */
	filReplace: string;
	filReplaced: (title: string) => string;
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
		'Runda kończy się w najbliższym zaplanowanym terminie. Usunięcie terminu przedłuża rundę do następnego, a punkty dostajecie po każdym obejrzanym filmie, nie co tydzień.',
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
	calAddHint: (night) =>
		`Termin przed ${night} zamknie zwykłą listę wcześniej. Wieczór, który listy nie rusza, ustawisz wyżej: wybierz specjalne głosowanie i podaj mu własną datę.`,
	calUpcomingH: 'Nadchodzące',
	calPastH: 'Minione',
	calEmpty: 'Nic nie zaplanowane.',
	calPastEmpty: 'Jeszcze żadnego wieczorku z kalendarza.',
	calClosesRound: 'zamyka bieżącą rundę',
	calOverdue: 'termin minął',
	calUsed: (evening) => `wieczorek ${evening}`,
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
		'Potem lista budzi się tam, gdzie była: wydane punkty, zgłoszenia i wstrzymania zostają. Odwołać go można w każdej chwili, razem ze zgłoszonymi propozycjami.',
	spcLocked: 'Są już propozycje, więc zasady nie mogą się zmienić.',
	spcSeePicks: 'Zobacz propozycje',
	spcStopAsk: (extra) =>
		`Odwołać wieczór specjalny? Wszystkie propozycje i głosy znikną${extra ? ', a jego termin zniknie z kalendarza' : ''}. Lista wróci do swojej rundy bez zmian.`,
	spcStopGo: 'Odwołaj wieczór',
	spcStopKeep: 'Zostaw',
	xnBtn: 'Wieczór dodatkowy teraz',
	xnIntro:
		'Dla spontanicznego spotkania: zaczyna wieczór specjalny od razu, bez wybierania daty, z głosowaniem zatwierdzającym jak w wieczorze specjalnym. Lista tylko zasypia i budzi się dokładnie taka, jaka była. Zamyka się sam po dwóch godzinach, a wcześniej zamkniesz go w pokoju (/host). Odwołać go można wyborem „Lista” powyżej.',
	xnBusy:
		'Wieczór specjalny już trwa, a naraz trwa tylko jedno głosowanie. Odwołaj go albo poczekaj, aż się skończy, żeby zacząć wieczór dodatkowy.',
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
	cwExtra: 'Własna data',
	cwExtraHint: (night) =>
		`Zostaw puste, a wieczorem specjalnym będzie ${night}, termin, który już jest w kalendarzu. Podaj wcześniejszy termin, a powstanie nowy wieczór dodatkowy: lista poczeka i potem pobiegnie dalej do ${night}, jakby nic się nie stało. Usunięcie tego terminu odwoła wieczór specjalny.`,
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
	filReplace: 'Zamień na inny film z TMDB…',
	filReplaced: (title) =>
		`Po zapisaniu to będzie ${title}, także pod spodem: opis, kraje, reżyseria i dane z TMDB. Głosy, komentarze i zgłaszający zostają.`,
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
	filHold: 'Uśpij',
	filHoldWhy: 'Powód (opcjonalnie)',
	filRelease: 'Wycofaj',
	filHeld: 'śpi',
	filPicksH: (round) => `Propozycje: ${round}`,
	filPicksIntro:
		'Dopóki tu coś jest, zasad wieczoru specjalnego nie da się zmienić. Odwołanie wieczoru kasuje wszystkie propozycje. ' +
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
			case 'extra_not_before':
				return 'Dodatkowy wieczór musi wypaść przed końcem bieżącej rundy.';
			case 'extra_too_early':
				return 'Wcześniej w kalendarzu jest już inny wieczór, więc dodatkowy musi wypaść przed nim.';
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
		'A round ends on the next planned date. Deleting one runs the round on to the date after, and points are handed out after each film we watch rather than every week.',
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
	calAddHint: (night) =>
		`A date before ${night} closes the regular list early. For a night that leaves the list alone, pick a special vote above and give it a date of its own.`,
	calUpcomingH: 'Coming up',
	calPastH: 'Past',
	calEmpty: 'Nothing planned.',
	calPastEmpty: 'No film night has run off the calendar yet.',
	calClosesRound: 'closes the current round',
	calOverdue: 'overdue',
	calUsed: (evening) => `night ${evening}`,
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
		'Then the list wakes where it was: points spent, nominations and holds all stay. It can be called off at any time, picks and all.',
	spcLocked: 'There are picks up, so the rules can no longer change.',
	spcSeePicks: 'See the picks',
	spcStopAsk: (extra) =>
		`Call the special night off? Every pick and every tick goes${extra ? ', and its date leaves the calendar' : ''}. The list returns to its round exactly as it was.`,
	spcStopGo: 'Call it off',
	spcStopKeep: 'Keep it',
	xnBtn: 'Extra night now',
	xnIntro:
		'For a spur-of-the-moment get-together: starts a special night right away, no date to pick, with the same approval vote. The list only sleeps and wakes exactly as it was. It closes by itself after two hours, and sooner from the room screen (/host). Call it off with the “List” choice above.',
	xnBusy:
		'A special night is already on, and only one vote runs at a time. Call it off or let it finish before starting an extra night.',
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
	cwExtra: 'Own date',
	cwExtraHint: (night) =>
		`Leave it empty and the special night is ${night}, the date already in the calendar. Give an earlier date and a new extra night is created: the list waits, then carries on to ${night} as if nothing had happened. Deleting the date calls the special night off.`,
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
	filReplace: 'Swap for another film from TMDB…',
	filReplaced: (title) =>
		`Once saved this is ${title}, underneath too: description, countries, director and its TMDB record. Votes, comments and the nominator stay.`,
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
	filHold: 'Put to sleep',
	filHoldWhy: 'Reason (optional)',
	filRelease: 'Put it back',
	filHeld: 'held',
	filPicksH: (round) => `Picks: ${round}`,
	filPicksIntro:
		'While anything is here, the special night’s rules cannot change. Calling the night off erases every pick. ' +
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
