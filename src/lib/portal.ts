/**
 * Moves an element to the end of <body>, out of whatever layer the page put it
 * in. §3.6's look lifts the page column into a layer of its own (so the bats fly
 * behind the cards) and draws the moon and the fog in layers above it; a modal
 * left inside the column would have the moon showing through its top edge.
 */
export function portal(node: HTMLElement) {
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		}
	};
}
