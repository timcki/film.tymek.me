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
			pl: 'Twój film może poczekać tydzień, jeśli ciebie nie będzie',
			en: 'Your film can wait a week if you cannot make it'
		},
		body: {
			pl: [
				'Nie będzie cię na wieczorku, a twój film jest wysoko? Otwórz go (kliknij plakat) i daj „Niech poczeka tydzień”. Nie pójdzie wtedy pod głosowanie w sali, a jego miejsce zajmie kolejny film z listy.',
				'Jeden film na tydzień i tylko taki, który sam zgłosiłeś. Cofnąć możesz do samego zamknięcia głosowania.',
				'Punkty na nim tracą wartość tak samo jak wszędzie indziej, więc czekanie kosztuje: wracasz za tydzień z połową przewagi.',
				'Wszyscy to widzą od razu (💤 na karcie), żeby zdążyli przerzucić głosy gdzie indziej. Możesz dopisać powód, wtedy nie trzeba już pisać na grupie.',
				'Jeśli akurat wszystkie filmy z czołówki poczekają, to nie czeka żaden: sala i tak dostaje swój wieczór.'
			],
			en: [
				'Not coming to the night and your film is riding high? Open it (tap the poster) and hit "Hold it a week". It stays out of the room vote and the next film on the list takes its place.',
				'One film a week, and only one you nominated yourself. You can undo it right up to the close.',
				'Its points fade exactly as they would anywhere else, so waiting costs you: you come back next week with half the lead.',
				'Everyone sees it the moment it happens (💤 on the card), so there is time to put votes somewhere else. You can add a reason, which saves writing to the group chat.',
				'If every leading film ends up waiting, none of them does: the room gets its night regardless.'
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
