import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { watchedRecord } from '$lib/server/manage';

export const load: PageServerLoad = async () => {
	return { watched: watchedRecord(getDb()) };
};
