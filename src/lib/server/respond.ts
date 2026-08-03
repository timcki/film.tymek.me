import { fail } from '@sveltejs/kit';
import { RuleError } from './types.js';

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
