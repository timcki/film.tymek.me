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
	}
];

export function latestChangelogId(): number {
	return CHANGELOG.reduce((max, entry) => Math.max(max, entry.id), 0);
}

export function unseenChangelog(seen: number): ChangelogEntry[] {
	return CHANGELOG.filter((entry) => entry.id > seen).sort((a, b) => b.id - a.id);
}
