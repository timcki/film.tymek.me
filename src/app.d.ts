import type { Person } from '$lib/server/types';

declare global {
	namespace App {
		interface Locals {
			person: Person | null;
			deviceId: string | null;
		}
	}
}

export {};
