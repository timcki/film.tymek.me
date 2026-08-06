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
			pl: 'Nowe zasady: punkty gasną, obecność się liczy',
			en: 'New rules: points fade, showing up counts'
		},
		body: {
			pl: [
				'Dostajesz 2 punkty co tydzień. Bank znika; niewydane punkty przepadają po wieczorku.',
				'Punkty na filmie tracą co tydzień 25% wartości, więc lista pokazuje to, czego chcemy teraz. Kara za przegraną w top 3 znika razem z bankiem.',
				'Oddanych głosów nie można już cofać. Masz 30 sekund na poprawienie pomyłki, potem głos zostaje.',
				'Skanując kod w sali zapisujesz swoją obecność. Za przychodzenie, głosowanie i zgłoszenia dostajesz XP i poziomy; szczegóły w zakładce Ty.',
				'Wszystkie wyniki przeliczono od nowa z dotychczasowych głosów; nic nie przepadło.'
			],
			en: [
				'You get 2 points a week. The bank is gone; anything unspent expires after the night.',
				'Points on a film lose 25% of their value each week, so the list shows what we want now. The top-3 pass-over penalty is gone along with the bank.',
				'Votes can no longer be taken back. You get 30 seconds to fix a slip, then it stands.',
				'Scanning the room code records your attendance. Coming, voting and nominating earn XP and levels; details on the You tab.',
				'Every score was recomputed from the existing ballots; nothing was lost.'
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
