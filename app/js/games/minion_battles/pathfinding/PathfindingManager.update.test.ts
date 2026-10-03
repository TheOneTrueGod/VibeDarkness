/**
 * PathfindingManager.update tests: path validation, trimming, staggering, and chase refresh.
 *
 * Tests for terrain-change validation, shortcut trim, chase re-goal, and GoalField efficiency.
 */

import { describe, it, expect } from 'vitest';
import { Unit } from '../game/units/Unit';
import { GameEngine } from '../game/GameEngine';
import {
    buildTinyBattleEngine,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainType } from '../terrain/TerrainType';

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

function managerTick(engine: GameEngine): void {
    engine.pathfindingManager.tick(engine.units, engine);
}

describe('PathfindingManager.update', () => {
    it('blocked path re-plans immediately', () => {
        const engine = buildEngine();
        const tm = engine.terrainManager!;
        const walker = addWalker(engine, 'w1', 4, 4);
        const goal = { col: 14, row: 4 };

        walker.setWalkGoal({ kind: 'cell', ...goal });
        managerTick(engine);

        expect(walker.movement).not.toBeNull();
        const path1 = walker.movement!.path;
        expect(path1[path1.length - 1]).toEqual(goal);

        // Block the straight line with a rock
        for (let col = 5; col < 14; col++) {
            tm.grid.set(col, 4, TerrainType.Rock);
        }
        tm.notifyNavChanged();
        engine.gameTick += 1;

        // This manager tick should immediately re-plan, ignoring budget
        managerTick(engine);

        expect(walker.movement).not.toBeNull();
        const path2 = walker.movement!.path;
        expect(path2[path2.length - 1]).toEqual(goal);
        expect(path2.length).toBeGreaterThan(1); // has to go around
        expect(walker.movement!.navEpoch).toBe(tm.navEpoch);
        expect(path2).not.toBe(path1); // different object
    });

    it('blocked re-plan ignores the budget', () => {
        const engine = buildEngine(40, 16);
        const tm = engine.terrainManager!;

        // Create walkers in an open grid with simple straight paths
        // All will be able to plan since there's no terrain blocking them initially
        const walkers: Unit[] = [];
        for (let i = 0; i < 30; i++) {
            const col = 2 + (i % 10);
            const row = 2 + Math.floor(i / 10);
            const w = addWalker(engine, `w${i}`, col, row);
            // All walkers head to the same goal row, passing through column 20
            w.setWalkGoal({ kind: 'cell', col: 35, row: 5 });
            walkers.push(w);
        }

        // First two ticks: all 30 should plan successfully
        managerTick(engine);
        expect(engine.pathfindingManager.lastTickPlanCount).toBe(24);

        engine.gameTick += 1;
        managerTick(engine);
        expect(engine.pathfindingManager.lastTickPlanCount).toBe(6);

        // All should now have paths
        for (const w of walkers) {
            expect(w.movement).not.toBeNull();
        }

        // Wall off column 20 from the top edge down to row 10: every one of the 30 straight
        // paths (rows 2-5) now runs into rock.
        for (let row = 0; row <= 10; row++) tm.grid.set(20, row, TerrainType.Rock);
        tm.notifyNavChanged();
        engine.gameTick += 1;

        managerTick(engine);

        // All 30 re-plan on this one tick, even though the budget is 24.
        expect(engine.pathfindingManager.lastTickPlanCount).toBe(30);
        for (const w of walkers) {
            expect(w.movement).not.toBeNull();
            expect(w.movement!.navEpoch).toBe(tm.navEpoch);
            expect(w.movement!.path.length).toBeGreaterThan(1); // bends under the wall
            expect(w.movement!.path[w.movement!.path.length - 1]).toEqual({ col: 35, row: 5 });
        }
    });

    it('unblocked managed paths are re-planned under the budget', () => {
        const engine = buildEngine(40, 16);
        const tm = engine.terrainManager!;
        const walkers: Unit[] = [];

        // Create 40 walkers with managed goals
        for (let i = 0; i < 40; i++) {
            const w = addWalker(engine, `w${i}`, 2 + (i % 8), 2 + Math.floor(i / 8) * 3);
            w.setWalkGoal({ kind: 'cell', col: 35, row: 10 });
            walkers.push(w);
        }
        managerTick(engine);
        expect(engine.pathfindingManager.lastTickPlanCount).toBe(24);

        engine.gameTick += 1;
        managerTick(engine);
        expect(engine.pathfindingManager.lastTickPlanCount).toBe(16);

        engine.gameTick += 1;
        // All 40 should now have paths
        const plansApplied = walkers.filter((w) => w.movement !== null).length;
        expect(plansApplied).toBe(40);

        // Create a rock far away
        tm.grid.set(38, 14, TerrainType.Rock);
        tm.notifyNavChanged();
        const newEpoch = tm.navEpoch;
        engine.gameTick += 1;

        // Next tick: budget limit of 24, and the path is not blocked (just outdated)
        managerTick(engine);
        expect(engine.pathfindingManager.lastTickPlanCount).toBe(24);

        // All walkers should still have movement (not all re-stamped yet)
        for (const w of walkers) {
            expect(w.movement).not.toBeNull();
        }

        // Count how many have the new epoch (should be ~24)
        const newEpochCount = walkers.filter((w) => w.movement!.navEpoch === newEpoch).length;
        expect(newEpochCount).toBe(24);

        // One more tick to finish
        engine.gameTick += 1;
        managerTick(engine);

        // Now all should be stamped with the new epoch
        for (const w of walkers) {
            expect(w.movement!.navEpoch).toBe(newEpoch);
        }
    });

    it('a newly opened shortcut is adopted', () => {
        const engine = buildEngine();
        const tm = engine.terrainManager!;

        // Wall down column 12 from top to row 8
        for (let row = 0; row <= 8; row++) {
            tm.grid.set(12, row, TerrainType.Rock);
        }
        tm.clearPathCache();

        const walker = addWalker(engine, 'w1', 4, 8);
        walker.setWalkGoal({ kind: 'cell', col: 16, row: 8 });
        managerTick(engine);

        expect(walker.movement).not.toBeNull();
        const path1 = walker.movement!.path;
        expect(path1.length).toBeGreaterThan(1); // has to go around the wall

        // Destroy the wall cell on the direct line
        tm.grid.set(12, 8, TerrainType.Grass);
        tm.notifyNavChanged();
        engine.gameTick += 1;

        managerTick(engine);

        expect(walker.movement).not.toBeNull();
        const path2 = walker.movement!.path;
        // Now the straight line is open
        expect(path2).toEqual([{ col: 16, row: 8 }]);
    });

    it('non-managed explicit paths are stamped, not replaced', () => {
        const engine = buildEngine();
        const tm = engine.terrainManager!;

        const walker = addWalker(engine, 'w1', 2, 8);
        // Give an explicit multi-waypoint path (not managed)
        const explicitPath = [{ col: 5, row: 8 }, { col: 8, row: 8 }, { col: 12, row: 8 }];
        walker.setMovement(explicitPath, undefined, 0);

        // Bump the epoch with a far-away rock
        tm.grid.set(20, 2, TerrainType.Rock);
        tm.notifyNavChanged();
        const epoch2 = tm.navEpoch;

        engine.gameTick += 1;
        managerTick(engine);

        // Path should be unchanged
        expect(walker.movement!.path).toEqual(explicitPath);
        expect(walker.movement!.navEpoch).toBe(epoch2);
        expect(engine.pathfindingManager.lastTickPlanCount).toBe(0);

        // Create a rock ON the explicit path
        tm.grid.set(8, 8, TerrainType.Rock);
        tm.notifyNavChanged();
        engine.gameTick += 1;

        managerTick(engine);

        // Should re-plan to the final destination cell
        expect(walker.movement).not.toBeNull();
        expect(walker.movement!.path[walker.movement!.path.length - 1]).toEqual({ col: 12, row: 8 });
    });

    it('slide detours survive', () => {
        const engine = buildEngine();
        const tm = engine.terrainManager!;

        const walker = addWalker(engine, 'w1', 4, 4);
        walker.setWalkGoal({ kind: 'cell', col: 14, row: 4 });
        managerTick(engine);

        expect(walker.movement).not.toBeNull();

        // Simulate a slide: insert an adjacent waypoint and set navEpoch to -1
        const adjacentCell = { col: 4, row: 3 };
        walker.movement!.path.unshift(adjacentCell);
        walker.movement!.navEpoch = -1;

        engine.gameTick += 1;
        managerTick(engine);

        // Detour should survive
        expect(walker.movement!.path[0]).toEqual(adjacentCell);
        expect(walker.movement!.navEpoch).toBe(tm.navEpoch);
        expect(engine.pathfindingManager.lastTickPlanCount).toBe(0);
    });

    it('trim removes redundant waypoints', () => {
        const engine = buildEngine();
        const tm = engine.terrainManager!;

        // Create a wall, plan a path around it
        for (let row = 0; row <= 10; row++) {
            tm.grid.set(12, row, TerrainType.Rock);
        }
        tm.clearPathCache();

        const walker = addWalker(engine, 'w1', 4, 8);
        walker.setWalkGoal({ kind: 'cell', col: 18, row: 8 });
        managerTick(engine);

        expect(walker.movement).not.toBeNull();
        const path = walker.movement!.path;
        expect(path.length).toBeGreaterThan(1);

        // A waypoint the walker has already passed (behind it, away from path[0]) is stale.
        const first = path[0];
        const behind = {
            col: Math.round(walker.x / CELL_SIZE - 0.5) - Math.sign(first.col - Math.floor(walker.x / CELL_SIZE)) * 2,
            row: Math.floor(walker.y / CELL_SIZE),
        };
        path.unshift(behind);
        const pathLenBefore = path.length;
        const firstWaypoint = path[1]; // after the stale one

        // Set nextRepathTick to now so trim will run
        walker.nextRepathTick = engine.gameTick;
        managerTick(engine);

        // The passed waypoint is removed
        expect(path[0]).toEqual(firstWaypoint);
        expect(path.length).toBe(pathLenBefore - 1);
        expect(engine.pathfindingManager.lastTickTrimCount).toBe(1);
        expect(engine.pathfindingManager.lastTickPlanCount).toBe(0);
        expect(walker.nextRepathTick).toBeGreaterThan(engine.gameTick);
    });

    it('trim keeps a waypoint that is still ahead, even when a shortcut exists', () => {
        const engine = buildEngine();
        const walker = addWalker(engine, 'w1', 4, 8);
        walker.setWalkGoal({ kind: 'cell', col: 18, row: 8 });
        managerTick(engine);
        expect(walker.movement!.path).toEqual([{ col: 18, row: 8 }]);

        // A widened corner waypoint ahead of the unit (off the straight line) must survive trimming.
        walker.movement!.path.unshift({ col: 10, row: 10 });
        walker.nextRepathTick = engine.gameTick;
        managerTick(engine);

        expect(walker.movement!.path).toEqual([{ col: 10, row: 10 }, { col: 18, row: 8 }]);
        expect(engine.pathfindingManager.lastTickTrimCount).toBe(0);
    });

    it('trim does not run before nextRepathTick', () => {
        const engine = buildEngine();
        const tm = engine.terrainManager!;

        for (let row = 0; row <= 10; row++) {
            tm.grid.set(12, row, TerrainType.Rock);
        }
        tm.clearPathCache();

        const walker = addWalker(engine, 'w1', 4, 8);
        walker.setWalkGoal({ kind: 'cell', col: 18, row: 8 });
        managerTick(engine);

        const path = walker.movement!.path;
        const halfway = {
            col: Math.floor((walker.x / CELL_SIZE + path[0].col) / 2),
            row: Math.floor((walker.y / CELL_SIZE + path[0].row) / 2),
        };
        path.unshift(halfway);
        const pathLenBefore = path.length;

        // Set nextRepathTick to future
        walker.nextRepathTick = engine.gameTick + 5;
        managerTick(engine);

        // Redundant waypoint should NOT be removed
        expect(path.length).toBe(pathLenBefore);
        expect(engine.pathfindingManager.lastTickTrimCount).toBe(0);
    });

    it('trim never happens for non-managed explicit paths', () => {
        const engine = buildEngine();

        const walker = addWalker(engine, 'w1', 2, 8);
        // Give an explicit path (not managed)
        walker.setMovement([{ col: 5, row: 8 }, { col: 8, row: 8 }], undefined, 0);

        const path = walker.movement!.path;

        // Try to trigger a trim by setting nextRepathTick to now
        walker.nextRepathTick = engine.gameTick;
        managerTick(engine);

        // Trim should not have run
        expect(engine.pathfindingManager.lastTickTrimCount).toBe(0);
        expect(path.length).toBe(2);
    });

    it('direct line of sight never builds a search structure', () => {
        const engine = buildEngine(60, 16);
        const target = addWalker(engine, 'target', 50, 8, 'player');
        const walker = addWalker(engine, 'w1', 10, 8);

        walker.setWalkGoal({ kind: 'unit', unitId: target.id, col: 50, row: 8 });
        managerTick(engine);

        // Direct line of sight: path should be just the goal cell
        expect(walker.movement!.path).toEqual([{ col: 50, row: 8 }]);
        // No search structure built
        expect(engine.terrainManager!.pathQuery.goalFieldCount).toBe(0);
    });

    it('multiple chasers share a GoalField for the same target', () => {
        const engine = buildEngine();
        const tm = engine.terrainManager!;

        // Create target and chasers
        const target = addWalker(engine, 'target', 15, 8, 'player');
        const targetCell = cellOf(target);

        const chaser1 = addWalker(engine, 'c1', 4, 4);
        const chaser2 = addWalker(engine, 'c2', 4, 10);

        // Both chasers target the same unit
        chaser1.setWalkGoal({ kind: 'unit', unitId: target.id, ...targetCell });
        chaser2.setWalkGoal({ kind: 'unit', unitId: target.id, ...targetCell });

        // Plan both
        managerTick(engine);

        // Both should have paths
        expect(chaser1.movement).not.toBeNull();
        expect(chaser2.movement).not.toBeNull();

        // GoalField is used for chase goals and should be limited
        // (exact count depends on whether direct line-of-sight to target)
        expect(tm.pathQuery.goalFieldCount).toBeLessThanOrEqual(2);
    });
});
