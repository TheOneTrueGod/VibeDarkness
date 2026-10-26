import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTinyBattleEngine, spawnTinyPlayerUnit } from '../../testing/harness/buildTinyBattleEngine';
import { Unit } from '../units/Unit';
import { applyKnockbackToUnit } from '../units/unitKnockback';
import { serializeUnit } from '../units/unitToJSON';
import { applySerializedUnitState } from '../units/unitFromJSON';
import { computeForcedDisplacement } from '../forceMove';
import { TerrainType } from '../../terrain/TerrainType';
import type { GameEngine } from '../GameEngine';
import { TERRAIN_HAZARD_DEFS } from './terrainHazardDefs';
import { getDrowningRenderState } from './drowning';

const CELL = 40;
const ROW = 2;
const centre = (cell: number) => cell * CELL + CELL / 2;
const TICKS_PER_SECOND = 60;

function engineWithPond(waterCols: number[]): GameEngine {
    const engine = buildTinyBattleEngine({ gridW: 12, gridH: 5, localPlayerId: 'p1' });
    for (const col of waterCols) engine.terrainManager!.grid.set(col, ROW, TerrainType.Water);
    engine.terrainManager!.clearPathCache();
    // A player unit keeps the battle from ending (no players = defeat = no more ticks).
    spawnTinyPlayerUnit(engine, { playerId: 'p1', x: centre(0), y: centre(0), abilities: [] });
    return engine;
}

/** Steps `n` ticks, answering any parallel order pause with a wait for each waiter. */
function step(engine: GameEngine, n: number): void {
    for (let i = 0; i < n; i++) {
        const batch = engine.waitingForOrders;
        if (batch) {
            for (const w of batch.waiters) {
                engine.state.orderMgr.applyOrder({ unitId: w.unitId, abilityId: 'wait', targets: [], endTurn: true });
            }
            engine.tryResumeParallel();
        }
        engine.stepSimulationFixedTicks(1);
    }
}

function addSlime(engine: GameEngine, col: number): Unit {
    const unit = new Unit({
        id: 'slime',
        x: centre(col),
        y: centre(ROW),
        hp: 50,
        maxHp: 50,
        speed: 100,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'slime',
        name: 'Slime',
    });
    engine.addUnit(unit, 'initialGameSpawn');
    return unit;
}

function knockEast(engine: GameEngine, unit: Unit, airDistance: number): void {
    applyKnockbackToUnit(unit, {
        knockbackVector: { x: airDistance, y: 0 },
        knockbackAirTime: 0.1,
        knockbackSlideTime: 0.1,
        knockbackSource: { unitId: 'caster', abilityId: 'test' },
    }, engine.eventBus);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Water terrain', () => {
    it('blocks walking and self-movement but not projectiles or forced movement', () => {
        const engine = engineWithPond([5]);
        const tm = engine.terrainManager!;
        expect(tm.isPassable(centre(5), centre(ROW))).toBe(false);
        expect(tm.isProjectilePassable(centre(5), centre(ROW))).toBe(true);
        expect(tm.grid.hasLineOfSight(centre(3), centre(ROW), centre(8), centre(ROW))).toBe(true);
        expect(tm.nav.isPassable('default', 5, ROW)).toBe(false);

        const dash = computeForcedDisplacement(centre(4), centre(ROW), centre(6), centre(ROW), CELL * 2, { terrainManager: tm });
        expect(centre(4) + dash.dx).toBeLessThan(5 * CELL);
        const shove = computeForcedDisplacement(centre(4), centre(ROW), centre(6), centre(ROW), CELL * 2, { terrainManager: tm, forced: true });
        expect(shove.distance).toBeCloseTo(CELL * 2);
        engine.destroy();
    });
});

describe('Shallow Water terrain', () => {
    it('is walkable at half speed, passes projectiles, and never drowns', () => {
        const engine = engineWithPond([]);
        engine.terrainManager!.grid.set(5, ROW, TerrainType.ShallowWater);
        engine.terrainManager!.clearPathCache();
        const tm = engine.terrainManager!;
        expect(tm.isPassable(centre(5), centre(ROW))).toBe(true);
        expect(tm.getSpeedMultiplier(centre(5), centre(ROW))).toBe(0.5);
        expect(tm.isProjectilePassable(centre(5), centre(ROW))).toBe(true);

        const unit = addSlime(engine, 4);
        step(engine, 1);
        knockEast(engine, unit, 30);
        step(engine, 30);
        expect(unit.terrainHazard).toBeNull();
        engine.destroy();
    });
});

describe('drowning', () => {
    it('knockback into water drowns the unit, then it reappears on land and takes damage', () => {
        const engine = engineWithPond([5, 6, 7]);
        const unit = addSlime(engine, 4);
        step(engine, 1);

        knockEast(engine, unit, 40);
        let ticks = 0;
        while (!unit.terrainHazard && ticks < 60) {
            step(engine, 1);
            ticks++;
        }
        expect(unit.terrainHazard?.hazardId).toBe('drown');
        expect(unit.knockback).toBeNull();
        expect(unit.isUntargetable()).toBe(true);
        expect(unit.canAct()).toBe(false);

        // Untargetable: damage is ignored while drowning.
        unit.takeDamage(25, null, engine.eventBus);
        expect(unit.hp).toBe(50);

        const drownCell = Math.floor(unit.x / CELL);
        expect(drownCell).toBeGreaterThanOrEqual(5);
        step(engine, Math.ceil(TERRAIN_HAZARD_DEFS.drown.durationSeconds * TICKS_PER_SECOND) + 2);

        expect(unit.terrainHazard).toBeNull();
        expect(unit.hp).toBe(50 - TERRAIN_HAZARD_DEFS.drown.damage);
        expect(engine.terrainManager!.isPassable(unit.x, unit.y)).toBe(true);
        // Nearest walkable tile to the drowning cell: one step away (the pond is a single row).
        const restCol = Math.floor(unit.x / CELL);
        const restRow = Math.floor(unit.y / CELL);
        expect(Math.abs(restCol - drownCell) + Math.abs(restRow - ROW)).toBe(1);
        expect(unit.isUntargetable()).toBe(false);
        engine.destroy();
    });

    it('deep water drowns for double damage', () => {
        const engine = engineWithPond([]);
        for (const col of [5, 6, 7]) engine.terrainManager!.grid.set(col, ROW, TerrainType.DeepWater);
        engine.terrainManager!.clearPathCache();
        const unit = addSlime(engine, 4);
        step(engine, 1);
        knockEast(engine, unit, 40);
        let ticks = 0;
        while (!unit.terrainHazard && ticks < 60) {
            step(engine, 1);
            ticks++;
        }
        expect(unit.terrainHazard?.hazardId).toBe('drown_deep');
        step(engine, Math.ceil(TERRAIN_HAZARD_DEFS.drown_deep.durationSeconds * TICKS_PER_SECOND) + 2);
        expect(TERRAIN_HAZARD_DEFS.drown_deep.damage).toBe(2 * TERRAIN_HAZARD_DEFS.drown.damage);
        expect(unit.hp).toBe(50 - TERRAIN_HAZARD_DEFS.drown_deep.damage);
        engine.destroy();
    });

    it('sinks the visual a little more each tick', () => {
        const engine = engineWithPond([5]);
        const unit = addSlime(engine, 5);
        unit.terrainHazard = { hazardId: 'drown', elapsed: 0.25, started: true };
        const early = getDrowningRenderState(unit)!;
        unit.terrainHazard.elapsed = 0.75;
        const late = getDrowningRenderState(unit)!;
        expect(late.sinkY).toBeGreaterThan(early.sinkY);
        expect(late.waterLineY).toBe(early.waterLineY);
        engine.destroy();
    });

    it('with no walkable tile anywhere, logs an error and leaves the unit on the water unharmed', () => {
        const engine = engineWithPond([]);
        const grid = engine.terrainManager!.grid;
        for (let row = 0; row < grid.height; row++) {
            for (let col = 0; col < grid.width; col++) grid.set(col, row, TerrainType.Water);
        }
        engine.terrainManager!.clearPathCache();
        const unit = addSlime(engine, 5);
        unit.terrainHazard = { hazardId: 'drown', elapsed: 0, started: false };
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        step(engine, Math.ceil(TERRAIN_HAZARD_DEFS.drown.durationSeconds * TICKS_PER_SECOND) + 2);

        expect(error).toHaveBeenCalledWith(expect.stringContaining('No walkable tile'));
        expect(unit.terrainHazard).toBeNull();
        expect(unit.hp).toBe(50);
        expect(Math.floor(unit.x / CELL)).toBe(5);
        engine.destroy();
    });

    it('round-trips hazard state through unit serialization', () => {
        const engine = engineWithPond([5]);
        const unit = addSlime(engine, 5);
        unit.terrainHazard = { hazardId: 'drown', elapsed: 0.4, started: true };
        const data = serializeUnit(unit, 0);

        const restored = addSlime(engineWithPond([5]), 5);
        applySerializedUnitState(restored, data, engine.eventBus, 0);
        expect(restored.terrainHazard).toEqual({ hazardId: 'drown', elapsed: 0.4, started: true });
        engine.destroy();
    });
});
