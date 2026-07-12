/**
 * Unit tests for the HP-cost declarative infra added to AbilityStatic (`hpCost` / `hpCostGate`)
 * and its wiring into `getAbilityDisabledReason`'s affordability check.
 *
 * Covers:
 *  - 'requireSurplus' (the default when hpCostGate is omitted): disabled at hp<=hpCost, enabled
 *    once hp>hpCost.
 *  - 'floorAtOne': never disabled regardless of current hp.
 *  - 'none': never disabled.
 *  - No hpCost set at all: hp gating never applies.
 */

import { describe, expect, it } from 'vitest';
import { getAbilityDisabledReason } from '../ui/components/abilityDisabledReason';
import type { AbilityStatic } from './Ability';
import type { Unit } from '../game/units/Unit';

function makeAbility(overrides: Partial<AbilityStatic> = {}): AbilityStatic {
    return {
        id: 'test_hp_ability',
        name: 'Test HP Ability',
        image: '',
        resourceCost: null,
        rechargeTurns: 1,
        prefireTime: 0.2,
        targets: [],
        abilityTimings: [],
        getTooltipText: () => [],
        ...overrides,
    } as unknown as AbilityStatic;
}

function makeUnit(hp: number): Unit {
    return {
        hp,
        getResource: () => null,
    } as unknown as Unit;
}

function baseParams(unit: Unit, ability: AbilityStatic) {
    return {
        playerUnit: unit,
        ability,
        abilityId: ability.id,
        currentUses: 1,
        isMyTurn: true,
        allUnits: [unit],
        conditionalCancelContext: null,
    };
}

describe('HP-cost affordability gating', () => {
    it("requireSurplus: disabled ('cannot_afford'/'hp') when hp <= hpCost", () => {
        const ability = makeAbility({ hpCost: 5, hpCostGate: 'requireSurplus' });
        const reason = getAbilityDisabledReason(baseParams(makeUnit(5), ability));
        expect(reason).toEqual({ reason_id: 'cannot_afford', resourceId: 'hp' });
    });

    it('requireSurplus: enabled once hp > hpCost', () => {
        const ability = makeAbility({ hpCost: 5, hpCostGate: 'requireSurplus' });
        const reason = getAbilityDisabledReason(baseParams(makeUnit(6), ability));
        expect(reason).toBeNull();
    });

    it('defaults to requireSurplus when hpCostGate is omitted', () => {
        const ability = makeAbility({ hpCost: 5 });
        expect(getAbilityDisabledReason(baseParams(makeUnit(5), ability)))
            .toEqual({ reason_id: 'cannot_afford', resourceId: 'hp' });
        expect(getAbilityDisabledReason(baseParams(makeUnit(6), ability))).toBeNull();
    });

    it('floorAtOne: never disabled regardless of hp', () => {
        const ability = makeAbility({ hpCost: 5, hpCostGate: 'floorAtOne' });
        expect(getAbilityDisabledReason(baseParams(makeUnit(0), ability))).toBeNull();
        expect(getAbilityDisabledReason(baseParams(makeUnit(1), ability))).toBeNull();
        expect(getAbilityDisabledReason(baseParams(makeUnit(100), ability))).toBeNull();
    });

    it("gate 'none': never disabled", () => {
        const ability = makeAbility({ hpCost: 5, hpCostGate: 'none' });
        expect(getAbilityDisabledReason(baseParams(makeUnit(0), ability))).toBeNull();
    });

    it('no hpCost set: hp gating never applies', () => {
        const ability = makeAbility();
        expect(getAbilityDisabledReason(baseParams(makeUnit(0), ability))).toBeNull();
    });
});
