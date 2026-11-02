import { describe, expect, it } from 'vitest';
import { rollingMedian, trendLine } from '../src/lib/trend.js';

const at = (ys: number[]) => ys.map((y, x) => ({ x, y }));

describe('trendLine', () => {
	it('finds the line through points that lie on one', () => {
		const line = trendLine(at([10, 12, 14, 16, 18]));
		expect(line?.slope).toBeCloseTo(2);
		expect(line?.intercept).toBeCloseTo(10);
	});

	it('is not moved by a single outlier', () => {
		const ys = [100, 101, 102, 103, 104, 105, 106, 107, 432];
		expect(trendLine(at(ys))?.slope).toBeCloseTo(1, 0);
	});

	it('has nothing to say about points all at one time, or about none', () => {
		expect(trendLine([{ x: 3, y: 1 }, { x: 3, y: 9 }])).toBeNull();
		expect(trendLine([])).toBeNull();
	});
});

describe('rollingMedian', () => {
	it('takes the middle of each neighbourhood, narrower at the ends', () => {
		const out = rollingMedian(at([1, 9, 2, 8, 3]), 1);
		expect(out.map((p) => p.y)).toEqual([5, 2, 8, 3, 5.5]);
		expect(out.map((p) => p.x)).toEqual([0, 1, 2, 3, 4]);
	});
});
