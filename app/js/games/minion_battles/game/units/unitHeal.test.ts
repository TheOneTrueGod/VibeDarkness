import { describe, it, expect } from 'vitest';
import { Unit } from './Unit';
import { applyHeal, DEFAULT_HEAL_PENALTY_PCT, MIN_EFFECTIVE_MAX_HP_PCT } from './unitHeal';
import {
    EXHAUSTION_HEALTH_LOSS_FRACTION,
    EXHAUSTION_MIN_AVAILABLE_HEALTH_FRACTION,
} from '../../character_defs/exhaustionHealth';

const FULL_POOL = 100;
const FULL_EXHAUSTION_RESERVED = FULL_POOL * EXHAUSTION_HEALTH_LOSS_FRACTION;
const FULL_EXHAUSTION_AVAILABLE = FULL_POOL * EXHAUSTION_MIN_AVAILABLE_HEALTH_FRACTION;

function makeUnit(overrides: Partial<ConstructorParameters<typeof Unit>[0]> = {}): Unit {
    return new Unit({
        id: 'u1',
        x: 0,
        y: 0,
        hp: 40,
        maxHp: 40,
        speed: 100,
        teamId: 'player',
        ownerId: 'ai',
        characterId: 'dog',
        name: 'Dog',
        ...overrides,
    });
}

describe('applyHeal', () => {
    it('reduces getEffectiveMaxHp() by penaltyPct of the actual heal applied', () => {
        const unit = makeUnit({ hp: 50, maxHp: 100 });
        const actual = applyHeal(unit, 20);
        expect(actual).toBe(20);
        expect(unit.hpInjury).toBeCloseTo(20 * DEFAULT_HEAL_PENALTY_PCT);
        expect(unit.getEffectiveMaxHp()).toBeCloseTo(100 - 20 * DEFAULT_HEAL_PENALTY_PCT);
    });

    it('only charges injury for the portion of the heal that actually raised hp (no overheal penalty)', () => {
        const unit = makeUnit({ hp: 90, maxHp: 100 });
        const actual = applyHeal(unit, 50); // only 10 can actually be applied before hitting the cap
        expect(actual).toBe(10);
        expect(unit.hpInjury).toBeCloseTo(10 * DEFAULT_HEAL_PENALTY_PCT);
    });

    it('healing an already-full unit costs zero injury and returns 0', () => {
        const unit = makeUnit({ hp: 100, maxHp: 100 });
        const actual = applyHeal(unit, 20);
        expect(actual).toBe(0);
        expect(unit.hpInjury).toBe(0);
        expect(unit.hp).toBe(100);
    });

    it('never leaves hp below its pre-heal value', () => {
        const unit = makeUnit({ hp: 80, maxHp: 100 });
        const preHeal = unit.hp;
        applyHeal(unit, 20); // exactly fills to the pre-heal effective max (boundary case)
        expect(unit.hp).toBeGreaterThanOrEqual(preHeal);
    });

    it('trims the full-heal boundary case to the new, slightly lower effective max', () => {
        const unit = makeUnit({ hp: 90, maxHp: 100 });
        applyHeal(unit, 10); // heal amount exactly equals the pre-heal gap to cap
        // effectiveMaxBefore = 100, actualHeal = 10, injuryAdded = 3 -> new effective max = 97
        expect(unit.hp).toBeCloseTo(97);
        expect(unit.hpInjury).toBeCloseTo(3);
    });

    it('penaltyPct = 0 override heals with zero injury cost', () => {
        const unit = makeUnit({ hp: 50, maxHp: 100 });
        applyHeal(unit, 20, 0);
        expect(unit.hp).toBe(70);
        expect(unit.hpInjury).toBe(0);
    });

    it('floors effective max HP at MIN_EFFECTIVE_MAX_HP_PCT of maxHp across repeated damage/heal cycles', () => {
        const unit = makeUnit({ hp: 100, maxHp: 100 });
        for (let i = 0; i < 20; i++) {
            unit.hp = 1; // simulate taking damage back down before the next heal
            applyHeal(unit, 100);
        }
        expect(unit.getEffectiveMaxHp()).toBeCloseTo(100 * MIN_EFFECTIVE_MAX_HP_PCT);
        expect(unit.hpInjury).toBeLessThanOrEqual(100 * (1 - MIN_EFFECTIVE_MAX_HP_PCT));
    });

    it('floors injury against the post-exhaustion pool so 100% exhaustion can stay at 30% available', () => {
        const unit = makeUnit({ hp: FULL_EXHAUSTION_AVAILABLE, maxHp: FULL_POOL });
        unit.hpExhaustion = FULL_EXHAUSTION_RESERVED;
        expect(unit.getEffectiveMaxHp()).toBeCloseTo(FULL_EXHAUSTION_AVAILABLE);
        for (let i = 0; i < 20; i++) {
            unit.hp = 1;
            applyHeal(unit, FULL_POOL);
        }
        expect(unit.getEffectiveMaxHp()).toBeCloseTo(FULL_EXHAUSTION_AVAILABLE * MIN_EFFECTIVE_MAX_HP_PCT);
        expect(unit.hpInjury).toBeLessThanOrEqual(FULL_EXHAUSTION_AVAILABLE * (1 - MIN_EFFECTIVE_MAX_HP_PCT));
    });

    it('is a no-op on a dead unit', () => {
        const unit = makeUnit({ hp: 0, maxHp: 100 });
        const actual = applyHeal(unit, 20);
        expect(actual).toBe(0);
        expect(unit.hp).toBe(0);
        expect(unit.hpInjury).toBe(0);
    });

    it('is a no-op for non-positive heal amounts', () => {
        const unit = makeUnit({ hp: 50, maxHp: 100 });
        expect(applyHeal(unit, 0)).toBe(0);
        expect(applyHeal(unit, -5)).toBe(0);
        expect(unit.hp).toBe(50);
    });
});
