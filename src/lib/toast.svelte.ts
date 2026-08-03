/** one banner at a time, shown by the layout, raised from anywhere */
export const toast = $state({ text: '', bad: false, seq: 0 });

export function say(text: string, bad = false): void {
	toast.text = text;
	toast.bad = bad;
	toast.seq += 1;
}
