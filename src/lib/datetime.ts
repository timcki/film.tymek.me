/**
 * Dates the app shows or accepts are always Warsaw wall-clock, never the
 * viewer's own zone: a film night is at 20:00 in Kraków whoever is looking. Kept
 * out of $lib/server so the admin screens can format the same instants the
 * scheduler works with.
 */
import type { Lang } from './i18n.js';

export const TIMEZONE = 'Europe/Warsaw';

function partsIn(instant: Date, options: Intl.DateTimeFormatOptions): Record<string, string> {
	const found = new Intl.DateTimeFormat('sv-SE', { timeZone: TIMEZONE, ...options }).formatToParts(
		instant
	);
	return Object.fromEntries(found.map((part) => [part.type, part.value]));
}

/** "2026-08-05T20:00", the value a datetime-local input wants */
export function toLocalInput(instant: Date | string): string {
	const date = typeof instant === 'string' ? new Date(instant) : instant;
	const p = partsIn(date, {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	});
	// some ICU versions render midnight as 24
	const hour = p.hour === '24' ? '00' : p.hour;
	return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`;
}

const LOCALE: Record<Lang, string> = { pl: 'pl-PL', en: 'en-GB' };

/** "śr, 5 sie, 20:00" */
export function formatNight(instant: Date | string, lang: Lang): string {
	const date = typeof instant === 'string' ? new Date(instant) : instant;
	return new Intl.DateTimeFormat(LOCALE[lang], {
		timeZone: TIMEZONE,
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).format(date);
}

/** "śr, 5 sie": the night as the header says it, where the hour would not fit */
export function formatNightDay(instant: Date | string, lang: Lang): string {
	const date = typeof instant === 'string' ? new Date(instant) : instant;
	return new Intl.DateTimeFormat(LOCALE[lang], {
		timeZone: TIMEZONE,
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	}).format(date);
}

/** "5 sie 2026", for rows where the time is noise */
export function formatDay(instant: Date | string, lang: Lang): string {
	const date = typeof instant === 'string' ? new Date(instant) : instant;
	return new Intl.DateTimeFormat(LOCALE[lang], {
		timeZone: TIMEZONE,
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	}).format(date);
}

/** whole days from now until `instant`, negative once it has passed */
export function daysUntil(instant: Date | string, from: Date = new Date()): number {
	const date = typeof instant === 'string' ? new Date(instant) : instant;
	return Math.round((date.getTime() - from.getTime()) / 86400000);
}
