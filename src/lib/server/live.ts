import { randomUUID } from 'node:crypto';

/**
 * Which state of the world a phone last saw, so the list can ask "has anything
 * changed?" for the price of a short string instead of a whole page load.
 *
 * Not a stored counter: it lives in this process and starts again with it. The
 * boot id is what makes that safe, because a restart changes the string even
 * though the count starts from nothing, and any change at all is all a phone is
 * asking about. Its one writer is immediate() in db.ts, after a commit, so a
 * failed or rolled-back write never sends anybody to reload.
 */
const boot = randomUUID().slice(0, 8);
let count = 0;

export function bumpGeneration(): void {
	count += 1;
}

export function generation(): string {
	return `${boot}.${count}`;
}
