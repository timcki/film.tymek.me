/**
 * §7.2: the count on the projector. The host starts it; phones hold the result
 * until it has run, so the room learns the winner from the screen and not from
 * the phone in its hand. Shared, because the phone has to wait exactly as long
 * as the screen takes.
 */

/** the beat after the last ballot lands, before anything settles */
export const REVEAL_PAUSE_MS = 450;
/** the extra beat a cycle gets, while ranked points are said out loud */
export const TIEBREAK_MS = 3200;
/** the posters gliding into their final places */
export const SETTLE_MS = 900;
/** a room nobody counted (it closed on its own clock) still tells its phones */
export const REVEAL_GRACE_MS = 10 * 60 * 1000;

/** long enough on each ballot to read whose it is and where it went: a small
 * room gets a slow, deliberate count, a full one about half a minute */
export function revealStep(turnout: number): number {
	return Math.min(2600, Math.max(1500, 30000 / Math.max(1, turnout)));
}

export function revealLength(turnout: number, tiebreak: boolean): number {
	return turnout * revealStep(turnout) + REVEAL_PAUSE_MS + (tiebreak ? TIEBREAK_MS : 0) + SETTLE_MS;
}

/** whether a closed room's phones may show its result yet */
export function resultPublic(
	room: { closed_at: string | null; revealed_at: string | null },
	turnout: number,
	tiebreak: boolean,
	now: Date
): boolean {
	if (!room.closed_at) return false;
	const at = now.getTime();
	if (room.revealed_at) return at >= new Date(room.revealed_at).getTime() + revealLength(turnout, tiebreak);
	return at >= new Date(room.closed_at).getTime() + REVEAL_GRACE_MS;
}
