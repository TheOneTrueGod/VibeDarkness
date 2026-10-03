/**
 * PathfindingManager tests: walk goals in, paths out; budget; chase bookkeeping; unreachable
 * goals; and checkpoint determinism.
 *
 * Manager-level tests drive `pathfindingManager.tick` + `updateUnit` directly (the same order
 * `UnitManager.gameTick` uses) so AI and the order system cannot interfere. The determinism test
 * runs the full engine.
 */

import { describe, it, expect } from 'vitest';
import { Unit } from '../game/units/Unit';
import { GameEngine } from '../game/GameEngine';
import { updateUnit } from '../game/units/unitMovementTick';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { CELL_SIZE, TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainManager } from '../terrain/TerrainManager';
import { TerrainType } from '../terrain/TerrainType';
import { MAX_PLANS_PER_TICK } from './PathfindingManager';

const FIXED_DT = 1 / 60;

function cellCentre(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

function cellOf(unit: Unit): { col: number; row: number } {
    return { col: Math.floor(unit.x / CELL_SIZE), row: Math.floor(unit.y / CELL_SIZE) };
}

function buildEngine(gridW = 24, gridH = 16): GameEngine {
    return buildTinyBattleEngine({ gridW, gridH, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
}

/** An AI-less unit the tests steer purely through walk goals. */
function addWalker(engine: GameEngine, id: string, col: number, row: number, teamId: 'enemy' | 'player' = 'enemy'): Unit {
    const { x, y } = cellCentre(col, row);
    const unit = new Unit({
        id,
        x,
        y,
        hp: 4,
        speed: 90,
        teamId,
        ownerId: 'ai',
        characterId: 'swarmling',
        name: id,
        unitAITreeId: 'static_test_no_ai',
    });
    engine.addUnit(unit, 'initialGameSpawn');
    unit.moveJitter = 0;
    return unit;
}

/** Wall down `col` from the top edge to `lastRow`; the only way past is under its end. */
function addWall(tm: TerrainManager, col: number, lastRow: number): void {
    for (let row = 0; row <= lastRow; row++) tm.grid.set(col, row, TerrainType.Rock);
    tm.clearPathCache();
}

function managerTick(engine: GameEngine): void {
    engine.pathfindingManager.tick(engine.units, engine);
}

/** One simulation step for the units only: occupancy, pathfinding, movement — as UnitManager does. */
function step(engine: GameEngine): void {
    engine.gameTick += 1;
    engine.gameTime += FIXED_DT;
    engine.cellOccupancyManager.rebuild(engine.units);
    managerTick(engine);
    for (const unit of engine.units) updateUnit(unit, FIXED_DT, engine);
}

describe('PathfindingManager', () => {
    it('turns a cell goal into a path on the next manager tick', () => {
        const engine = buildEngine();
        const tm = engine.terrainManager!;
        addWall(tm, 10, 10);
        const unit = addWalker(engine, 'u1', 4, 4);

        unit.setWalkGoal({ kind: 'cell', col: 16, row: 4 });
        expect(unit.movement).toBeNull();
        expect(unit.pathInvalidated).toBe(true);

        managerTick(engine);

        expect(unit.movement).not.toBeNull();
        const path = unit.movement!.path;
        expect(path.length).toBeGreaterThan(1); // has to bend round the wall
        expect(path[path.length - 1]).toEqual({ col: 16, row: 4 });
        expect(unit.movement!.navEpoch).toBe(tm.navEpoch);
        expect(unit.pathInvalidated).toBe(false);
        expect(unit.walkIntent).toEqual({ dest: { col: 16, row: 4 }, managed: true });
        expect(engine.pathfindingManager.lastTickPlanCount).toBe(1);
    });

    it('setting the same goal again is a no-op; a different goal invalidates', () => {
        const engine = buildEngine();
        const unit = addWalker(engine, 'u1', 2, 2);
        unit.setWalkGoal({ kind: 'cell', col: 9, row: 5 });
        managerTick(engine);
        const movement = unit.movement;
        expect(movement).not.toBeNull();

        unit.setWalkGoal({ kind: 'cell', col: 9, row: 5 });
        expect(unit.movement).toBe(movement);
        expect(unit.pathInvalidated).toBe(false);
        managerTick(engine);
        expect(engine.pathfindingManager.lastTickPlanCount).toBe(0);

        unit.setWalkGoal({ kind: 'cell', col: 9, row: 6 });
        expect(unit.movement).toBeNull();
        expect(unit.pathInvalidated).toBe(true);
    });

    it('chasers of one target share a single GoalField and carry the chase fields', () => {
        const engine = buildEngine();
        const tm = engine.terrainManager!;
        addWall(tm, 10, 10);
        const target = addWalker(engine, 'target', 16, 4, 'player');
        const a = addWalker(engine, 'a', 4, 4);
        const b = addWalker(engine, 'b', 3, 7);
        const t = cellOf(target);

        a.setWalkGoal({ kind: 'unit', unitId: target.id, col: t.col, row: t.row, stopRange: 30 });
        b.setWalkGoal({ kind: 'unit', unitId: target.id, col: t.col, row: t.row, stopRange: 30 });
        managerTick(engine);

        expect(tm.pathQuery.goalFieldCount).toBe(1);
        for (const unit of [a, b]) {
            expect(unit.movement).not.toBeNull();
            const path = unit.movement!.path;
            expect(path[path.length - 1]).toEqual(t);
            expect(unit.movement!.targetUnitId).toBe(target.id);
            expect(unit.movement!.stopRange).toBe(30);
            expect(unit.walkIntent!.managed).toBe(true);
        }
    });

    it('re-goals near chasers when the target moves, but lets far chasers lag', () => {
        const engine = buildEngine(60, 12);
        const target = addWalker(engine, 'target', 50, 5, 'player');
        const near = addWalker(engine, 'near', 47, 5);
        const far = addWalker(engine, 'far', 5, 5);
        for (const unit of [near, far]) {
            unit.setWalkGoal({ kind: 'unit', unitId: target.id, col: 50, row: 5 });
        }
        managerTick(engine);
        const nearMovement = near.movement;
        const farMovement = far.movement;
        expect(nearMovement).not.toBeNull();
        expect(farMovement).not.toBeNull();

        // Target moves 3 cells: near is ~6 cells away (threshold 1), far is ~48 away (threshold 6).
        target.x += 3 * CELL_SIZE;
        engine.gameTick += 1;
        managerTick(engine);

        expect(near.walkIntent!.dest).toEqual({ col: 53, row: 5 });
        expect(near.movement).not.toBe(nearMovement);
        expect(near.movement!.path[near.movement!.path.length - 1]).toEqual({ col: 53, row: 5 });

        expect(far.walkIntent!.dest).toEqual({ col: 50, row: 5 });
        expect(far.movement).toBe(farMovement);
    });

    it('falls back to the last known cell when the chase target dies', () => {
        const engine = buildEngine();
        const target = addWalker(engine, 'target', 16, 4, 'player');
        const chaser = addWalker(engine, 'chaser', 4, 4);
        chaser.setWalkGoal({ kind: 'unit', unitId: target.id, col: 16, row: 4, stopRange: 30 });
        managerTick(engine);
        expect(chaser.movement!.targetUnitId).toBe(target.id);

        target.hp = 0;
        engine.gameTick += 1;
        managerTick(engine);

        expect(chaser.walkIntent!.targetUnitId).toBeUndefined();
        expect(chaser.walkIntent!.stopRange).toBeUndefined();
        expect(chaser.walkIntent!.dest).toEqual({ col: 16, row: 4 });
        expect(chaser.movement).not.toBeNull();
        expect(chaser.movement!.targetUnitId).toBeUndefined();
        expect(chaser.movement!.path[chaser.movement!.path.length - 1]).toEqual({ col: 16, row: 4 });
    });

    it('does not re-search an unreachable goal every tick, but retries when terrain changes', () => {
        const engine = buildEngine();
        const tm = engine.terrainManager!;
        // Seal (16,4) inside a ring of rock.
        for (let col = 15; col <= 17; col++) {
            for (let row = 3; row <= 5; row++) {
                if (col !== 16 || row !== 4) tm.grid.set(col, row, TerrainType.Rock);
            }
        }
        tm.clearPathCache();
        // nearestPassable keeps (16,4) itself, which is walled off from the unit.
        const unit = addWalker(engine, 'u1', 4, 4);
        unit.setWalkGoal({ kind: 'cell', col: 16, row: 4 });

        managerTick(engine);
        expect(engine.pathfindingManager.lastTickPlanCount).toBe(1);
        expect(unit.movement).toBeNull();
        expect(unit.pathFailedEpoch).toBe(tm.navEpoch);
        expect(unit.walkIntent).not.toBeNull();
        expect(unit.nextRepathTick).toBeGreaterThan(engine.gameTick);

        for (let i = 0; i < 5; i++) {
            engine.gameTick += 1;
            managerTick(engine);
            expect(engine.pathfindingManager.lastTickPlanCount).toBe(0);
        }

        // Open the ring: the epoch changes, so the very next tick tries again and succeeds.
        tm.grid.set(15, 4, TerrainType.Grass);
        tm.notifyNavChanged(15, 4);
        engine.gameTick += 1;
        managerTick(engine);
        expect(engine.pathfindingManager.lastTickPlanCount).toBe(1);
        expect(unit.movement).not.toBeNull();
        expect(unit.pathFailedEpoch).toBeNull();
    });

    it('retries an unreachable goal once its retry tick comes due', () => {
        const engine = buildEngine();
        const tm = engine.terrainManager!;
        for (let col = 15; col <= 17; col++) {
            for (let row = 3; row <= 5; row++) {
                if (col !== 16 || row !== 4) tm.grid.set(col, row, TerrainType.Rock);
            }
        }
        tm.clearPathCache();
        const unit = addWalker(engine, 'u1', 4, 4);
        unit.setWalkGoal({ kind: 'cell', col: 16, row: 4 });
        managerTick(engine);

        engine.gameTick = unit.nextRepathTick;
        managerTick(engine);
        expect(engine.pathfindingManager.lastTickPlanCount).toBe(1);
        expect(unit.movement).toBeNull();
    });

    it('plans at most MAX_PLANS_PER_TICK per tick and never starves a unit', () => {
        const engine = buildEngine(24, 16);
        const units: Unit[] = [];
        for (let i = 0; i < 60; i++) {
            const unit = addWalker(engine, `u${i}`, i % 10, Math.floor(i / 10));
            unit.setWalkGoal({ kind: 'cell', col: 14 + (i % 9), row: 8 + (i % 7) });
            units.push(unit);
        }
        const planned = () => units.filter((u) => u.movement !== null).length;

        managerTick(engine);
        expect(engine.pathfindingManager.lastTickPlanCount).toBe(MAX_PLANS_PER_TICK);
        expect(planned()).toBe(24);

        engine.gameTick += 1;
        managerTick(engine);
        expect(planned()).toBe(48);

        engine.gameTick += 1;
        managerTick(engine);
        expect(planned()).toBe(60);

        engine.gameTick += 1;
        managerTick(engine);
        expect(engine.pathfindingManager.lastTickPlanCount).toBe(0);
    });

    it('a plain goal for the cell the unit already stands in just clears the intent', () => {
        const engine = buildEngine();
        const unit = addWalker(engine, 'u1', 7, 4);
        unit.setWalkGoal({ kind: 'cell', col: 7, row: 4 });
        managerTick(engine);
        expect(unit.walkIntent).toBeNull();
        expect(unit.movement).toBeNull();
        expect(unit.pathInvalidated).toBe(false);
    });

    it('a pixel goal inside the current cell still gets a one-waypoint path', () => {
        const engine = buildEngine();
        const unit = addWalker(engine, 'u1', 7, 4);
        const targetPixel = { x: 7 * CELL_SIZE + 33, y: 4 * CELL_SIZE + 6 };
        unit.setWalkGoal({ kind: 'cell', col: 7, row: 4, targetPixel });
        managerTick(engine);
        expect(unit.movement!.path).toEqual([{ col: 7, row: 4 }]);
        expect(unit.movement!.targetPixel).toEqual(targetPixel);

        for (let i = 0; i < 120 && unit.movement; i++) step(engine);
        expect(unit.movement).toBeNull();
        expect(Math.hypot(unit.x - targetPixel.x, unit.y - targetPixel.y)).toBeLessThanOrEqual(1);
    });

    it('re-plans from the new position after a forced displacement', () => {
        const engine = buildEngine();
        addWall(engine.terrainManager!, 10, 10);
        const unit = addWalker(engine, 'u1', 4, 4);
        unit.setWalkGoal({ kind: 'cell', col: 16, row: 4 });
        managerTick(engine);
        expect(unit.movement!.path.length).toBeGreaterThan(1);

        // Knocked clean over the wall: the goal is now in plain sight.
        unit.invalidateMovementPath();
        const landed = cellCentre(13, 4);
        unit.x = landed.x;
        unit.y = landed.y;
        engine.gameTick += 1;
        managerTick(engine);

        expect(unit.movement!.path).toEqual([{ col: 16, row: 4 }]);
        expect(unit.walkIntent!.dest).toEqual({ col: 16, row: 4 });
    });

    it('end to end: a unit walks round a wall to its goal and the intent clears on arrival', () => {
        const engine = buildEngine();
        addWall(engine.terrainManager!, 10, 10);
        const unit = addWalker(engine, 'u1', 4, 4);
        unit.setWalkGoal({ kind: 'cell', col: 16, row: 4 });

        let ticks = 0;
        while (unit.walkIntent !== null && ticks < 2000) {
            step(engine);
            ticks++;
            // Never inside rock on the way.
            expect(engine.terrainManager!.nav.isPassable('enemy', cellOf(unit).col, cellOf(unit).row)).toBe(true);
        }

        expect(unit.walkIntent).toBeNull();
        expect(unit.movement).toBeNull();
        expect(cellOf(unit)).toEqual({ col: 16, row: 4 });
    });

    it('end to end: a chaser stops at its stop range from a target behind a wall', () => {
        const engine = buildEngine();
        addWall(engine.terrainManager!, 10, 10);
        const target = addWalker(engine, 'target', 16, 4, 'player');
        const chaser = addWalker(engine, 'chaser', 4, 4);
        chaser.setWalkGoal({ kind: 'unit', unitId: target.id, col: 16, row: 4, stopRange: 50 });

        let ticks = 0;
        while (chaser.walkIntent !== null && ticks < 2000) {
            step(engine);
            ticks++;
        }

        expect(chaser.walkIntent).toBeNull();
        const dist = Math.hypot(chaser.x - target.x, chaser.y - target.y);
        expect(dist).toBeLessThanOrEqual(50);
        expect(dist).toBeGreaterThan(40);
    });

    it('scheduling state and the managed flag survive serialization', () => {
        const engine = buildEngine();
        const unit = addWalker(engine, 'u1', 4, 4);
        unit.setWalkGoal({ kind: 'unit', unitId: 'someone', col: 9, row: 9, stopRange: 25 });
        unit.nextRepathTick = 123;
        unit.pathFailedEpoch = 7;

        const restored = Unit.fromJSON(JSON.parse(JSON.stringify(unit.toJSON(0))), engine.eventBus, 0);
        expect(restored.walkIntent).toEqual({
            dest: { col: 9, row: 9 },
            targetUnitId: 'someone',
            managed: true,
            stopRange: 25,
        });
        expect(restored.nextRepathTick).toBe(123);
        expect(restored.pathFailedEpoch).toBe(7);
        expect(restored.pathInvalidated).toBe(true);
    });

    it('determinism: an engine restored from a mid-run checkpoint (cold caches) stays identical', () => {
        const GRID_W = 30;
        const GRID_H = 16;
        const wallCells: [number, number][] = [];
        for (let row = 0; row <= 10; row++) wallCells.push([12, row]);
        for (let row = 5; row < GRID_H; row++) wallCells.push([20, row]);

        const engine = buildEngine(GRID_W, GRID_H);
        const tm = engine.terrainManager!;
        for (const [col, row] of wallCells) tm.grid.set(col, row, TerrainType.Rock);
        tm.clearPathCache();

        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: cellCentre(25, 3).x,
            y: cellCentre(25, 3).y,
            abilities: [],
        });
        player.unitAITreeId = 'static_test_no_ai';
        // Keep the real-time sim running for the whole test.
        engine.state.orderMgr.applyOrder({ unitId: player.id, abilityId: 'wait', targets: [] });
        for (let tick = 60; tick <= 1200; tick += 60) {
            engine.state.orderMgr.queueOrder(tick, { unitId: player.id, abilityId: 'wait', targets: [] });
        }

        const walkers: Unit[] = [];
        for (let i = 0; i < 14; i++) {
            const walker = addWalker(engine, `w${i}`, 1 + (i % 5), 2 + Math.floor(i / 5) * 4);
            walker.moveJitter = (i * 37 % 100) / 100;
            if (i % 3 === 0) {
                walker.setWalkGoal({ kind: 'cell', col: 27, row: 13 - (i % 4) });
            } else if (i === 7) {
                walker.setWalkGoal({ kind: 'cell', col: 12, row: 3 }); // inside the wall: snaps to a neighbour
            } else {
                walker.setWalkGoal({ kind: 'unit', unitId: player.id, col: 25, row: 3, stopRange: 40 });
            }
            walkers.push(walker);
        }

        engine.stepSimulationFixedTicks(45);
        expect(engine.gameTick).toBe(45);
        // The run is really exercising the manager: units are mid-route.
        expect(walkers.filter((w) => w.movement !== null).length).toBeGreaterThan(8);

        const snapshot = JSON.parse(JSON.stringify(engine.toJSON()));

        // A brand-new terrain manager: no NavGrid, no memo, no goal fields.
        const restoredGrid = new TerrainGrid(GRID_W, GRID_H, CELL_SIZE, TerrainType.Grass);
        for (const [col, row] of wallCells) restoredGrid.set(col, row, TerrainType.Rock);
        const restored = GameEngine.fromJSON(snapshot, TINY_BATTLE_PLAYER_ID, new TerrainManager(restoredGrid));
        expect(restored.terrainManager!.navEpoch).toBe(tm.navEpoch);

        // Change terrain identically on both halfway through, so validation/replanning runs too.
        const compare = (label: string) => {
            expect(restored.gameTick, label).toBe(engine.gameTick);
            expect(restored.units.length, label).toBe(engine.units.length);
            for (const a of engine.units) {
                const b = restored.getUnit(a.id)!;
                expect(b, `${label} ${a.id}`).toBeDefined();
                expect(b.x, `${label} ${a.id} x`).toBe(a.x);
                expect(b.y, `${label} ${a.id} y`).toBe(a.y);
                expect(b.walkIntent, `${label} ${a.id} intent`).toEqual(a.walkIntent);
                expect(b.movement?.path ?? null, `${label} ${a.id} path`).toEqual(a.movement?.path ?? null);
                expect(b.nextRepathTick, `${label} ${a.id} nextRepathTick`).toBe(a.nextRepathTick);
                expect(b.pathFailedEpoch, `${label} ${a.id} pathFailedEpoch`).toBe(a.pathFailedEpoch);
            }
        };

        for (let i = 0; i < 60; i++) {
            engine.stepSimulationFixedTicks(1);
            restored.stepSimulationFixedTicks(1);
        }
        compare('after 60');

        engine.terrainManager!.createOrMarkRock(16, 12);
        restored.terrainManager!.createOrMarkRock(16, 12);

        for (let i = 0; i < 700; i++) {
            engine.stepSimulationFixedTicks(1);
            restored.stepSimulationFixedTicks(1);
            if (i === 20 || i === 300) compare(`after rock +${i}`);
        }
        compare('at end');
        // And they really went somewhere.
        expect(walkers.filter((w) => cellOf(w).col > 12).length).toBeGreaterThan(8);

        restored.destroy();
        engine.destroy();
    });
});
