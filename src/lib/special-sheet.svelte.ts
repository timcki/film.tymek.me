/**
 * Whether the nomination sheet is open, the list's or §3.6's special round's,
 * and where the button that opened it sits on screen, which is where the
 * round's modal grows out of. The sheet lives on the page and the + in the bar
 * the layout draws, so the little they share lives here.
 */
export const nomSheet = $state<{ open: boolean; from: { x: number; y: number } | null }>({
	open: false,
	from: null
});
