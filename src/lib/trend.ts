export type Point = { x: number; y: number };

/** one film on a timeline: the day it was watched and its value */
export type TimePoint = { title: string; day: number; value: number };

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The line a cloud of points leans along: the median of the slope between every
 * pair of points (Theil-Sen). One 432-minute epic or one 1927 silent bends a
 * least-squares line toward itself; here it is a single outlier among hundreds
 * of pairs and moves nothing. Null when no two points are at different times.
 */
export function trendLine(points: Point[]): { slope: number; intercept: number } | null {
	const slopes: number[] = [];
	for (let i = 0; i < points.length; i++) {
		for (let j = i + 1; j < points.length; j++) {
			const dx = points[j].x - points[i].x;
			if (dx !== 0) slopes.push((points[j].y - points[i].y) / dx);
		}
	}
	if (!slopes.length) return null;
	const slope = median(slopes);
	return { slope, intercept: median(points.map((p) => p.y - slope * p.x)) };
}

/**
 * Each point replaced by the median of itself and the `reach` points either side
 * (fewer at the ends), for the line that follows the films rather than the one
 * that averages them. Points must already be in order.
 */
export function rollingMedian(points: Point[], reach: number): Point[] {
	return points.map((point, i) => ({
		x: point.x,
		y: median(points.slice(Math.max(0, i - reach), i + reach + 1).map((p) => p.y))
	}));
}
