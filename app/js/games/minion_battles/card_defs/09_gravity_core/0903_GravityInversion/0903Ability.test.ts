import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { updateUnit } from '../../../game/units/unitMovementTick';
import { LIFTED_BUFF_TYPE } from '../../../buffs/LiftedBuff';
import { Gravity } from '../../../resources/Gravity';
import {
    GRAVITY_ABILITY_MODE_PULL,
    GRAVITY_INVERSION_LIFT_DURATION,
    GRAVITY_INVERSION_PREFIRE_TIME,
    GRAVITY_INVERSION_SLAM_DAMAGE,
} from '../gravityConstants';
import { GravityInversionAbility } from './0903Ability';

const CARD_ID = GravityInversionAbility.id;
const TARGET = { x: 100, y: 100 };
const TICK_DT = 0.01;

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

function makeEnemy(id: string, x: number, y: number, overrides: Partial<ConstructorParameters<typeof Unit>[0]> = {}): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'dark_wolf',
        name: id,
        ...overrides,
    });
}

function makeEngine(units: Unit[]): EngineContext {
    const eventBus = new EventBus();
    return {
        gameTime: 0,
        gameTick: 0,
        roundNumber: 1,
        eventBus,
        units,
        getUnit: (id: string) => units.find((u) => u.id === id),
        trackAbilityUse: vi.fn(),
        addEffectEmitter: vi.fn(),
        addEffect: vi.fn(),
        interruptUnitAndRefundAbilities: vi.fn(),
    } as unknown as EngineContext;
}

function advanceSimulation(
    units: Unit[],
    engine: EngineContext,
    totalSeconds: number,
    abilityTickUnits: Unit[] = units,
): void {
    const steps = Math.ceil(totalSeconds / TICK_DT);
    for (let i = 0; i < steps; i++) {
        engine.gameTime += TICK_DT;
        for (const unit of abilityTickUnits) {
            tickUnitActiveAbilities(unit, TICK_DT, engine, vi.fn());
        }
        for (const unit of units) {
            updateUnit(unit, TICK_DT, engine);
        }
    }
}

describe('GravityInversionAbility', () => {
    it('lifted enemy cannot act for 1.5s then takes slam damage', () => {
        const caster = makeCaster(100);
        const enemy = makeEnemy('enemy', 100, 100);
        const engine = makeEngine([caster, enemy]);

        executeUnitAbility(
            caster,
            GravityInversionAbility,
            [{ type: 'pixel', position: { ...TARGET } }],
            engine,
        );

        advanceSimulation([caster, enemy], engine, GRAVITY_INVERSION_PREFIRE_TIME + 0.05, [caster]);
        expect(enemy.hasBuff(LIFTED_BUFF_TYPE)).toBe(true);
        expect(enemy.canAct()).toBe(false);

        advanceSimulation([caster, enemy], engine, GRAVITY_INVERSION_LIFT_DURATION, [caster, enemy]);

        expect(enemy.hasBuff(LIFTED_BUFF_TYPE)).toBe(false);
        expect(enemy.canAct()).toBe(true);
        expect(enemy.hp).toBe(100 - GRAVITY_INVERSION_SLAM_DAMAGE);
    });

    it('pull mode lands the enemy adjacent to the caster', () => {
        const caster = makeCaster(100);
        const enemy = makeEnemy('enemy', 100, 100);
        const engine = makeEngine([caster, enemy]);
        const casterX = caster.x;
        const casterY = caster.y;

        executeUnitAbility(
            caster,
            GravityInversionAbility,
            [{ type: 'pixel', position: { ...TARGET } }],
            engine,
            GRAVITY_ABILITY_MODE_PULL,
        );

        advanceSimulation(
            [caster, enemy],
            engine,
            GRAVITY_INVERSION_PREFIRE_TIME + GRAVITY_INVERSION_LIFT_DURATION + 0.1,
            [caster, enemy],
        );

        expect(enemy.hp).toBe(100 - GRAVITY_INVERSION_SLAM_DAMAGE);
        expect(Math.hypot(enemy.x - casterX, enemy.y - casterY)).toBeLessThan(30);
    });

    it('a CC-armoured boss absorbs the lift attempt', () => {
        const caster = makeCaster(100);
        const boss = makeEnemy('boss', 100, 100, { characterId: 'alpha_wolf' });
        boss.ccArmour.hardFloor = 2;
        boss.ccArmour.bonusHard = 0;
        const engine = makeEngine([caster, boss]);

        executeUnitAbility(
            caster,
            GravityInversionAbility,
            [{ type: 'pixel', position: { ...TARGET } }],
            engine,
        );

        advanceSimulation([caster, boss], engine, GRAVITY_INVERSION_PREFIRE_TIME + 0.05, [caster]);

        expect(boss.hasBuff(LIFTED_BUFF_TYPE)).toBe(false);
        expect(boss.ccArmour.hardConsumed).toBe(1);
        expect(boss.hp).toBe(100);
    });
});
