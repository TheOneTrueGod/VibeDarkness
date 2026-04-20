import { describe, expect, it, vi } from 'vitest';
import { getModifiedAbilityDamage } from './damageModifiers';

describe('getModifiedAbilityDamage', () => {
    it('keeps base damage when attacker is missing', () => {
        expect(getModifiedAbilityDamage(undefined, 8)).toBe(8);
    });

    it('uses attacker damage modifier and calls getDamageModifier', () => {
        const getDamageModifier = vi.fn(() => ({ flatAmt: 2, multiplier: 1.5 }));
        const attacker = { getDamageModifier } as unknown as import('../game/units/Unit').Unit;

        const damage = getModifiedAbilityDamage(attacker, 8);

        expect(getDamageModifier).toHaveBeenCalledOnce();
        expect(damage).toBe(11);
    });
});
