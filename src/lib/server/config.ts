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

/**
 * The commit this process was built from, put into the unit's environment out of
 * the same flake input the store path was built from, so what is deployed is a
 * question the running app answers rather than one a store path has to be dug
 * through to settle. Unset in development, where the answer is whatever the
 * working tree says right now.
 */
export function revision(): string {
	return process.env.FILMNIGHT_REV || 'dev';
}

export const TMDB_TOKEN = () => process.env.TMDB_READ_TOKEN ?? '';
