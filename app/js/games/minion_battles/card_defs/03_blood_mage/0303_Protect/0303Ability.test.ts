import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { getAbilityDisabledReason } from '../../../ui/components/abilityDisabledReason';
import { getSelectTargetDefsFromTimings, resolveSelectTargetLockOnCandidates } from '../../../abilities/targeting';
import { SHIELD_BUFF_TYPE, type ShieldBuff } from '../../../buffs/ShieldBuff';
import type { TeamId } from '../../../game/teams';
import type { ResolvedTarget } from '../../../game/types';
import {
    BLOOD_MAGE_ALLY_SPLASH_DAMAGE,
    BLOOD_MAGE_ALLY_SPLASH_MAX_TARGETS,
    BLOOD_MAGE_ALLY_SPLASH_RADIUS,
} from '../../../abilities/bloodMageAllySplash';
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

function makeEnemy(id: string, x: number, y: number, hp = 100): Unit {
    return new Unit({
        id,
        x,
        y,
        hp,
        maxHp: 100,
        speed: 100,
        teamId: 'enemy' as TeamId,
        ownerId: 'ai',
        characterId: 'enemy',
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

    it('active frame deals splash damage to up to 4 nearest enemies around the ally', () => {
        const caster = makeCaster(100);
        const ally = makeAlly('ally', 50);
        const near = [
            makeEnemy('e1', 120, 100),
            makeEnemy('e2', 100, 130),
            makeEnemy('e3', 140, 100),
            makeEnemy('e4', 100, 150),
        ];
        const fifthInCircle = makeEnemy('e5', 160, 100);
        const outside = makeEnemy('far', 100 + BLOOD_MAGE_ALLY_SPLASH_RADIUS + 20, 100);
        const engine = makeEngine([caster, ally, ...near, fifthInCircle, outside]);

        executeUnitAbility(caster, ProtectAbility_0303, targetsFor(ally), engine);
        advanceSimulation(caster, engine, ACTIVE_TICK_ADVANCE);

        for (const enemy of near) {
            expect(enemy.hp).toBe(100 - BLOOD_MAGE_ALLY_SPLASH_DAMAGE);
        }
        expect(fifthInCircle.hp).toBe(100);
        expect(outside.hp).toBe(100);
        const shield = ally.buffs.find((b) => b._type === SHIELD_BUFF_TYPE) as ShieldBuff | undefined;
        expect(shield?.remainingHp).toBe(PROTECT_SHIELD_HP);
        expect(BLOOD_MAGE_ALLY_SPLASH_MAX_TARGETS).toBe(4);
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

    it('click-based targeting lets the caster select themselves and other allies, never enemies', () => {
        // Regression: UnitRangeHitboxSpec/filterSelectTargetCandidates used to hard-exclude
        // the caster from candidates, so a self-castable filter:'ally' step could never
        // resolve a click on the caster themselves through the real click-resolution path.
        const caster = makeCaster(100);
        const ally = makeAlly('ally', 100);
        const enemy = new Unit({
            id: 'enemy', x: 50, y: 250, hp: 100, maxHp: 100, speed: 100,
            teamId: 'enemy' as TeamId, ownerId: 'ai', characterId: 'enemy', name: 'enemy',
            radius: DEFAULT_UNIT_RADIUS,
        });
        const engine = makeEngine([caster, ally, enemy]);
        const selectDef = getSelectTargetDefsFromTimings(ProtectAbility_0303, caster, engine)[0]!;

        const clickOnSelf = resolveSelectTargetLockOnCandidates(
            ProtectAbility_0303, caster, selectDef, { x: caster.x, y: caster.y }, engine,
        );
        expect(clickOnSelf.map((u) => u.id)).toEqual([caster.id]);

        const clickOnAlly = resolveSelectTargetLockOnCandidates(
            ProtectAbility_0303, caster, selectDef, { x: ally.x, y: ally.y }, engine,
        );
        expect(clickOnAlly.map((u) => u.id)).toEqual([ally.id]);

        const clickOnEnemy = resolveSelectTargetLockOnCandidates(
            ProtectAbility_0303, caster, selectDef, { x: enemy.x, y: enemy.y }, engine,
        );
        expect(clickOnEnemy).toEqual([]);
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
