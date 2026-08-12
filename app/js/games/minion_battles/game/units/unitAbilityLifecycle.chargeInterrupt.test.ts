import { describe, it, expect } from 'vitest';
import { Unit } from './Unit';
import { interruptAllUnitAbilities, interruptAndRefundUnitAbilities } from './unitAbilityLifecycle';
import { DarkWolfBiteAbility } from '../../card_defs/dark_animals/0003_DarkWolfBite/0003Ability';
import {
    AbilityPhase,
    getCoveringAbilityPhaseAtElapsed,
    normalizeAbilityTimingsToIntervals,
} from '../../abilities/abilityTimings';
import { ensureAbilityRuntimeState, consumeAbilityUse } from '../../abilities/abilityUses';
import type { EngineContext } from '../EngineContext';

const CHARGE_INTERVALS = normalizeAbilityTimingsToIntervals(DarkWolfBiteAbility.abilityTimings);
const COOLDOWN_INTERVAL = CHARGE_INTERVALS.find((it) => it.abilityPhase === AbilityPhase.Cooldown)!;
const WINDUP_MID_ELAPSED = COOLDOWN_INTERVAL.start * 0.25;

function makeWolf(gameTime = 10): Unit {
    const unit = new Unit({
        id: 'wolf',
        x: 100,
        y: 100,
        hp: 40,
        maxHp: 40,
        speed: 80,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'dark_wolf',
        name: 'Dark Wolf',
        abilities: [DarkWolfBiteAbility.id],
    });
    ensureAbilityRuntimeState(unit, DarkWolfBiteAbility.id);
    const maxUses = unit.abilityRuntime[DarkWolfBiteAbility.id]!.maxUses;
    consumeAbilityUse(unit, DarkWolfBiteAbility.id);
    unit.activeAbilities = [{
        abilityId: DarkWolfBiteAbility.id,
        startTime: gameTime - WINDUP_MID_ELAPSED,
        targets: [{ type: 'pixel', position: { x: 200, y: 100 } }],
        castPayload: {
            targetId: '',
            targetX: 200,
            targetY: 100,
            lungeStartX: 100,
            lungeStartY: 100,
            chargeDirX: 1,
            chargeDirY: 0,
            hitTargetIds: [],
        },
    }];
    unit.setAbilityNote({
        abilityId: DarkWolfBiteAbility.id,
        abilityNote: unit.activeAbilities[0]!.castPayload,
    });
    expect(unit.abilityRuntime[DarkWolfBiteAbility.id]!.currentUses).toBe(maxUses - 1);
    return unit;
}

function phaseAt(unit: Unit, gameTime: number): AbilityPhase | null {
    const active = unit.activeAbilities[0];
    if (!active) return null;
    const elapsed = gameTime - active.startTime;
    return getCoveringAbilityPhaseAtElapsed(elapsed, CHARGE_INTERVALS);
}

describe('charge interrupt during windup', () => {
    it('interruptAllAbilities skips to full cooldown without refunding uses', () => {
        const gameTime = 10;
        const unit = makeWolf(gameTime);
        const usesBefore = unit.abilityRuntime[DarkWolfBiteAbility.id]!.currentUses;

        interruptAllUnitAbilities(unit, { gameTime });

        expect(unit.activeAbilities).toHaveLength(1);
        expect(unit.activeAbilities[0]!.abilityId).toBe(DarkWolfBiteAbility.id);
        expect(unit.activeAbilities[0]!.castPayload).toBeUndefined();
        expect(unit.abilityNote).toBeNull();
        expect(phaseAt(unit, gameTime)).toBe(AbilityPhase.Cooldown);
        expect(gameTime - unit.activeAbilities[0]!.startTime).toBeCloseTo(COOLDOWN_INTERVAL.start);
        expect(unit.abilityRuntime[DarkWolfBiteAbility.id]!.currentUses).toBe(usesBefore);
        expect(unit.canAct()).toBe(false);

        const cooldownEndGameTime = gameTime + (COOLDOWN_INTERVAL.end - COOLDOWN_INTERVAL.start);
        expect(phaseAt(unit, cooldownEndGameTime - 0.01)).toBe(AbilityPhase.Cooldown);
        expect(cooldownEndGameTime - unit.activeAbilities[0]!.startTime)
            .toBeCloseTo(COOLDOWN_INTERVAL.end);
    });

    it('interruptAndRefundAbilities also skips to cooldown without restoring uses', () => {
        const gameTime = 12;
        const unit = makeWolf(gameTime);
        const usesBefore = unit.abilityRuntime[DarkWolfBiteAbility.id]!.currentUses;
        const engine = { gameTime } as EngineContext;

        interruptAndRefundUnitAbilities(unit, engine);

        expect(unit.activeAbilities).toHaveLength(1);
        expect(phaseAt(unit, gameTime)).toBe(AbilityPhase.Cooldown);
        expect(unit.abilityRuntime[DarkWolfBiteAbility.id]!.currentUses).toBe(usesBefore);
        expect(unit.activeAbilities[0]!.castPayload).toBeUndefined();
    });
});
