import type { Lang } from './i18n.js';

/**
 * What changed, said to each person exactly once: the modal shows every entry
 * newer than person.changelog_seen, and dismissing records the newest id.
 * Append-only; ids are monotonic and never reused. Routine deploys with
 * nothing worth saying simply add no entry, so nobody sees a modal.
 */
export type ChangelogEntry = {
	id: number;
	/** shown to the reader, an ISO day */
	date: string;
	title: Record<Lang, string>;
	body: Record<Lang, string[]>;
};

export const CHANGELOG: ChangelogEntry[] = [
	{
		id: 1,
		date: '2026-08-06',
		title: {
			pl: 'Nowe zasady: koniec kumulowania punktów, równe obcinanie filmów, obecność+aktywność daje teraz XP',
			en: 'New rules: no more banking, every film trimmed equally, showing up and taking part earns XP'
		},
		body: {
			pl: [
				'Dostajesz teraz 3 punkty co tydzień, ale przestają się kumulować. Niewydane punkty przepadają po zamknięciu głosowania w danym tygodniu.',
				'Punkty na filmie tracą co tydzień 25% wartości. Wszystkim filmom zabieramy punkty po równo (top 3 nie jest bardziej karane).',
				'Oddanych głosów nie można już cofać. Masz 30 sekund na poprawienie pomyłki, potem głos jest na stałe.',
				'Do głosowania jest teraz guzik z trzema kropkami na każdej karcie: niebieski checkmark to twój punkt na tym filmie, przygaszona kropka to punkt wydany na inny film, a przerywana to wolny punkt. Trzeba kliknąć dwa razy, żeby zatwierdzić głos. Pomyłkę da się cofnąć przez 30 sekund w szczegółach filmu (po kliknięciu plakatu).',
				'Skanując kod QR do głosowania zapisujesz swoją obecność. Za przychodzenie, głosowanie i zgłoszenia dostajesz XP i poziomy (co będzie nagrodą za poziomy jest do wspólnej decyzji, na razie są tytuły i ładne świecące rameczki).',
				'XP dostajesz za: przyjście na wieczorek (10), głosowanie w danym tygodniu (2), zgłoszenie filmu (1), obejrzenie twojego zgłoszenia (15) i punkty oddane na zwycięski film (3). Wszystko policzone wstecz od pierwszego tygodnia z archiwum (na ile się da).',
				'Wszystkie wyniki punktowe filmów przeliczono od nowa z dotychczasowych głosów. Skumulowane punkty z poprzedniego tygodnia niestety są stracone.',
				'PS: bardzo chętnie przyjmiemy propozycje i pomysły na lepsze tytuły, inne kolory ramek, interfejs głosowania itd. (:'
			],
			en: [
				'You get 3 points a week now, but they no longer accumulate. Anything unspent expires when the week closes.',
				'Points on a film lose 25% of their value each week. Every film is taxed equally (the top 3 is not punished extra).',
				'Votes can no longer be taken back. You get 30 seconds to fix a slip, then it stands.',
				'Voting is now a button with three dots on every card: the blue check is your point on this film, a dim dot is a point spent on another film, and a dashed one is still free. It takes two taps to confirm a vote. A slip can be undone for 30 seconds in the film details (tap the poster).',
				'Scanning the voting QR code records your attendance. Coming, voting and nominating earn XP and levels (what levels will be worth is up for a group decision; for now there are titles and pretty glowing frames).',
				'XP comes from: attending a night (10), voting in a week (2), nominating a film (1), your nomination getting watched (15), and points cast on the winning film (3). All counted back from week one out of the archive (as far as it reaches).',
				'Every film score was recomputed from the existing ballots. Points banked from previous weeks are unfortunately gone.',
				'PS: proposals and ideas for better titles, other frame colours, the voting interface and so on are very welcome (:'
			]
		}
	},
	{
		id: 2,
		date: '2026-08-17',
		title: {
			pl: 'Komentarze, kto już widział, możliwość wycofania filmu z top 5',
			en: 'Comments, who has seen it, and pulling a film from the top five'
		},
		body: {
			pl: [
				'Mamy teraz top 5 zamiast top 3. Vox populi vox dei',
				'Do każdego filmu jest teraz dodana sekcja komentarzy, zapraszam do dzielenia się swoimi opiniami o propozycjach innych uczestników 😇',
				'Jest też możliwość zaznaczenia czy widziało się już film używając ikonki oka w prawym dolnym rogu karty',
				'Jeśli nie będzie cię na wieczorku, a twój film jest w top 5, możesz „uśpić” swój film na ten tydzień (z komentarzem tłumaczącym dlaczego cię nie ma, tak jak np. Adam i Fitzcarraldo, które zajmowało niepotrzebnie miejsce w top 3)',
				'Wycofać można jeden film na tydzień i tylko taki, który samemu się zgłosiło. Można anulować wycofanie z top 5 do samego zamknięcia głosowania.',
				'Punkty na nim tracą wartość tak samo jak wszędzie indziej, więc czekanie kosztuje: wracasz za tydzień z połową przewagi.'
			],
			en: [
				'The room now picks from a top five instead of a top three. Vox populi vox dei',
				'Every film has a comment section now; do share what you make of what everyone else has put up 😇',
				'You can also mark a film as one you have already seen, using the eye in the bottom right corner of its card',
				'Not coming to the night and your film is in the top five? You can put it to sleep for the week, with a note saying why you are away (Adam and Fitzcarraldo, say, which was taking up a place in the top three for nothing)',
				'One film a week, and only one you nominated yourself. You can undo it right up to the close of voting.',
				'Its points fade exactly as they would anywhere else, so waiting costs you: you come back next week with half the lead.'
			]
		}
	},
	{
		id: 3,
		date: '2026-08-17',
		title: {
			pl: 'Funkcja uśpienia to teraz Liberum veto',
			en: 'The sleep button is now Liberum veto'
		},
		body: {
			pl: ['Dzięki Zosia ((:'],
			en: ['Thanks Zosia ((:']
		}
	},
	{
		id: 4,
		date: '2026-08-25',
		title: {
			pl: 'Wraca top 3, można zmieniać pick na qr głosowaniu',
			en: 'Back to top three, and a vote in the room can be changed again'
		},
		body: {
			pl: [
				'Wracamy do top 3 filmów z 5. Przy 5 kandydatach nie było już żadnej selekcji i konkurencji między filmami. Jako że motywacją było top 3 z Fitzcarraldo którego Adam prosił o nieogladanie, wprowadzenie możliwości usypiania filmów pozwoli zawsze mieć pełne top 3.',
				'Głos oddany przez kod QR w sali nie jest już ostateczny. Julka słusznie zauważyła że fajnie byłoby go przenieść na inny film jeśli widzimy, że aktualne pierwsze miejsce jest dla nas najgorsze z 3.',
				'To dotyczy tylko głosowania w sali. Punkty oddawane w ciągu tygodnia dalej są ostateczne po 30 sekundach.',
				'Uśpione filmy nie zajmują już miejsca w top 3, schodzą do reszty listy i zajmują mniej miejsca.',
				'Jest nowy szczegółowy ekran filmu (po kliknięciu plakatu) dajcie znać co myślicie.'
			],
			en: [
				'The room picks from a top three again, not a top five. We added this only because of the night where Fitzcarraldo was in the top 3 and Adam asked us not to watch it (which effectively made it a top 2). With the possibility to sleep movies the problem is gone. 5 candidates made us just vote on vaguely all the movies top 3 is more competitive and makes us think about what we vote on.',
				"A flash vote in the room is no longer final: you can move it to another film right up until the host closes the voting. The last tap is the one that counts. Julia noticed that it'd be nice to be able to switch to the 3rd option when you see yours won't win and the one that's winning is the worst of the 3 (in your opinion).",
				'This is the room only. Points cast during the week are still final thirty seconds after you spend them.',
				'A sleeping film no longer takes up a place in the top three: it drops below the divider into the rest of the list as a slim row.',
				'The film screen (tap a poster) is rebuilt: lmk what yall think'
			]
		}
	}
];

export function latestChangelogId(): number {
	return CHANGELOG.reduce((max, entry) => Math.max(max, entry.id), 0);
}

export function unseenChangelog(seen: number): ChangelogEntry[] {
	return CHANGELOG.filter((entry) => entry.id > seen).sort((a, b) => b.id - a.id);
}
