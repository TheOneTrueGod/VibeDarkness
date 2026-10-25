import { describe, expect, it } from 'vitest';
import {
    HUNGER_PER_MISSING_HP,
    HUNGER_PER_WOUND_POINT,
    computeMatchHungerLoss,
    withHungerDelta,
    applyHealWoundsToHungerLoss,
    applyOrderedHungerChanges,
} from './matchHunger';

describe('applyOrderedHungerChanges', () => {
    it('is deterministic by order: -5, -5, +20, -5 from 100 ends at 95', () => {
        expect(applyOrderedHungerChanges(100, [-5, -5, 20, -5], 100)).toBe(95);
    });

    it('differs when the same changes are reordered', () => {
        expect(applyOrderedHungerChanges(100, [20, -5, -5, -5], 100)).toBe(85);
    });

    it('clamps to max at each step', () => {
        expect(applyOrderedHungerChanges(5, [-10, 3], 100)).toBe(3);
        expect(applyOrderedHungerChanges(95, [10, -3], 100)).toBe(97);
    });

    it('skips non-finite changes', () => {
        expect(applyOrderedHungerChanges(4, [NaN, Infinity, 1])).toBe(5);
    });
});

describe('computeMatchHungerLoss', () => {
    it('is zero when the player is at full uninjured HP', () => {
        expect(computeMatchHungerLoss({ hp: 100, maxHp: 100, hpInjury: 0 })).toBe(0);
    });

    it('counts one hunger per wound point', () => {
        expect(computeMatchHungerLoss({ hp: 90, maxHp: 100, hpInjury: 10 })).toBe(
            Math.ceil(10 * HUNGER_PER_WOUND_POINT),
        );
    });

    it('counts half hunger per HP below wounded max, then rounds up', () => {
        // 0 wounds, 3 HP missing -> 1.5 -> 2
        expect(computeMatchHungerLoss({ hp: 97, maxHp: 100, hpInjury: 0 })).toBe(
            Math.ceil(3 * HUNGER_PER_MISSING_HP),
        );
    });

    it('adds wound points and missing-HP halves before rounding up', () => {
        // 2 wounds + (100 - 2 - 97) = 1 missing HP -> 2 + 0.5 = 2.5 -> 3
        expect(computeMatchHungerLoss({ hp: 97, maxHp: 100, hpInjury: 2 })).toBe(3);
    });

    it('treats a downed player as missing all HP below wounded max', () => {
        // 10 wounds + 90 missing x 0.5 = 55
        expect(computeMatchHungerLoss({ hp: 0, maxHp: 100, hpInjury: 10 })).toBe(55);
    });

    it('does not count HP above wounded max as negative missing', () => {
        expect(computeMatchHungerLoss({ hp: 100, maxHp: 100, hpInjury: 10 })).toBe(
            Math.ceil(10 * HUNGER_PER_WOUND_POINT),
        );
    });

    it('measures against the already-lowered maxHp (no reserve term)', () => {
        // A hungry unit that started at a lowered 75 max HP and finished at full health lost nothing.
        expect(computeMatchHungerLoss({ hp: 75, maxHp: 75, hpInjury: 0 })).toBe(0);
    });
});

describe('withHungerDelta', () => {
    it('leaves the delta unchanged when the hunger change is 0', () => {
        expect(withHungerDelta({ vigor: 2 }, 0)).toEqual({ vigor: 2 });
        expect(withHungerDelta(undefined, 0)).toBeUndefined();
    });

    it('adds a negative hunger delta onto an existing delta', () => {
        expect(withHungerDelta({ vigor: 2 }, -4)).toEqual({ vigor: 2, hunger: -4 });
        expect(withHungerDelta(undefined, -4)).toEqual({ hunger: -4 });
    });

    it('records recoveries as positive deltas', () => {
        expect(withHungerDelta(undefined, 6)).toEqual({ hunger: 6 });
    });
});

describe('applyHealWoundsToHungerLoss', () => {
    it('reduces the loss by the heal amount', () => {
        expect(applyHealWoundsToHungerLoss(10, 5)).toBe(5);
    });

    it('floors the loss at 0', () => {
        expect(applyHealWoundsToHungerLoss(3, 5)).toBe(0);
    });

    it('leaves the loss unchanged when healWounds is undefined', () => {
        expect(applyHealWoundsToHungerLoss(5, undefined)).toBe(5);
    });

    it('leaves the loss unchanged when healWounds is negative or NaN', () => {
        expect(applyHealWoundsToHungerLoss(5, -10)).toBe(5);
        expect(applyHealWoundsToHungerLoss(5, NaN)).toBe(5);
    });

    it('returns an unchanged loss when it is non-finite', () => {
        expect(applyHealWoundsToHungerLoss(Infinity, 5)).toBe(Infinity);
        expect(applyHealWoundsToHungerLoss(NaN, 5)).toBe(NaN);
    });

    it('returns 0 when both heal and loss result in 0', () => {
        expect(applyHealWoundsToHungerLoss(5, 5)).toBe(0);
    });
});
