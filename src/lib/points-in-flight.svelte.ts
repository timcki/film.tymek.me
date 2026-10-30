/**
 * What the bar should show as spent while a vote on a card is on its way to
 * the server: set the moment the + (or the way back) is tapped, so the point
 * it gives up leaves at once rather than a round trip later. It is a count,
 * not a difference, so when the server's answer arrives saying the same the
 * bar does not move at all; it is let go once the page agrees, or the vote
 * fails.
 */
export const inFlight = $state<{ spent: number | null }>({ spent: null });
