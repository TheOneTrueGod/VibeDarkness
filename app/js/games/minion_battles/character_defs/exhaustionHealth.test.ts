import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTER_ENDURANCE } from './characterEndurance';
import {
    EXHAUSTION_HEALTH_LOSS_FRACTION,
    EXHAUSTION_MIN_AVAILABLE_HEALTH_FRACTION,
    applyFightStartExhaustion,
    computeExhaustionReservedHp,
    getExhaustionRatio,
} from './exhaustionHealth';

const FULL_POOL = 100;

describe('getExhaustionRatio', () => {
    it('is 0 when exhaustion is 0', () => {
        expect(getExhaustionRatio(0, DEFAULT_CHARACTER_ENDURANCE)).toBe(0);
    });

    it('is 1 when exhaustion equals endurance', () => {
        expect(getExhaustionRatio(DEFAULT_CHARACTER_ENDURANCE, DEFAULT_CHARACTER_ENDURANCE)).toBe(1);
    });

    it('clamps above endurance to 1', () => {
        expect(getExhaustionRatio(DEFAULT_CHARACTER_ENDURANCE + 20, DEFAULT_CHARACTER_ENDURANCE)).toBe(1);
    });
});

describe('computeExhaustionReservedHp', () => {
    it('reserves none of the pool at 0% exhaustion', () => {
        expect(computeExhaustionReservedHp(FULL_POOL, 0, DEFAULT_CHARACTER_ENDURANCE)).toBe(0);
    });

    it('reserves the loss fraction of the pool at 100% exhaustion', () => {
        expect(
            computeExhaustionReservedHp(FULL_POOL, DEFAULT_CHARACTER_ENDURANCE, DEFAULT_CHARACTER_ENDURANCE),
        ).toBeCloseTo(FULL_POOL * EXHAUSTION_HEALTH_LOSS_FRACTION);
        expect(FULL_POOL * EXHAUSTION_MIN_AVAILABLE_HEALTH_FRACTION).toBeCloseTo(
            FULL_POOL - FULL_POOL * EXHAUSTION_HEALTH_LOSS_FRACTION,
        );
    });

    it('interpolates linearly at half exhaustion', () => {
        const half = DEFAULT_CHARACTER_ENDURANCE / 2;
        expect(computeExhaustionReservedHp(FULL_POOL, half, DEFAULT_CHARACTER_ENDURANCE)).toBeCloseTo(
            FULL_POOL * EXHAUSTION_HEALTH_LOSS_FRACTION * 0.5,
        );
    });
});

describe('applyFightStartExhaustion', () => {
    it('sets reserved HP and lowers current HP to the remaining pool', () => {
        const unit = { maxHp: FULL_POOL, hp: FULL_POOL, hpExhaustion: 0 };
        applyFightStartExhaustion(unit, DEFAULT_CHARACTER_ENDURANCE, DEFAULT_CHARACTER_ENDURANCE);
        expect(unit.hpExhaustion).toBeCloseTo(FULL_POOL * EXHAUSTION_HEALTH_LOSS_FRACTION);
        expect(unit.hp).toBeCloseTo(FULL_POOL * EXHAUSTION_MIN_AVAILABLE_HEALTH_FRACTION);
        expect(unit.maxHp).toBe(FULL_POOL);
    });
});
