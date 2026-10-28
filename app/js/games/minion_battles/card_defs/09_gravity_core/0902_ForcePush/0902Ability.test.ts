import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { updateUnit } from '../../../game/units/unitMovementTick';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { UnitTag } from '../../../game/units/unitTag';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { TerrainType } from '../../../terrain/TerrainType';
import { TerrainLayerManager } from '../../../game/TerrainLayerManager';
import type { TeamId } from '../../../game/teams';
import { Gravity } from '../../../resources/Gravity';
import { FIXED_DT } from '../../../game/gameConstants';
import { ExposedBuff } from '../../../buffs/ExposedBuff';
import { HIT_STOP_BUFF_TYPE } from '../../../buffs/HitStopBuff';
import { EARTH_CORE_STONE_HEALTH } from '../../05_earth_core/earthCoreConstants';
import type { ResolvedTarget } from '../../../game/types';
import {
    FORCE_PUSH_COOLDOWN_DURATION,
    FORCE_PUSH_DIRECTION_LABEL,
    FORCE_PUSH_ENEMY_DAMAGE,
    FORCE_PUSH_FALL_DURATION,
    FORCE_PUSH_FLIGHT_DISTANCE,
    FORCE_PUSH_FLIGHT_SPEED,
    FORCE_PUSH_FLUNG_HIT_DAMAGE,
    FORCE_PUSH_GRAVITY_COST,
    FORCE_PUSH_LIFT_DURATION,
    FORCE_PUSH_PREFIRE_TIME,
    FORCE_PUSH_RELEASE_DURATION,
    FORCE_PUSH_SELECT_TICK,
    FORCE_PUSH_TARGET_LABEL,
    FORCE_PUSH_WALL_TERRAIN_DAMAGE,
    FORCE_PUSH_WALL_UNIT_DAMAGE,
} from '../gravityConstants';
import { ForcePushAbility, isForcePushTarget } from './0902Ability';
import { getAbilityUseConfig } from '../../../abilities/abilityUses';

const TICK_DT = FIXED_DT;

const MOVER_START_X = 100;
const STRUCK_CENTER_X = 220;
const SHARED_Y = 100;

/** Into the lift, after the first select has been entered. */
const INTO_LIFT = FORCE_PUSH_PREFIRE_TIME + FORCE_PUSH_SELECT_TICK + 0.05;

/** Just after the fling is launched. */
const LAUNCH_AT =
    FORCE_PUSH_PREFIRE_TIME
    + FORCE_PUSH_SELECT_TICK
    + FORCE_PUSH_LIFT_DURATION
    + FORCE_PUSH_SELECT_TICK
    + 0.02;

const FLIGHT_TIME = FORCE_PUSH_FLIGHT_DISTANCE / FORCE_PUSH_FLIGHT_SPEED;

const FULL_FLING = LAUNCH_AT + FLIGHT_TIME + FORCE_PUSH_FALL_DURATION + 0.05;

function forcePushTargets(
    flung: Unit,
    aim: { x: number; y: number },
): ResolvedTarget[] {
    return [
        { type: 'unit', unitId: flung.id },
        { type: 'pixel', position: aim },
    ];
}

function aimAwayFromCaster(flung: Unit, caster: Unit): { x: number; y: number } {
    const dx = flung.x - caster.x;
    const dy = flung.y - caster.y;
    const dist = Math.hypot(dx, dy);
    const dirX = dist < 1e-6 ? 1 : dx / dist;
    const dirY = dist < 1e-6 ? 0 : dy / dist;
    return {
        x: flung.x + dirX * FORCE_PUSH_FLIGHT_DISTANCE,
        y: flung.y + dirY * FORCE_PUSH_FLIGHT_DISTANCE,
    };
}

function makeCaster(initialGravity: number): Unit {
    const unit = new Unit({
        id: 'caster',
        x: 40,
        y: SHARED_Y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: 'Caster',
        abilities: [ForcePushAbility.id],
        radius: DEFAULT_UNIT_RADIUS,
    });
    unit.abilityRuntime[ForcePushAbility.id] = {
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

function makeUnit(
    id: string,
    x: number,
    y: number,
    teamId: TeamId,
): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai',
        characterId: teamId === 'player' ? 'player' : 'dark_wolf',
        name: id,
        radius: DEFAULT_UNIT_RADIUS,
    });
}

function makeTerrainManager(cols: number, rows: number): TerrainManager {
    const grid = TerrainGrid.createFilledTerrain(cols, rows, CELL_SIZE, TerrainType.Grass);
    const manager = new TerrainManager(grid);
    manager.setTerrainLayers(new TerrainLayerManager());
    return manager;
}

function makeEngine(units: Unit[], terrainManager: TerrainManager | null = null): EngineContext {
    const eventBus = new EventBus();
    return {
        gameTime: 0,
        gameTick: 0,
        roundNumber: 1,
        eventBus,
        units,
        terrainManager,
        getUnit: (id: string) => units.find((u) => u.id === id),
        trackAbilityUse: vi.fn(),
        addEffectEmitter: vi.fn(),
        addEffect: vi.fn(),
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

function castAt(caster: Unit, flung: Unit, engine: EngineContext): void {
    executeUnitAbility(
        caster,
        ForcePushAbility,
        forcePushTargets(flung, aimAwayFromCaster(flung, caster)),
        engine,
    );
}

describe('ForcePushAbility', () => {
    it('refills every use at round start', () => {
        const config = getAbilityUseConfig(ForcePushAbility.id);
        expect(config.maxUses).toBe(ForcePushAbility.maxUses);
        expect(config.refillsEachRound).toBe(true);
        expect(config.recoveries).toEqual([]);
    });

    it('rejects bosses and structures unless the boss is exposed', () => {
        const boss = makeUnit('boss', 100, 100, 'enemy');
        boss.tags.push(UnitTag.Boss);
        boss.ccArmour.hardFloor = 2;
        expect(isForcePushTarget(boss, 0)).toBe(false);

        boss.addBuff(new ExposedBuff(2), 0, 1);
        expect(isForcePushTarget(boss, 0)).toBe(true);

        const nest = makeUnit('nest', 100, 100, 'enemy');
        nest.tags.push(UnitTag.Structure);
        nest.addBuff(new ExposedBuff(2), 0, 1);
        expect(isForcePushTarget(nest, 0)).toBe(false);
    });

    it('flings an exposed boss', () => {
        const caster = makeCaster(100);
        const boss = makeUnit('boss', MOVER_START_X, SHARED_Y, 'enemy');
        boss.tags.push(UnitTag.Boss);
        boss.ccArmour.hardFloor = 2;
        boss.addBuff(new ExposedBuff(3), 0, 1);
        const engine = makeEngine([caster, boss]);

        castAt(caster, boss, engine);
        advanceSimulation([caster, boss], engine, FULL_FLING, [caster]);
        expect(boss.x).toBeGreaterThan(MOVER_START_X + 40);
    });

    it('never lifts a structure', () => {
        const caster = makeCaster(100);
        const nest = makeUnit('nest', MOVER_START_X, SHARED_Y, 'enemy');
        nest.tags.push(UnitTag.Structure);
        const engine = makeEngine([caster, nest]);
        const nestStart = nest.x;

        castAt(caster, nest, engine);
        advanceSimulation([caster, nest], engine, FULL_FLING, [caster]);
        expect(nest.hoverFlight).toBeNull();
        expect(nest.x).toBe(nestStart);
    });

    it('passes through an enemy, damaging both, and hit-stops them on contact', () => {
        const caster = makeCaster(100);
        const flung = makeUnit('flung', MOVER_START_X, SHARED_Y, 'enemy');
        const struck = makeUnit('struck', STRUCK_CENTER_X, SHARED_Y, 'enemy');
        const engine = makeEngine([caster, flung, struck]);
        castAt(caster, flung, engine);

        const steps = Math.ceil(FULL_FLING / TICK_DT);
        let sawHitStop = false;
        for (let i = 0; i < steps; i++) {
            engine.gameTime += TICK_DT;
            tickUnitActiveAbilities(caster, TICK_DT, engine, vi.fn());
            for (const unit of [caster, flung, struck]) updateUnit(unit, TICK_DT, engine);
            if (struck.hp < 100 && flung.hasBuff(HIT_STOP_BUFF_TYPE) && struck.hasBuff(HIT_STOP_BUFF_TYPE)) {
                sawHitStop = true;
            }
        }

        expect(sawHitStop).toBe(true);
        expect(flung.hp).toBe(100 - FORCE_PUSH_FLUNG_HIT_DAMAGE);
        expect(struck.hp).toBe(100 - FORCE_PUSH_ENEMY_DAMAGE);
        expect(flung.x).toBeGreaterThan(STRUCK_CENTER_X);
    });

    it('passes through an iFrame blocker without damaging either unit', () => {
        const caster = makeCaster(100);
        const flung = makeUnit('flung', MOVER_START_X, SHARED_Y, 'enemy');
        const struck = makeUnit('struck', STRUCK_CENTER_X, SHARED_Y, 'enemy');
        vi.spyOn(struck, 'hasIFrames').mockReturnValue(true);
        const engine = makeEngine([caster, flung, struck]);
        castAt(caster, flung, engine);
        advanceSimulation([caster, flung, struck], engine, FULL_FLING, [caster]);

        expect(flung.hp).toBe(100);
        expect(struck.hp).toBe(100);
        expect(flung.x).toBeGreaterThan(STRUCK_CENTER_X);
    });

    it('ricochets off an ally and damages only the flung unit', () => {
        const caster = makeCaster(100);
        const flung = makeUnit('flung', MOVER_START_X, SHARED_Y, 'enemy');
        const ally = makeUnit('ally', STRUCK_CENTER_X, SHARED_Y, 'player');
        const engine = makeEngine([caster, flung, ally]);
        castAt(caster, flung, engine);
        advanceSimulation([caster, flung, ally], engine, FULL_FLING, [caster]);

        expect(flung.hp).toBe(100 - FORCE_PUSH_FLUNG_HIT_DAMAGE);
        expect(ally.hp).toBe(100);
        expect(flung.x).toBeLessThan(ally.x);
    });

    it('a wall hit damages the wall enough to two-shot it, stuns the flung unit, and bounces them', () => {
        expect(FORCE_PUSH_WALL_TERRAIN_DAMAGE * 2).toBeGreaterThanOrEqual(EARTH_CORE_STONE_HEALTH);
        expect(FORCE_PUSH_WALL_TERRAIN_DAMAGE).toBeLessThan(EARTH_CORE_STONE_HEALTH);

        const terrainManager = makeTerrainManager(16, 6);
        const rockCol = 4;
        const rockRow = Math.floor(SHARED_Y / CELL_SIZE);
        terrainManager.grid.set(rockCol, rockRow, TerrainType.Rock);

        const caster = makeCaster(100);
        const flung = makeUnit('flung', MOVER_START_X, SHARED_Y, 'enemy');
        const engine = makeEngine([caster, flung], terrainManager);
        castAt(caster, flung, engine);
        advanceSimulation([caster, flung], engine, LAUNCH_AT + FLIGHT_TIME, [caster]);

        expect(flung.hp).toBe(100 - FORCE_PUSH_WALL_UNIT_DAMAGE);
        expect(flung.hasBuff('stunned')).toBe(true);
        expect(flung.x).toBeLessThan(rockCol * CELL_SIZE);
        expect(terrainManager.getFloorTile(rockCol, rockRow)?.destructible?.health)
            .toBe(EARTH_CORE_STONE_HEALTH - FORCE_PUSH_WALL_TERRAIN_DAMAGE);
    });

    it('travels about a rock-slide length on open ground', () => {
        const caster = makeCaster(100);
        const flung = makeUnit('flung', MOVER_START_X, SHARED_Y, 'enemy');
        const engine = makeEngine([caster, flung]);
        castAt(caster, flung, engine);
        advanceSimulation([caster, flung], engine, FULL_FLING, [caster]);

        expect(flung.x).toBeGreaterThan(MOVER_START_X + FORCE_PUSH_FLIGHT_DISTANCE * 0.8);
        expect(flung.hoverFlight).toBeNull();
    });

    it('drops a lifted unit without refunding when the cast is interrupted', () => {
        const caster = makeCaster(100);
        const flung = makeUnit('flung', MOVER_START_X, SHARED_Y, 'enemy');
        const engine = makeEngine([caster, flung]);
        castAt(caster, flung, engine);
        advanceSimulation([caster, flung], engine, INTO_LIFT, [caster]);

        expect(flung.hoverFlight?.phase).toBe('lift');
        expect(flung.x).toBe(MOVER_START_X);
        const spent = caster.getResource('gravity')!.current;
        expect(spent).toBe(100 - FORCE_PUSH_GRAVITY_COST);

        caster.interruptAllAbilities(engine);
        expect(caster.getResource('gravity')!.current).toBe(spent);

        advanceSimulation([caster, flung], engine, FORCE_PUSH_FALL_DURATION + FORCE_PUSH_COOLDOWN_DURATION, [caster]);
        expect(flung.hoverFlight).toBeNull();
        expect(flung.x).toBe(MOVER_START_X);
    });

    it('does not launch until the lift between the two selects has played', () => {
        const caster = makeCaster(100);
        const flung = makeUnit('flung', MOVER_START_X, SHARED_Y, 'enemy');
        const engine = makeEngine([caster, flung]);
        castAt(caster, flung, engine);
        advanceSimulation([caster, flung], engine, INTO_LIFT, [caster]);

        expect(flung.hoverFlight?.phase).toBe('lift');
        expect(flung.x).toBe(MOVER_START_X);

        advanceSimulation([caster, flung], engine, FORCE_PUSH_LIFT_DURATION + FORCE_PUSH_RELEASE_DURATION, [caster]);
        expect(flung.hoverFlight?.phase === 'flight' || flung.x > MOVER_START_X).toBe(true);
    });

    it('still flings when a later select replaces the positional target list', () => {
        // Interactive targeting stores each click by label, then replaces `targets` with that
        // click's own list. After the aim click the unit is no longer targets[0].
        const caster = makeCaster(100);
        const flung = makeUnit('flung', MOVER_START_X, SHARED_Y, 'enemy');
        const struck = makeUnit('struck', STRUCK_CENTER_X, SHARED_Y, 'enemy');
        const engine = makeEngine([caster, flung, struck]);
        castAt(caster, flung, engine);
        advanceSimulation([caster, flung, struck], engine, INTO_LIFT, [caster]);

        expect(flung.hoverFlight?.phase).toBe('lift');
        const active = caster.activeAbilities.find((ability) => ability.abilityId === ForcePushAbility.id);
        expect(active).toBeDefined();
        const aim = aimAwayFromCaster(flung, caster);
        const pixel: ResolvedTarget = { type: 'pixel', position: aim };
        active!.targetsByLabel = {
            [FORCE_PUSH_TARGET_LABEL]: { type: 'unit', unitId: flung.id },
            [FORCE_PUSH_DIRECTION_LABEL]: pixel,
        };
        active!.targets = [pixel];

        advanceSimulation(
            [caster, flung, struck],
            engine,
            FORCE_PUSH_LIFT_DURATION + FORCE_PUSH_SELECT_TICK + FLIGHT_TIME * 0.5,
            [caster],
        );

        expect(flung.x).toBeGreaterThan(MOVER_START_X + 40);
        expect(struck.hp).toBe(100 - FORCE_PUSH_ENEMY_DAMAGE);
    });
});
