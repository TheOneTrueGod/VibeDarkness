import { describe, expect, it } from 'vitest';
import { unitOverlapsArcSegment, type ArcSegment } from './ArcSegmentHitbox';

const QUARTER: ArcSegment = { x: 0, y: 0, innerRadius: 20, outerRadius: 60, startAngle: 0, sweepAngle: Math.PI / 2 };

describe('unitOverlapsArcSegment', () => {
    it('covers the ring between the two angles', () => {
        expect(unitOverlapsArcSegment({ x: 28, y: 28, radius: 5 }, QUARTER)).toBe(true);
        expect(unitOverlapsArcSegment({ x: -28, y: 28, radius: 5 }, QUARTER)).toBe(false);
        expect(unitOverlapsArcSegment({ x: 0, y: -40, radius: 5 }, QUARTER)).toBe(false);
    });

    it('misses units inside the hole or past the outer edge', () => {
        expect(unitOverlapsArcSegment({ x: 8, y: 8, radius: 2 }, QUARTER)).toBe(false);
        expect(unitOverlapsArcSegment({ x: 60, y: 60, radius: 5 }, QUARTER)).toBe(false);
    });

    it('counts a body that reaches over an edge, and a negative sweep', () => {
        expect(unitOverlapsArcSegment({ x: 40, y: -4, radius: 6 }, QUARTER)).toBe(true);
        const backwards: ArcSegment = { ...QUARTER, startAngle: Math.PI / 2, sweepAngle: -Math.PI / 2 };
        expect(unitOverlapsArcSegment({ x: 28, y: 28, radius: 5 }, backwards)).toBe(true);
    });
});
