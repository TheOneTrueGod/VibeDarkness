import { describe, expect, it } from 'vitest';
import { PassiveStatKey } from '../researchTrees/types';
import { applyPassiveBonusToBase } from '../researchTrees/passiveBonuses';
import { getDefaultHp } from '../games/minion_battles/game/units/unit_defs/unitDef';
import {
    applyDarknessStrengthStatBuffs,
    compileStatBags,
    mergePassiveBonuses,
} from './compile';
import {
    DS_ENEMY_FIERCE_ALL_DAMAGE_MULT,
    DS_ENEMY_FIERCE_ID,
    DS_ENEMY_HARDENED_ID,
    DS_ENEMY_HARDENED_MAX_HEALTH_MULT,
} from './packages/starters';
import { resolveActiveDarknessStrengths } from './resolve';
import type { DarknessStrengthDef } from './types';
import type { ActiveDarknessStrength } from './resolve';
import type { PassiveBonuses } from '../researchTrees/types';

function activeFromIds(packageIds: string[]): ActiveDarknessStrength[] {
    return resolveActiveDarknessStrengths({
        instances: packageIds.map((packageId) => ({ packageId })),
    });
}

describe('compileStatBags', () => {
    it('stacks hardened maxHealth and fierce all_damage on an unfiltered enemy', () => {
        const active = activeFromIds([DS_ENEMY_HARDENED_ID, DS_ENEMY_FIERCE_ID]);
        const bags = compileStatBags(active);
        expect(bags.enemy.maxHealth?.mult).toBe(DS_ENEMY_HARDENED_MAX_HEALTH_MULT);
        expect(bags.enemy.all_damage?.mult).toBe(DS_ENEMY_FIERCE_ALL_DAMAGE_MULT);
        expect(bags.player).toEqual({});

        const baseHp = getDefaultHp('swarmling');
        expect(applyPassiveBonusToBase(baseHp, bags.enemy.maxHealth)).toBe(
            Math.floor(baseHp * DS_ENEMY_HARDENED_MAX_HEALTH_MULT),
        );
    });

    it('filter excludes non-matching characterId when filter is set', () => {
        const filteredDef: DarknessStrengthDef = {
            packageId: 'ds_test_swarmling_only',
            name: 'Test',
            description: 'test',
            icon: '',
            lane: 'darkness',
            compile: [
                {
                    type: 'statBag',
                    target: 'enemy',
                    filter: { characterId: 'swarmling' },
                    bonuses: {
                        [PassiveStatKey.MaxHealth]: { mult: 2 },
                    },
                },
            ],
        };
        const active: ActiveDarknessStrength[] = [
            { packageId: filteredDef.packageId, def: filteredDef },
        ];

        expect(compileStatBags(active).enemy).toEqual({});
        expect(compileStatBags(active, { characterId: 'boar' }).enemy).toEqual({});
        expect(compileStatBags(active, { characterId: 'swarmling' }).enemy.maxHealth?.mult).toBe(2);
    });

    it('mergePassiveBonuses stacks mult as 1+Σ(mult−1)', () => {
        const merged = mergePassiveBonuses(
            { maxHealth: { add: 0, mult: 1.3 } },
            { maxHealth: { add: 10, mult: 1.2 } },
        );
        expect(merged?.maxHealth).toEqual({ add: 10, mult: 1.5 });
    });
});

describe('applyDarknessStrengthStatBuffs', () => {
    it('bakes hardened + fierce onto a synthetic enemy unit', () => {
        const active = activeFromIds([DS_ENEMY_HARDENED_ID, DS_ENEMY_FIERCE_ID]);
        const baseHp = getDefaultHp('swarmling');
        const unit = {
            characterId: 'swarmling',
            teamId: 'enemy',
            hp: baseHp,
            maxHp: baseHp,
            passiveBonuses: undefined as PassiveBonuses | undefined,
            combatSettings: undefined as
                | { damageModifier: { flatAmt: number; multiplier: number } }
                | undefined,
        };

        applyDarknessStrengthStatBuffs(unit, active);

        expect(unit.maxHp).toBe(Math.floor(baseHp * DS_ENEMY_HARDENED_MAX_HEALTH_MULT));
        expect(unit.hp).toBe(unit.maxHp);
        expect(unit.passiveBonuses?.maxHealth?.mult).toBe(DS_ENEMY_HARDENED_MAX_HEALTH_MULT);
        expect(unit.passiveBonuses?.all_damage?.mult).toBe(DS_ENEMY_FIERCE_ALL_DAMAGE_MULT);
        expect(unit.combatSettings?.damageModifier.multiplier).toBe(DS_ENEMY_FIERCE_ALL_DAMAGE_MULT);
        expect(unit.combatSettings?.damageModifier.flatAmt).toBe(0);
    });

    it('skips filtered packages for non-matching enemies', () => {
        const filteredDef: DarknessStrengthDef = {
            packageId: 'ds_test_boar_only',
            name: 'Test',
            description: 'test',
            icon: '',
            lane: 'darkness',
            compile: [
                {
                    type: 'statBag',
                    target: 'enemy',
                    filter: { characterId: 'boar' },
                    bonuses: {
                        [PassiveStatKey.MaxHealth]: { mult: 2 },
                    },
                },
            ],
        };
        const active: ActiveDarknessStrength[] = [
            { packageId: filteredDef.packageId, def: filteredDef },
        ];
        const baseHp = getDefaultHp('swarmling');
        const unit = {
            characterId: 'swarmling',
            teamId: 'enemy',
            hp: baseHp,
            maxHp: baseHp,
            passiveBonuses: undefined as PassiveBonuses | undefined,
        };

        applyDarknessStrengthStatBuffs(unit, active);
        expect(unit.maxHp).toBe(baseHp);
        expect(unit.passiveBonuses).toBeUndefined();
    });

    it('does not alter player units when only enemy packages are active', () => {
        const active = activeFromIds([DS_ENEMY_HARDENED_ID]);
        const unit = {
            characterId: 'player',
            teamId: 'player',
            hp: 100,
            maxHp: 100,
            passiveBonuses: undefined as PassiveBonuses | undefined,
        };
        applyDarknessStrengthStatBuffs(unit, active);
        expect(unit.maxHp).toBe(100);
        expect(unit.passiveBonuses).toBeUndefined();
    });
});
