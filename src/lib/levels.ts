/**
 * The XP ladder. Thresholds are cumulative XP; the names live in the i18n
 * dictionaries under `levels`, one per rung, so both files must stay the same
 * length (a test holds them to it).
 */
export const LEVELS = [0, 30, 75, 150, 250, 400, 600, 850];

/** 0-based rung for a given XP total */
export function levelOf(xp: number): number {
	let level = 0;
	for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i]) level = i;
	return level;
}

/** the next threshold to chase, or null from the top rung */
export function nextLevelAt(xp: number): number | null {
	const level = levelOf(xp);
	return level + 1 < LEVELS.length ? LEVELS[level + 1] : null;
}
