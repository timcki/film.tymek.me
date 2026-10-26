/**
 * Keeps a fixed modal inside the part of the screen that can actually be seen.
 * When a phone's keyboard comes up, iOS shrinks the visible area and slides it
 * around over the page, but a fixed element stays sized and placed against the
 * whole page, so a modal with a box being typed into ended half under the
 * keyboard with the page showing through below it. While the visible area is
 * short, the modal is pinned to its top and kept to its height, and whatever
 * has focus is scrolled into view inside it.
 */
export function fitViewport(node: HTMLElement) {
	const view = window.visualViewport;
	if (!view) return;
	const fit = () => {
		const squeezed = window.innerHeight - view.height > 120;
		node.style.top = squeezed ? `${view.offsetTop + 8}px` : '';
		node.style.maxHeight = squeezed ? `${view.height - 16}px` : '';
		if (squeezed && node.contains(document.activeElement)) {
			(document.activeElement as HTMLElement).scrollIntoView({ block: 'nearest' });
		}
	};
	view.addEventListener('resize', fit);
	view.addEventListener('scroll', fit);
	return {
		destroy() {
			view.removeEventListener('resize', fit);
			view.removeEventListener('scroll', fit);
		}
	};
}
