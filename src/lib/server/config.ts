import { ruleSetFromEnv } from './rules.js';
import type { RuleSet } from './rules.js';

export function activeRules(): RuleSet {
	return ruleSetFromEnv(process.env.RULES);
}

export function origin(): string {
	return process.env.ORIGIN ?? 'http://localhost:5173';
}

/**
 * The public demo at demo.film.tymek.me, which is this same app run by a second
 * service against an anonymised copy of the database. It is a whole process
 * rather than a mode inside the real one on purpose: the names, the avatars and
 * the comments a stranger must not see are not in the file it opens at all.
 */
export function isDemo(): boolean {
	return process.env.DEMO === '1';
}

/** where the demo's bar points back to, so a visitor can find the portfolio again */
export function demoHome(): string | null {
	return process.env.DEMO_HOME || null;
}

export const TMDB_TOKEN = () => process.env.TMDB_READ_TOKEN ?? '';
