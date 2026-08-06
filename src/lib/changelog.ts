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
			pl: 'Nowe zasady: koniec kumulowania punktów, równe zabieranie punktów filmom, obecność+aktywność daje teraz XP',
			en: 'New rules: no more banking, points fade evenly, showing up and taking part earns XP'
		},
		body: {
			pl: [
				'Dostajesz teraz 3 punkty co tydzień, ale przestają się kumulować. Niewydane punkty przepadają po zamknięciu głosowania w danym tygodniu.',
				'Punkty na filmie tracą co tydzień 25% wartości. Wszystkim filmom zabieramy punkty po równo (top 3 nie jest bardziej karane).',
				'Oddanych głosów nie można już cofać. Masz 30 sekund na poprawienie pomyłki, potem głos jest na stałe.',
				'Skanując kod QR do głosowania zapisujesz swoją obecność. Za przychodzenie, głosowanie i zgłoszenia dostajesz XP i poziomy (co będzie nagrodą za poziomy: do wspólnej decyzji, na razie są tytuły i ładne rameczki).',
				'XP dostajesz za: przyjście na wieczorek (10), głosowanie w danym tygodniu (2), zgłoszenie filmu (1), obejrzenie twojego zgłoszenia (15) i punkty na zwycięzcy w tygodniu wygranej (3). Wszystko policzone wstecz od pierwszego tygodnia.',
				'Poziomów jest (na razie) 12, od Widza (0 XP) do Legendy kina (1000 XP). Twoja rameczka świeci się kolorem poziomu przy twojej twarzy, a pełna drabinka z progami jest w zakładce Ty.',
				'Wszystkie wyniki punktowe filmów przeliczono od nowa z dotychczasowych głosów. Skumulowane punkty z poprzedniego tygodnia niestety są stracone.',
				'PS: bardzo chętnie przyjmiemy propozycje i pomysły na lepsze tytuły, inne kolory ramek itd. (:'
			],
			en: [
				'You get 3 points a week now, but they no longer accumulate. Anything unspent expires when the week closes.',
				'Points on a film lose 25% of their value each week. Every film is taxed equally (the top 3 is not punished extra).',
				'Votes can no longer be taken back. You get 30 seconds to fix a slip, then it stands.',
				'Scanning the voting QR code records your attendance. Coming, voting and nominating earn XP and levels (what levels will be worth is up for a group decision; for now there are titles and pretty frames).',
				'XP comes from: attending a night (10), voting in a week (2), nominating a film (1), your nomination getting watched (15), and points on the winner in its winning week (3). All counted back to week one.',
				'There are (for now) 12 levels, from Viewer (0 XP) to Screen Legend (1000 XP). Your frame glows in your level colour next to your face, and the full ladder with thresholds lives on the You tab.',
				'Every film score was recomputed from the existing ballots. Points banked from previous weeks are unfortunately gone.',
				'PS: proposals and ideas for better titles, other frame colours and so on are very welcome (:'
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
