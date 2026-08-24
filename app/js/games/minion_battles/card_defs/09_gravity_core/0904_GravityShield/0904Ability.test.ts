import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { updateUnit } from '../../../game/units/unitMovementTick';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { getAbilityDisabledReason } from '../../../ui/components/abilityDisabledReason';
import { getSelectTargetDefsFromTimings, resolveSelectTargetLockOnCandidates } from '../../../abilities/targeting';
import { SHIELD_BUFF_TYPE, type ShieldBuff } from '../../../buffs/ShieldBuff';
import { Gravity } from '../../../resources/Gravity';
import type { TeamId } from '../../../game/teams';
import type { ResolvedTarget } from '../../../game/types';
import { ROUND_DURATION } from '../../../game/gameConstants';
import {
    GRAVITY_SHIELD_DRAIN_PER_SECOND,
    GRAVITY_SHIELD_DURATION_ROUNDS,
    GRAVITY_SHIELD_GRAVITY_COST,
    GRAVITY_SHIELD_HP,
    GRAVITY_SHIELD_PREFIRE_TIME,
} from '../gravityConstants';
import { GravityShieldAbility } from './0904Ability';

const CARD_ID = GravityShieldAbility.id;
const TICK_DT = 0.01;
const ACTIVE_TICK_ADVANCE = GRAVITY_SHIELD_PREFIRE_TIME + 0.02;

function makeCaster(initialGravity: number): Unit {
    const unit = new Unit({
        id: 'caster',
        x: 50,
        y: 100,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: 'Caster',
        abilities: [CARD_ID],
        radius: DEFAULT_UNIT_RADIUS,
    });
    unit.abilityRuntime[CARD_ID] = {
        currentUses: 1,
        maxUses: 1,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    };
    const gravity = new Gravity();
    gravity.add(initialGravity);
    gravity.attach(unit, new EventBus());
    unit.resources.push(gravity);
    return unit;
}

function makeAlly(id: string): Unit {
    return new Unit({
        id,
        x: 100,
        y: 100,
        hp: 80,
        maxHp: 100,
        speed: 100,
        teamId: 'player',
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

function advanceSimulation(units: Unit[], engine: EngineContext, totalSeconds: number): void {
    const steps = Math.ceil(totalSeconds / TICK_DT);
    for (let i = 0; i < steps; i++) {
        engine.gameTime += TICK_DT;
        for (const unit of units) {
            tickUnitActiveAbilities(unit, TICK_DT, engine, vi.fn());
            updateUnit(unit, TICK_DT, engine);
        }
    }
}

function allyShield(ally: Unit): ShieldBuff | undefined {
    return ally.buffs.find((b) => b._type === SHIELD_BUFF_TYPE) as ShieldBuff | undefined;
}

describe('GravityShieldAbility', () => {
    it('grants the target a gravity-themed ShieldBuff at the starting armour pool', () => {
        const caster = makeCaster(GRAVITY_SHIELD_GRAVITY_COST + 5);
        const ally = makeAlly('ally');
        const engine = makeEngine([caster, ally]);

        executeUnitAbility(caster, GravityShieldAbility, targetsFor(ally), engine);
        advanceSimulation([caster, ally], engine, ACTIVE_TICK_ADVANCE);

        const shield = allyShield(ally);
        expect(shield).toBeDefined();
        expect(shield?.remainingHp).toBeCloseTo(GRAVITY_SHIELD_HP, 0);
        expect(shield?.theme).toBe('gravity');
        expect(shield?.drainPerSecond).toBe(GRAVITY_SHIELD_DRAIN_PER_SECOND);
    });

    it('drains an undamaged shield to expired over one round', () => {
        const caster = makeCaster(GRAVITY_SHIELD_GRAVITY_COST + 5);
        const ally = makeAlly('ally');
        const engine = makeEngine([caster, ally]);

        executeUnitAbility(caster, GravityShieldAbility, targetsFor(ally), engine);
        advanceSimulation(
            [caster, ally],
            engine,
            ACTIVE_TICK_ADVANCE + GRAVITY_SHIELD_DURATION_ROUNDS * ROUND_DURATION + 0.05,
        );

        expect(allyShield(ally)).toBeUndefined();
    });

    it('is disabled without enough gravity and castable at the medium cost', () => {
        const broke = makeCaster(GRAVITY_SHIELD_GRAVITY_COST - 1);
        const funded = makeCaster(GRAVITY_SHIELD_GRAVITY_COST);
        const ally = makeAlly('ally');

        expect(getAbilityDisabledReason({
            playerUnit: broke,
            ability: GravityShieldAbility,
            abilityId: CARD_ID,
            currentUses: 1,
            isMyTurn: true,
            allUnits: [broke, funded, ally],
            conditionalCancelContext: null,
        })).toEqual({ reason_id: 'cannot_afford', resourceId: 'gravity' });

        expect(getAbilityDisabledReason({
            playerUnit: funded,
            ability: GravityShieldAbility,
            abilityId: CARD_ID,
            currentUses: 1,
            isMyTurn: true,
            allUnits: [broke, funded, ally],
            conditionalCancelContext: null,
        })).toBeNull();
    });

    it('click-based targeting lets the caster select themselves and other allies, never enemies', () => {
        const caster = makeCaster(GRAVITY_SHIELD_GRAVITY_COST);
        const ally = makeAlly('ally');
        const enemy = new Unit({
            id: 'enemy',
            x: 50,
            y: 250,
            hp: 100,
            maxHp: 100,
            speed: 100,
            teamId: 'enemy' as TeamId,
            ownerId: 'ai',
            characterId: 'enemy',
            name: 'enemy',
            radius: DEFAULT_UNIT_RADIUS,
        });
        const engine = makeEngine([caster, ally, enemy]);
        const selectDef = getSelectTargetDefsFromTimings(GravityShieldAbility, caster, engine)[0]!;

        const clickOnSelf = resolveSelectTargetLockOnCandidates(
            GravityShieldAbility, caster, selectDef, { x: caster.x, y: caster.y }, engine,
        );
        expect(clickOnSelf.map((u) => u.id)).toEqual([caster.id]);

        const clickOnAlly = resolveSelectTargetLockOnCandidates(
            GravityShieldAbility, caster, selectDef, { x: ally.x, y: ally.y }, engine,
        );
        expect(clickOnAlly.map((u) => u.id)).toEqual([ally.id]);

        const clickOnEnemy = resolveSelectTargetLockOnCandidates(
            GravityShieldAbility, caster, selectDef, { x: enemy.x, y: enemy.y }, engine,
        );
        expect(clickOnEnemy).toEqual([]);
    });
});
