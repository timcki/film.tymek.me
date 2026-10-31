import { fail } from '@sveltejs/kit';
import { RuleError } from './types.js';

/**
 * Where to send someone back to after a toggle: a page of this app, or home.
 * Resolved against our own origin rather than prefix-checked, because a browser
 * reads `/\evil.com` as `//evil.com` and a startsWith('/') test lets it through.
 */
export function backTo(to: FormDataEntryValue | null, url: URL): string {
	if (typeof to !== 'string' || !to) return '/';
	try {
		const target = new URL(to, url);
		return target.origin === url.origin ? target.pathname + target.search + target.hash : '/';
	} catch {
		return '/';
	}
}

/**
 * Every action fails the same shape: a code the page can say in Polish, its
 * parameters, and the English message as the fallback.
 */
export function ruleFail(error: unknown) {
	if (error instanceof RuleError) {
		return fail(409, { code: error.code, params: error.params, message: error.message });
	}
	console.error(error);
	return fail(500, {
		code: 'server',
		params: {},
		message: 'something went wrong on the server'
	});
}
