import { describe, expect, it, vi, beforeAll } from 'vitest';
import { defineAbility } from './defineAbility';
import { AbilityPhase } from './abilityTimings';
import type { AbilityStatic } from './Ability';
import { registerAbilityForTest } from './AbilityRegistry';
import {
    getAvailableModes,
    getModeUnavailableReason,
    isPreferredModeBlocked,
    resolveEffectiveMode,
    resolveSlotMode,
} from './resolveAbilityMode';
import { executeUnitAbility } from '../game/units/unitAbilityLifecycle';
import { serializeUnit } from '../game/units/unitToJSON';
import { applySerializedUnitState } from '../game/units/unitFromJSON';
import { Unit } from '../game/units/Unit';
import { EventBus } from '../game/EventBus';
import type { EngineContext } from '../game/EngineContext';
import { Water } from '../resources/Water';

const SLOT_ID = 'test_modes_slot';
const HP_ID = 'test_modes_hp_card';
const ICE = 'ice';
const BLOOD = 'blood';
const WATER_COST = 3;
const HP_COST = 10;

function card(overrides: Partial<AbilityStatic> & Pick<AbilityStatic, 'id' | 'name'>): AbilityStatic {
    return defineAbility({
        image: '',
        resourceCost: null,
        rechargeTurns: 0,
        prefireTime: 0,
        targets: [],
        abilityTimings: [{ id: 'active', start: 0, end: 1, abilityPhase: AbilityPhase.Active, castBehaviours: [] }],
        getTooltipText: () => [overrides.name],
        getRange: () => ({ minRange: 0, maxRange: 100 }),
        ...overrides,
    });
}

const SlotAbility = card({
    id: SLOT_ID,
    name: 'Slot',
    resourceCost: { resourceId: 'water', amount: WATER_COST },
    abilityModes: {
        modes: [ICE, BLOOD],
        defaultMode: ICE,
        modeAbilityIds: { [BLOOD]: HP_ID },
        fallbackMode: BLOOD,
        ownedCardModes: [BLOOD],
    },
});
const HpAbility = card({ id: HP_ID, name: 'Hp Card', hpCost: HP_COST });

function makeUnit(water = 5, hp = 100): Unit {
    const unit = new Unit({
        id: 'caster', x: 0, y: 0, hp, maxHp: 100, speed: 100,
        teamId: 'player', ownerId: 'p1', characterId: 'player', name: 'Caster',
        abilities: [SLOT_ID],
    });
    for (const id of [SLOT_ID, HP_ID]) {
        unit.abilityRuntime[id] = {
            currentUses: 2, maxUses: 2, recoveryChargesByType: {}, active: true, replacedAbilityId: null,
        };
    }
    const w = new Water();
    w.current = water;
    unit.attachResource(w, new EventBus());
    return unit;
}

function makeEngine(): EngineContext {
    return {
        gameTime: 0, gameTick: 0, roundNumber: 1, eventBus: new EventBus(),
        trackAbilityUse: vi.fn(), getUnit: vi.fn(), addEffectEmitter: vi.fn(), units: [],
    } as unknown as EngineContext;
}

describe('resolveAbilityMode helpers', () => {
    beforeAll(() => {
        registerAbilityForTest(SlotAbility);
        registerAbilityForTest(HpAbility);
    });

    it('hides locked modes', () => {
        const unit = makeUnit();
        expect(getAvailableModes(unit, SlotAbility)).toEqual([ICE, BLOOD]);
        unit.lockedAbilityModes = { [SLOT_ID]: [BLOOD] };
        expect(getAvailableModes(unit, SlotAbility)).toEqual([ICE]);
    });

    it('gives a reason for no resource, no uses and an HP gate', () => {
        const unit = makeUnit(1);
        expect(getModeUnavailableReason(unit, SlotAbility, ICE)).toBe(`Needs ${WATER_COST} Water`);
        expect(getModeUnavailableReason(unit, SlotAbility, BLOOD)).toBeNull();

        unit.abilityRuntime[HP_ID]!.currentUses = 0;
        expect(getModeUnavailableReason(unit, SlotAbility, BLOOD)).toBe('No uses left');

        const lowHp = makeUnit(5, HP_COST);
        expect(getModeUnavailableReason(lowHp, SlotAbility, BLOOD)).toBe('Needs more HP');
        expect(getModeUnavailableReason(lowHp, SlotAbility, ICE)).toBeNull();
    });

    it('reports the preferred mode as blocked until its Water is recovered (drives the auto toggle up)', () => {
        const unit = makeUnit(1);
        expect(isPreferredModeBlocked(unit, SlotAbility)).toBe(true);
        unit.getResource('water')!.current = WATER_COST;
        expect(isPreferredModeBlocked(unit, SlotAbility)).toBe(false);
    });

    it('falls back when the chosen mode cannot be cast and returns when it can', () => {
        const unit = makeUnit(1);
        expect(resolveEffectiveMode(unit, SlotAbility, ICE)).toBe(BLOOD);
        unit.getResource('water')!.current = WATER_COST;
        expect(resolveEffectiveMode(unit, SlotAbility, ICE)).toBe(ICE);
    });

    it('keeps an explicit Blood choice and defaults a missing or locked choice', () => {
        const unit = makeUnit(5);
        expect(resolveEffectiveMode(unit, SlotAbility, BLOOD)).toBe(BLOOD);
        expect(resolveEffectiveMode(unit, SlotAbility, undefined)).toBe(ICE);
        unit.lockedAbilityModes = { [SLOT_ID]: [ICE] };
        expect(resolveEffectiveMode(unit, SlotAbility, ICE)).toBe(ICE);
    });

    it('shows a mode picked on the strip even when it cannot be cast', () => {
        const unit = makeUnit(1);
        expect(resolveSlotMode(unit, SlotAbility, ICE)).toBe(ICE);
        expect(resolveSlotMode(unit, SlotAbility, BLOOD)).toBe(BLOOD);
    });

    it('with no pick, shows the fallback while the default cannot be cast and the default once it can', () => {
        const unit = makeUnit(1);
        expect(resolveSlotMode(unit, SlotAbility, undefined)).toBe(BLOOD);
        unit.getResource('water')!.current = WATER_COST;
        expect(resolveSlotMode(unit, SlotAbility, undefined)).toBe(ICE);
    });

    it('ignores a pick of a locked mode', () => {
        const unit = makeUnit(1);
        unit.lockedAbilityModes = { [SLOT_ID]: [BLOOD] };
        expect(resolveSlotMode(unit, SlotAbility, BLOOD)).toBe(ICE);
    });

    it('does not fall back to a locked mode', () => {
        const unit = makeUnit(1);
        unit.lockedAbilityModes = { [SLOT_ID]: [BLOOD] };
        expect(resolveEffectiveMode(unit, SlotAbility, ICE)).toBe(ICE);
    });

    it('does not fall back when the fallback mode is castable-blocked too', () => {
        const unit = makeUnit(1);
        unit.abilityRuntime[HP_ID]!.currentUses = 0;
        expect(resolveEffectiveMode(unit, SlotAbility, ICE)).toBe(ICE);
    });

    it('casts the fallback card at cast time when Water ran out after submit', () => {
        const unit = makeUnit(1);
        executeUnitAbility(unit, SlotAbility, [], makeEngine(), ICE);
        expect(unit.activeAbilities[0]?.abilityId).toBe(HP_ID);
        expect(unit.activeAbilities[0]?.abilityMode).toBe(BLOOD);
        expect(unit.getResource('water')!.current).toBe(1);
    });

    it('round-trips lockedAbilityModes through unit JSON', () => {
        const unit = makeUnit();
        unit.lockedAbilityModes = { [SLOT_ID]: [BLOOD] };
        const restored = makeUnit();
        applySerializedUnitState(restored, JSON.parse(JSON.stringify(serializeUnit(unit, 0))), new EventBus(), 0);
        expect(restored.lockedAbilityModes).toEqual({ [SLOT_ID]: [BLOOD] });
    });
});
