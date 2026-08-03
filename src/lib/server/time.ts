import { TIMEZONE } from '../datetime.js';

export { TIMEZONE };
export const DEADLINE_HOUR = 20;
const THURSDAY = 4;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
	let f = formatters.get(tz);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			hour12: false,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		formatters.set(tz, f);
	}
	return f;
}

export type CivilTime = {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
};

/** the wall-clock time in `tz` at a given instant */
export function localParts(instant: Date, tz: string = TIMEZONE): CivilTime {
	const parts = formatter(tz).formatToParts(instant);
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
	const hour = get('hour');
	return {
		year: get('year'),
		month: get('month'),
		day: get('day'),
		// some ICU versions render midnight as 24 in hour12: false
		hour: hour === 24 ? 0 : hour,
		minute: get('minute'),
		second: get('second')
	};
}

/** offset of `tz` from UTC in milliseconds at a given instant, positive east of Greenwich */
function offsetMs(instant: number, tz: string): number {
	const p = localParts(new Date(instant), tz);
	const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
	return asUtc - instant;
}

/**
 * The UTC instant at which the wall clock in `tz` reads the given civil time.
 * Fixed-point iteration: the offset depends on the instant we are solving for,
 * so guess, measure the offset there, correct, and measure again.
 */
export function wallClockToUtc(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute = 0,
	tz: string = TIMEZONE
): Date {
	const wall = Date.UTC(year, month - 1, day, hour, minute);
	let instant = wall;
	for (let i = 0; i < 2; i++) instant = wall - offsetMs(instant, tz);
	return new Date(instant);
}

/**
 * The next Thursday 20:00 in `tz` strictly after `from`. Computed from local wall
 * time on the day in question, so it stays at 20:00 local across both DST changes.
 */
export function nextDeadline(from: Date, tz: string = TIMEZONE): Date {
	const { year, month, day } = localParts(from, tz);
	for (let i = 0; i <= 7; i++) {
		// UTC midnight of the candidate calendar date, used only for day-of-week arithmetic
		const civil = new Date(Date.UTC(year, month - 1, day + i));
		if (civil.getUTCDay() !== THURSDAY) continue;
		const candidate = wallClockToUtc(
			civil.getUTCFullYear(),
			civil.getUTCMonth() + 1,
			civil.getUTCDate(),
			DEADLINE_HOUR,
			0,
			tz
		);
		if (candidate.getTime() > from.getTime()) return candidate;
	}
	throw new Error('unreachable: no Thursday in the next eight days');
}

export function iso(date: Date = new Date()): string {
	return date.toISOString();
}

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/**
 * Reads back what a datetime-local input produced. The value carries no zone, and
 * the admin typing it means Warsaw time, so it is resolved against that and not
 * against whatever clock the server happens to keep.
 */
export function fromLocalInput(value: string, tz: string = TIMEZONE): Date {
	const match = LOCAL_INPUT.exec(value.trim());
	if (!match) throw new Error(`not a local date and time: ${value}`);
	const [, year, month, day, hour, minute] = match;
	return wallClockToUtc(
		Number(year),
		Number(month),
		Number(day),
		Number(hour),
		Number(minute),
		tz
	);
}

export function formatLocal(instant: Date | string, tz: string = TIMEZONE): string {
	const date = typeof instant === 'string' ? new Date(instant) : instant;
	return new Intl.DateTimeFormat('en-GB', {
		timeZone: tz,
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).format(date);
}
