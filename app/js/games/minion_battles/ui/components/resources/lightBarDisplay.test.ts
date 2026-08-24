import { describe, expect, it } from 'vitest';
import {
    LIGHT_ORB_BAR_THRESHOLD,
    isLightOrbFilled,
    shouldRenderLightAsOrbs,
} from './lightBarDisplay';

describe('lightBarDisplay', () => {
    it('uses orbs when max is below the bar threshold', () => {
        expect(shouldRenderLightAsOrbs(LIGHT_ORB_BAR_THRESHOLD - 1)).toBe(true);
        expect(shouldRenderLightAsOrbs(LIGHT_ORB_BAR_THRESHOLD)).toBe(false);
    });

    it('fills the first N orbs when current is N of max', () => {
        const current = 6;
        const max = 8;
        const filled = Array.from({ length: max }, (_, i) => isLightOrbFilled(current, i));
        expect(filled.slice(0, current).every(Boolean)).toBe(true);
        expect(filled.slice(current).every((filledOrb) => !filledOrb)).toBe(true);
    });

    it('fills no orbs at 0 current', () => {
        expect(isLightOrbFilled(0, 0)).toBe(false);
    });
});
