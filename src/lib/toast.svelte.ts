/** one banner at a time, shown by the layout, raised from anywhere */
export const toast = $state({ text: '', bad: false, seq: 0 });

// a plain counter, deliberately outside $state: `toast.seq += 1` would READ
// reactive state, and a say() inside any $effect would subscribe that effect
// to seq while also writing it, which is an infinite self-invalidation loop
let seq = 0;

export function say(text: string, bad = false): void {
	toast.text = text;
	toast.bad = bad;
	toast.seq = ++seq;
}
