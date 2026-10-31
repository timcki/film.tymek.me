import { getDb, immediate, type DB } from './db.js';
import { activeRules } from './config.js';
import type { RuleSet } from './rules.js';
import { closeWeek, currentWeek, openWeek, syncOpenWeek } from './weeks.js';
import { closeExpiredRunoffs } from './runoffs.js';
import { rescoreAll } from './scoring.js';
import { rexpAll } from './xp.js';
import { iso } from './time.js';

let timer: NodeJS.Timeout | null = null;

/**
 * §10: switching RULES rescores everything from the ballots and is announced on
 * the page for one week. Recorded once per change, not once per tick.
 */
function noteRuleSet(db: DB, rules: RuleSet, week: number, now: Date): void {
	const last = db
		.prepare('SELECT rules_id FROM rules_change ORDER BY id DESC LIMIT 1')
		.get() as { rules_id: string } | undefined;
	if (last?.rules_id === rules.id) return;
	db.prepare('INSERT INTO rules_change (rules_id, week_number, created_at) VALUES (?, ?, ?)').run(
		rules.id,
		week,
		iso(now)
	);
}

/** §6.1: wakes every minute, closes any week whose deadline has passed */
export function tick(now: Date = new Date(), db: DB = getDb()): void {
	const rules = activeRules();
	closeExpiredRunoffs(db, rules, now);

	immediate(db, () => {
		// the calendar is the single source of truth for the deadline, so pick up any
		// change to it before deciding whether the round is over
		const week = syncOpenWeek(db) ?? currentWeek(db) ?? openWeek(db, 1, now);
		noteRuleSet(db, rules, week.number, now);

		if (week.status === 'open' && new Date(week.closes_at).getTime() <= now.getTime()) {
			closeWeek(db, rules, now);
			return;
		}

		// keeps the caches honest even when nobody has voted since a rule-set change
		// or a migration seeded new data
		rescoreAll(db, rules, week.number);
		rexpAll(db);
	});
}

export function startScheduler(): void {
	if (timer) return;
	try {
		tick();
	} catch (error) {
		console.error('[scheduler] first tick failed', error);
	}
	timer = setInterval(() => {
		try {
			tick();
		} catch (error) {
			console.error('[scheduler] tick failed', error);
		}
	}, 60_000);
	timer.unref?.();
}
