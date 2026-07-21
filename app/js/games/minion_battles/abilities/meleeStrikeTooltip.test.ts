import { describe, expect, it } from 'vitest';
// Load AbilityRegistry before defineMeleeStrike so CastBehaviours finishes exporting
// before ThrowRock's module body calls CastBehaviours.ProjectileLaunch().
import { getAbility } from './AbilityRegistry';
import { Unit } from '../game/units/Unit';
import { defineMeleeStrike } from './archetypes/defineMeleeStrike';

void getAbility;

const BASE_DAMAGE = 8;

const melee = defineMeleeStrike({
    id: 'test_melee_tooltip',
    name: 'Test Melee',
    image: '',
    damage: BASE_DAMAGE,
    getTooltipText: () => [`Hit {1} enemy for {{DAMAGE}} damage`],
});

describe('defineMeleeStrike tooltip / getDamage tokens', () => {
    it('without context shows base damage', () => {
        const lines = melee.getTooltipText();
        expect(lines).toEqual([`Hit {1} enemy for {${BASE_DAMAGE}} damage`]);
        expect(melee.getDamage?.()).toBe(BASE_DAMAGE);
    });

    it('Mighty mult 1.4 updates damage segment (and getDamage)', () => {
        const multiplier = 1.4;
        const gameState = {
            getLocalPlayerUnit: () => ({
                getDamageModifier: () => ({ flatAmt: 0, multiplier }),
                stackSize: 1,
            }),
        };
        const lines = melee.getTooltipText(gameState);
        // 8 * 1.4 = 11.2 → formatTooltipNumber (≥10) → "11"
        expect(lines).toEqual(['Hit {1} enemy for {11} damage']);

        const caster = {
            getDamageModifier: () => ({ flatAmt: 0, multiplier }),
            stackSize: 1,
        } as unknown as Unit;
        expect(melee.getDamage?.(caster)).toBe(8 * 1.4);
    });

    it('rewrites legacy {base} placeholders to the damage token path', () => {
        const legacy = defineMeleeStrike({
            id: 'test_melee_legacy',
            name: 'Legacy',
            image: '',
            damage: 10,
            getTooltipText: () => [`Deal {10} damage`],
        });
        const gameState = {
            getLocalPlayerUnit: () => ({
                getDamageModifier: () => ({ flatAmt: 0, multiplier: 1.4 }),
                stackSize: 1,
            }),
        };
        expect(legacy.getTooltipText(gameState)).toEqual(['Deal {14} damage']);
        expect(legacy.getTooltipText()).toEqual(['Deal {10} damage']);
    });
});
