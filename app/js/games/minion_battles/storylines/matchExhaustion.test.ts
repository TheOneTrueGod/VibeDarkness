import { describe, expect, it } from 'vitest';
import {
    EXHAUSTION_PER_MISSING_HP,
    EXHAUSTION_PER_WOUND_POINT,
    computeMatchExhaustion,
    withExhaustionDelta,
} from './matchExhaustion';

describe('computeMatchExhaustion', () => {
    it('is zero when the player is at full uninjured HP', () => {
        expect(computeMatchExhaustion({ hp: 100, maxHp: 100, hpInjury: 0 })).toBe(0);
    });

    it('counts one exhaustion per wound point', () => {
        expect(computeMatchExhaustion({ hp: 90, maxHp: 100, hpInjury: 10 })).toBe(
            Math.ceil(10 * EXHAUSTION_PER_WOUND_POINT),
        );
    });

    it('counts half exhaustion per HP below wounded max, then rounds up', () => {
        // 0 wounds, 3 HP missing → 1.5 → 2
        expect(computeMatchExhaustion({ hp: 97, maxHp: 100, hpInjury: 0 })).toBe(
            Math.ceil(3 * EXHAUSTION_PER_MISSING_HP),
        );
    });

    it('adds wound points and missing-HP halves before rounding up', () => {
        // 2 wounds + (100 - 2 - 97) = 1 missing HP → 2 + 0.5 = 2.5 → 3
        expect(computeMatchExhaustion({ hp: 97, maxHp: 100, hpInjury: 2 })).toBe(3);
    });

    it('treats a downed player as missing all HP below wounded max', () => {
        // 10 wounds + 90 missing × 0.5 = 55
        expect(computeMatchExhaustion({ hp: 0, maxHp: 100, hpInjury: 10 })).toBe(55);
    });

    it('does not count HP above wounded max as negative missing', () => {
        expect(computeMatchExhaustion({ hp: 100, maxHp: 100, hpInjury: 10 })).toBe(
            Math.ceil(10 * EXHAUSTION_PER_WOUND_POINT),
        );
    });

    it('does not treat fight-start exhaustion reserve as missing HP', () => {
        expect(computeMatchExhaustion({ hp: 30, maxHp: 100, hpInjury: 0, hpExhaustion: 70 })).toBe(0);
    });
});

describe('withExhaustionDelta', () => {
    it('leaves the delta unchanged when exhaustion is 0', () => {
        expect(withExhaustionDelta({ food: 2 }, 0)).toEqual({ food: 2 });
        expect(withExhaustionDelta(undefined, 0)).toBeUndefined();
    });

    it('adds exhaustion onto an existing delta', () => {
        expect(withExhaustionDelta({ food: 2 }, 4)).toEqual({ food: 2, exhaustion: 4 });
        expect(withExhaustionDelta(undefined, 4)).toEqual({ exhaustion: 4 });
    });
});
