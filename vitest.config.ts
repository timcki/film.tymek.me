import { defineConfig } from 'vitest/config';

// the engine tests import plain .ts modules, so they need no svelte plugin
export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node'
	}
});
