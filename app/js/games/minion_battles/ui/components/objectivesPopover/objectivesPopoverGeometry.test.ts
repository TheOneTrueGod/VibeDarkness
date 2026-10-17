import { describe, expect, it } from 'vitest';
import { centeredRect, computeFlightTransform, flightTransformToCss } from './objectivesPopoverGeometry';

describe('objectivesPopoverGeometry', () => {
    it('computes translate and uniform scale from centre to anchor', () => {
        const from = { left: 300, top: 200, width: 400, height: 300 };
        const to = { left: 900, top: 20, width: 200, height: 100 };
        expect(computeFlightTransform(from, to)).toEqual({ translateX: 600, translateY: -180, scale: 0.5 });
    });

    it('is the identity when rects match', () => {
        const r = { left: 10, top: 20, width: 100, height: 50 };
        expect(computeFlightTransform(r, r)).toEqual({ translateX: 0, translateY: 0, scale: 1 });
    });

    it('falls back to scale 1 for zero widths', () => {
        const t = computeFlightTransform(
            { left: 0, top: 0, width: 0, height: 0 },
            { left: 5, top: 5, width: 10, height: 10 },
        );
        expect(t.scale).toBe(1);
    });

    it('formats css and centres rects', () => {
        expect(flightTransformToCss({ translateX: 1, translateY: 2, scale: 0.5 })).toBe(
            'translate(1px, 2px) scale(0.5)',
        );
        expect(centeredRect(200, 100, 1000, 600)).toEqual({ left: 400, top: 250, width: 200, height: 100 });
    });
});
