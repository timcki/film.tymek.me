/**
 * §3.6: whether the special round's nomination modal is open, and where the
 * button that opened it sits on screen, which is where the modal grows out of.
 * The modal lives on the round's page and the button in the bar the layout
 * draws, so the little they share lives here.
 */
export const nomSheet = $state<{ open: boolean; from: { x: number; y: number } | null }>({
	open: false,
	from: null
});
