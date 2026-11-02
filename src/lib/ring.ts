/**
 * An order to seat people round a ring so that those with the most between them
 * sit next to each other, which is what keeps the ribbons short and the
 * crossings few. A greedy chain: start from the first, then always seat next
 * whoever is most tied to the one just seated. Ties go to the earlier in `ids`,
 * so the caller's own ranking decides between equals and the result is stable.
 */
export function ringOrder(ids: string[], weight: (a: string, b: string) => number): string[] {
	const left = [...ids];
	const seated: string[] = [];
	while (left.length) {
		const last = seated[seated.length - 1];
		let best = 0;
		if (last !== undefined) {
			for (let i = 1; i < left.length; i++) {
				if (weight(last, left[i]) > weight(last, left[best])) best = i;
			}
		}
		seated.push(left.splice(best, 1)[0]);
	}
	return seated;
}
