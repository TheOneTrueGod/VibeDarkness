import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { getAbilityDisabledReason } from '../../../ui/components/abilityDisabledReason';
import { SHIELD_BUFF_TYPE, type ShieldBuff } from '../../../buffs/ShieldBuff';
import type { TeamId } from '../../../game/teams';
import type { ResolvedTarget } from '../../../game/types';
import {
    PROTECT_HP_COST,
    PROTECT_SHIELD_HP,
    PROTECT_WINDUP_DURATION,
    ProtectAbility_0303,
} from './0303Ability';

const CARD_ID = ProtectAbility_0303.id;
const TICK_DT = 0.01;
// Just past the windup->active boundary, so the active-frame CastBehaviour fires exactly once.
const ACTIVE_TICK_ADVANCE = PROTECT_WINDUP_DURATION + 0.02;

function makeCaster(hp: number): Unit {
    const unit = new Unit({
        id: 'caster',
        x: 50,
        y: 100,
        hp,
        maxHp: 100,
        speed: 100,
        teamId: 'player' as TeamId,
        ownerId: 'p1',
        characterId: 'player',
        name: 'Caster',
        abilities: [CARD_ID],
        radius: DEFAULT_UNIT_RADIUS,
    });
    unit.abilityRuntime[CARD_ID] = {
        currentUses: 2,
        maxUses: 2,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    };
    return unit;
}

function makeAlly(id: string, hp: number): Unit {
    return new Unit({
        id,
        x: 100,
        y: 100,
        hp,
        maxHp: 100,
        speed: 100,
        teamId: 'player' as TeamId,
        ownerId: 'p1',
        characterId: 'player',
        name: id,
        radius: DEFAULT_UNIT_RADIUS,
    });
}

function makeEngine(units: Unit[]): EngineContext {
    return {
        gameTime: 0,
        gameTick: 0,
        roundNumber: 1,
        eventBus: new EventBus(),
        units,
        terrainManager: null,
        getUnit: (id: string) => units.find((u) => u.id === id),
        trackAbilityUse: vi.fn(),
        addEffectEmitter: vi.fn(),
        addEffect: vi.fn(),
    } as unknown as EngineContext;
}

function targetsFor(target: Unit): ResolvedTarget[] {
    return [{ type: 'unit', unitId: target.id }];
}

function advanceSimulation(caster: Unit, engine: EngineContext, totalSeconds: number): void {
    const steps = Math.ceil(totalSeconds / TICK_DT);
    for (let i = 0; i < steps; i++) {
        engine.gameTime += TICK_DT;
        tickUnitActiveAbilities(caster, TICK_DT, engine, vi.fn());
    }
}

describe('ProtectAbility_0303', () => {
    it('casting grants the target a ShieldBuff with remainingHp:30', () => {
        const caster = makeCaster(100);
        const ally = makeAlly('ally', 50);
        const engine = makeEngine([caster, ally]);

        executeUnitAbility(caster, ProtectAbility_0303, targetsFor(ally), engine);
        advanceSimulation(caster, engine, ACTIVE_TICK_ADVANCE);

        const shield = ally.buffs.find((b) => b._type === SHIELD_BUFF_TYPE) as ShieldBuff | undefined;
        expect(shield).toBeDefined();
        expect(shield?.remainingHp).toBe(PROTECT_SHIELD_HP);
    });

    it('is disabled (cannot_afford / hp) at hp<=5 and castable at hp=6', () => {
        const lowHpCaster = makeCaster(5);
        const okCaster = makeCaster(6);
        const ally = makeAlly('ally', 50);

        expect(getAbilityDisabledReason({
            playerUnit: lowHpCaster,
            ability: ProtectAbility_0303,
            abilityId: CARD_ID,
            currentUses: 2,
            isMyTurn: true,
            allUnits: [lowHpCaster, okCaster, ally],
            conditionalCancelContext: null,
        })).toEqual({ reason_id: 'cannot_afford', resourceId: 'hp' });

        expect(getAbilityDisabledReason({
            playerUnit: okCaster,
            ability: ProtectAbility_0303,
            abilityId: CARD_ID,
            currentUses: 2,
            isMyTurn: true,
            allUnits: [lowHpCaster, okCaster, ally],
            conditionalCancelContext: null,
        })).toBeNull();
    });

    it('deducts PROTECT_HP_COST from the caster on cast', () => {
        const caster = makeCaster(100);
        const ally = makeAlly('ally', 50);
        const engine = makeEngine([caster, ally]);

        executeUnitAbility(caster, ProtectAbility_0303, targetsFor(ally), engine);
        // Not paid yet during windup.
        advanceSimulation(caster, engine, PROTECT_WINDUP_DURATION - 0.1);
        expect(caster.hp).toBe(100);

        advanceSimulation(caster, engine, 0.12);
        expect(caster.hp).toBe(100 - PROTECT_HP_COST);
    });
});
