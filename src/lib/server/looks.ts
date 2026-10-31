import type { DB } from './db.js';
import { immediate } from './db.js';
import { RuleError } from './types.js';
import { currentWeek } from './weeks.js';
import { isLook, type Look } from '../themes.js';

/**
 * §3.6: which look the site wears right now, if any: the latest choice an admin
 * made, in whichever round they made it. Independent of the way the round votes.
 */
export function lookAt(db: DB): Look | null {
	const row = db
		.prepare('SELECT look FROM week WHERE look IS NOT NULL ORDER BY number DESC LIMIT 1')
		.get() as { look: string } | undefined;
	return isLook(row?.look) ? row.look : null;
}

/** §3.6: put a look on the whole site, or take it off with null */
export function setLook(db: DB, look: Look | null): void {
	immediate(db, () => {
		const week = currentWeek(db);
		if (!week) throw new RuleError('no_week', 'no week is open yet');
		db.prepare('UPDATE week SET look = ? WHERE number = ?').run(look ?? 'default', week.number);
	});
}
