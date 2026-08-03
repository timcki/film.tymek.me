/** the group, in the order they were given; slugs are derived firstname-lastname */
export const ROSTER = [
	'Adam Czarnecki',
	'Adam Przywieczerski',
	'Agnieszka Wiecha',
	'Ala Spirytulska',
	'Aleksandra Rogoż',
	'Barbara Rogoż',
	'Beata Mączka',
	'Gosia Sowa',
	'Halka Jagielska',
	'Jakub Żurowski',
	'Julia Markusiewicz',
	'Julia Wróblewska',
	'Krystian Nalepa',
	'Krzysiek Chmielecki',
	'Maciek Matys',
	'Michał Kisielewicz',
	'Ola Flis',
	'Piotr Cenda',
	'Tomek Ziębowicz',
	'Tymek Chmielecki',
	'Zofia Biedzka',
	'Łukasz Stanik'
];

/** avatar colours, cycled over the roster; readable on the dark background */
export const COLOURS = [
	'#e8c34a',
	'#5cc98b',
	'#6fa8dc',
	'#d98cb3',
	'#c792ea',
	'#f0866b',
	'#4fc3c3',
	'#b5cc6a',
	'#e5a13c',
	'#8e9bef',
	'#d46a9c'
];

export function colourFor(index: number): string {
	return COLOURS[index % COLOURS.length];
}
