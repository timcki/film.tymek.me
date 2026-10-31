import type { DB } from './db.js';
import { immediate } from './db.js';
import { RuleError } from './types.js';
import { currentWeek } from './weeks.js';

export const NOTICE_MAX = 200;

/** the announcement over every page, if one is up: whatever an admin last pinned */
export function noticeAt(db: DB): string | null {
	const row = db
		.prepare('SELECT notice FROM week WHERE notice IS NOT NULL ORDER BY number DESC LIMIT 1')
		.get() as { notice: string } | undefined;
	return row?.notice || null;
}

/** pin an announcement, or take it down with a blank one */
export function setNotice(db: DB, text: string): string | null {
	const cleaned = text.trim().replace(/\s+/g, ' ');
	if (cleaned.length > NOTICE_MAX) {
		throw new RuleError('notice_too_long', `keep it under ${NOTICE_MAX} characters`, {
			max: NOTICE_MAX
		});
	}
	immediate(db, () => {
		const week = currentWeek(db);
		if (!week) throw new RuleError('no_week', 'no week is open yet');
		db.prepare('UPDATE week SET notice = ? WHERE number = ?').run(cleaned, week.number);
	});
	return cleaned || null;
}
