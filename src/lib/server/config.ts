import { ruleSetFromEnv } from './rules.js';
import type { RuleSet } from './rules.js';

export function activeRules(): RuleSet {
	return ruleSetFromEnv(process.env.RULES);
}

export function origin(): string {
	return process.env.ORIGIN ?? 'http://localhost:5173';
}

export const TMDB_TOKEN = () => process.env.TMDB_READ_TOKEN ?? '';
