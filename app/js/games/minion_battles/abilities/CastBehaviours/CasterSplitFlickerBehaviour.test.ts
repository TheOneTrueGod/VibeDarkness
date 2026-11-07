import { describe, expect, it } from 'vitest';
import { casterSplitFlickerOffsetX } from './CasterSplitFlickerBehaviour';

describe('CasterSplitFlicker', () => {
    const config = { maxSeparationPx: 20, framesPerSecond: 10 };

    it('starts centred, then alternates sides each frame while drifting apart', () => {
        expect(casterSplitFlickerOffsetX(config, 0, 0)).toBe(0);
        // Consecutive frames land on opposite sides.
        const a = casterSplitFlickerOffsetX(config, 0.05, 0.5);
        const b = casterSplitFlickerOffsetX(config, 0.15, 0.5);
        expect(Math.sign(a)).toBe(-Math.sign(b));
        expect(Math.abs(a)).toBe(10);
        // Separation grows with window progress, up to the max.
        expect(Math.abs(casterSplitFlickerOffsetX(config, 0.05, 1))).toBe(20);
        expect(Math.abs(casterSplitFlickerOffsetX(config, 0.05, 2))).toBe(20);
    });
});
