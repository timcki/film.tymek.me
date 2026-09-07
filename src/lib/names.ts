/**
 * What to call somebody in a chart row, where there is space for a word and not
 * for a name. First names alone read best and are what the group uses, but this
 * roster has three Julias, and three identical rows is worse than a longer one:
 * a colliding first name earns as much of the surname as it takes to tell the
 * rows apart.
 */
export function shortNames(people: { id: string; name: string }[]): Map<string, string> {
	const byFirst = new Map<string, { id: string; name: string }[]>();
	for (const person of people) {
		const first = person.name.trim().split(/\s+/)[0] ?? person.name;
		const key = first.toLocaleLowerCase();
		const group = byFirst.get(key) ?? [];
		group.push(person);
		byFirst.set(key, group);
	}

	const out = new Map<string, string>();
	for (const group of byFirst.values()) {
		for (const person of group) {
			const parts = person.name.trim().split(/\s+/);
			const first = parts[0] ?? person.name;
			if (group.length === 1 || parts.length < 2) {
				out.set(person.id, first);
				continue;
			}
			// an initial usually does it; where two people share that too, the whole name
			const initial = `${first} ${parts[1][0]}.`;
			const clash = group.some(
				(other) => other.id !== person.id && other.name.trim().split(/\s+/)[1]?.[0] === parts[1][0]
			);
			out.set(person.id, clash ? person.name : initial);
		}
	}
	return out;
}
