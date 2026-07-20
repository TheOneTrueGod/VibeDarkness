import { describe, expect, it, vi } from 'vitest';
import { applyPassiveDamageBonuses, getModifiedAbilityDamage } from './damageModifiers';
import { DEFAULT_PASSIVE_MULT } from '../../../researchTrees/passiveBonuses';

describe('getModifiedAbilityDamage', () => {
    it('keeps base damage when attacker is missing', () => {
        expect(getModifiedAbilityDamage(undefined, 8)).toBe(8);
    });

    it('adds flat bonus when multiplier is 1', () => {
        const getDamageModifier = vi.fn(() => ({ flatAmt: 2, multiplier: 1 }));
        const attacker = { getDamageModifier, stackSize: 1 } as unknown as import('../game/units/Unit').Unit;

        expect(getModifiedAbilityDamage(attacker, 8)).toBe(10);
        expect(getDamageModifier).toHaveBeenCalledOnce();
    });

    it('scales base plus flat by multiplier', () => {
        const getDamageModifier = vi.fn(() => ({ flatAmt: 2, multiplier: 1.5 }));
        const attacker = { getDamageModifier, stackSize: 1 } as unknown as import('../game/units/Unit').Unit;

        // (8 + 2) * 1.5 = 15
        expect(getModifiedAbilityDamage(attacker, 8)).toBe(15);
    });
});

describe('applyPassiveDamageBonuses', () => {
    it('returns base when caster is missing', () => {
        expect(applyPassiveDamageBonuses(8, undefined)).toBe(8);
    });

    it('applies all_damage mult from caster bag', () => {
        const caster = {
            passiveBonuses: { all_damage: { add: 0, mult: 2 } },
        } as unknown as import('../game/units/Unit').Unit;
        expect(applyPassiveDamageBonuses(8, caster)).toBe(16);
    });

    it('uses default mult when bag lacks all_damage', () => {
        const caster = { passiveBonuses: {} } as unknown as import('../game/units/Unit').Unit;
        expect(applyPassiveDamageBonuses(8, caster)).toBe(8);
        expect(DEFAULT_PASSIVE_MULT).toBe(1);
    });
});
