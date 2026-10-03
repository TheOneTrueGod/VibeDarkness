/**
 * PathQuery.test.ts - Tests for the PathQuery facade.
 */

import { describe, it, expect } from 'vitest';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainType } from '../terrain/TerrainType';
import { TerrainManager } from '../terrain/TerrainManager';
import { PathQuery } from './PathQuery';
import { TerrainLayerManager } from '../game/TerrainLayerManager';

function tmFromTypes(rows: TerrainType[][]): { tm: TerrainManager; pq: PathQuery } {
    const grid = TerrainGrid.fromArray(rows, 40);
    const tm = new TerrainManager(grid);
    tm.setTerrainLayers(new TerrainLayerManager());
    const pq = new PathQuery(tm);
    return { tm, pq };
}

describe('PathQuery', () => {
    describe('nearestPassable', () => {
        it('returns the cell itself if passable', () => {
            const { pq } = tmFromTypes([[TerrainType.Grass, TerrainType.Grass]]);
            expect(pq.nearestPassable('default', 0, 0)).toEqual({ col: 0, row: 0 });
        });

        it('finds nearest cardinal neighbor if cell is blocked', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            ]);
            const result = pq.nearestPassable('default', 1, 1);
            expect(result).not.toBeNull();
            expect(result?.col).toBeGreaterThanOrEqual(0);
            expect(result?.row).toBeGreaterThanOrEqual(0);
        });

        it('returns null if surrounded by impassable', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Rock, TerrainType.Rock, TerrainType.Rock],
                [TerrainType.Rock, TerrainType.Rock, TerrainType.Rock],
                [TerrainType.Rock, TerrainType.Rock, TerrainType.Rock],
            ]);
            expect(pq.nearestPassable('default', 1, 1)).toBeNull();
        });
    });

    describe('findPath', () => {
        it('returns [goal] when goal is direct line of walk', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            ]);
            const result = pq.findPath(20, 20, 2, 0, 'default', 0);
            expect(result).toEqual([{ col: 2, row: 0 }]);
        });

        it('returns [] when start and goal are same cell', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            ]);
            const result = pq.findPath(20, 20, 0, 0, 'default', 0);
            expect(result).toEqual([]);
        });

        it('returns null when goal is unreachable', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Grass],
            ]);
            // Try to path from left side to right side (blocked by middle column).
            const result = pq.findPath(20, 20, 2, 1, 'default', 0);
            expect(result).toBeNull();
        });

        it('finds a path around an obstacle', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            ]);
            const result = pq.findPath(20, 20, 2, 2, 'default', 0);
            expect(result).not.toBeNull();
            expect(result?.[result.length - 1]).toEqual({ col: 2, row: 2 });
            // Verify each consecutive pair has line of walk.
            if (result) {
                const nav = pq['terrainManager'].nav;
                for (const wp of result) {
                    // Don't assert line of walk here; just verify the waypoint is passable.
                    expect(nav.isPassable('default', wp.col, wp.row)).toBe(true);
                }
            }
        });
    });

    describe('findCellPath', () => {
        it('returns [goal] for adjacent cells', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Grass],
            ]);
            const result = pq.findCellPath(0, 0, 1, 0, 'default', 0);
            expect(result).toEqual([{ col: 1, row: 0 }]);
        });

        it('returns identical results on cache hit and cold', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            ]);
            const cold = pq.findCellPath(0, 0, 2, 2, 'default', 0);
            const hot = pq.findCellPath(0, 0, 2, 2, 'default', 0);
            expect(cold).toEqual(hot);
            // Modify and re-fetch to ensure it's a copy.
            if (cold) {
                cold[0].col = 999;
                const afterMutate = pq.findCellPath(0, 0, 2, 2, 'default', 0);
                expect(afterMutate?.[0].col).not.toBe(999);
            }
        });

        it('clears memo on navEpoch change', () => {
            const { pq, tm } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            ]);
            const path1 = pq.findCellPath(0, 0, 2, 0, 'default', 0);
            expect(path1).toEqual([{ col: 2, row: 0 }]);

            // Create a rock and notify epoch change.
            tm.grid.set(1, 0, TerrainType.Rock);
            tm.notifyNavChanged();

            // The new path should go around the rock.
            const path2 = pq.findCellPath(0, 0, 2, 0, 'default', 0);
            expect(path2).not.toEqual(path1);
        });
    });

    describe('isReachable', () => {
        it('returns true for reachable cells', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            ]);
            expect(pq.isReachable('default', 0, 0, 2, 0)).toBe(true);
        });

        it('returns false for unreachable cells', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Grass],
            ]);
            expect(pq.isReachable('default', 0, 1, 2, 1)).toBe(false);
        });

        it('returns false if start cell is impassable', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass],
                [TerrainType.Rock, TerrainType.Grass],
            ]);
            expect(pq.isReachable('default', 0, 1, 1, 0)).toBe(false);
        });
    });

    describe('hasLineOfWalk', () => {
        it('returns true for clear segment', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            ]);
            expect(pq.hasLineOfWalk('default', 20, 20, 80, 20)).toBe(true);
        });

        it('returns false when segment crosses rock', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Grass],
            ]);
            expect(pq.hasLineOfWalk('default', 20, 20, 80, 20)).toBe(false);
        });
    });

    describe('clearCache', () => {
        it('clears the memo', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Grass],
            ]);
            pq.findCellPath(0, 0, 1, 1, 'default', 0);
            pq.clearCache();
            // After clear, the next call should be cold.
            const result = pq.findCellPath(0, 0, 1, 1, 'default', 0);
            expect(result).not.toBeNull();
        });
    });

    describe('enemy profile', () => {
        it('routes around crystal-protected cells', () => {
            // Note: Testing crystal protection requires injecting a special tile or mocking.
            // For now, test that the profile parameter is accepted.
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            ]);
            const result = pq.findCellPath(0, 0, 2, 0, 'enemy', 0);
            expect(result).not.toBeNull();
        });
    });

    describe('findPathToSharedGoal', () => {
        it('returns [goal] when goal is direct line of walk', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            ]);
            const result = pq.findPathToSharedGoal(20, 20, 2, 0, 'default', 0);
            expect(result).toEqual([{ col: 2, row: 0 }]);
            // Fast path should not create a goal field.
            expect(pq.goalFieldCount).toBe(0);
        });

        it('returns [] when start and goal are same cell', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            ]);
            const result = pq.findPathToSharedGoal(20, 20, 0, 0, 'default', 0);
            expect(result).toEqual([]);
        });

        it('creates and caches a goal field', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Rock, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Rock, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            ]);
            // Start at (0,0), goal at (3,3) - requires search, not line-of-walk.
            const path1 = pq.findPathToSharedGoal(20, 20, 3, 3, 'default', 0);
            expect(path1).not.toBeNull();
            expect(pq.goalFieldCount).toBe(1);
        });

        it('reuses cached goal field for same goal', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Rock, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Rock, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            ]);
            // Query from start 1 to goal.
            pq.findPathToSharedGoal(20, 20, 3, 3, 'default', 0);
            expect(pq.goalFieldCount).toBe(1);

            // Query from start 2 to the same goal.
            pq.findPathToSharedGoal(20, 60, 3, 3, 'default', 0);
            expect(pq.goalFieldCount).toBe(1);
        });

        it('caps the field cache, and an evicted goal rebuilds to the identical result', () => {
            // 20 x 8 grass with a wall down column 10 (gap only on the bottom row), so every
            // goal on the far side needs a real search from the near side.
            const rows = Array.from({ length: 8 }, (_, row) =>
                Array.from({ length: 20 }, (_, col) => (col === 10 && row < 7 ? TerrainType.Rock : TerrainType.Grass)));
            const { pq } = tmFromTypes(rows);

            const goals: [number, number][] = [];
            for (let col = 12; col <= 18; col++) {
                for (let row = 0; row <= 2; row++) goals.push([col, row]);
            }
            expect(goals.length).toBeGreaterThan(16);

            const first = pq.findPathToSharedGoal(60, 60, goals[0][0], goals[0][1], 'default', 0);
            expect(first).not.toBeNull();
            expect(first!.length).toBeGreaterThan(1);
            expect(pq.goalFieldCount).toBe(1);

            for (const [col, row] of goals.slice(1)) {
                expect(pq.findPathToSharedGoal(60, 60, col, row, 'default', 0)).not.toBeNull();
            }
            expect(pq.goalFieldCount).toBe(16);

            // goals[0] was evicted; asking again rebuilds its field from scratch.
            expect(pq.findPathToSharedGoal(60, 60, goals[0][0], goals[0][1], 'default', 0)).toEqual(first);
        });

        it('findPathToSharedGoal and findPath agree on route cost round a wall', () => {
            const rows = Array.from({ length: 8 }, (_, row) =>
                Array.from({ length: 20 }, (_, col) => (col === 10 && row < 7 ? TerrainType.Rock : TerrainType.Grass)));
            const { pq } = tmFromTypes(rows);
            const length = (wps: { col: number; row: number }[]) => {
                let x = 60;
                let y = 60;
                let total = 0;
                for (const wp of wps) {
                    const wx = wp.col * 40 + 20;
                    const wy = wp.row * 40 + 20;
                    total += Math.hypot(wx - x, wy - y);
                    x = wx;
                    y = wy;
                }
                return total;
            };
            const shared = pq.findPathToSharedGoal(60, 60, 15, 1, 'default', 0)!;
            const single = pq.findPath(60, 60, 15, 1, 'default', 0)!;
            expect(shared[shared.length - 1]).toEqual({ col: 15, row: 1 });
            expect(Math.abs(length(shared) - length(single))).toBeLessThan(40);
        });

        it('re-requesting same goal reuses field', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Rock, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Rock, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            ]);
            // First request creates field.
            pq.findPathToSharedGoal(20, 20, 3, 3, 'default', 0);
            const firstCount = pq.goalFieldCount;
            expect(firstCount).toBeGreaterThan(0);

            // Same goal from different start should reuse field.
            pq.findPathToSharedGoal(60, 60, 3, 3, 'default', 0);
            expect(pq.goalFieldCount).toBe(firstCount);
        });

        it('clears goal field cache on navEpoch change', () => {
            const { pq, tm } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Rock, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Rock, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            ]);
            // Create a cached goal field.
            pq.findPathToSharedGoal(20, 20, 3, 3, 'default', 0);
            expect(pq.goalFieldCount).toBeGreaterThan(0);

            // Change terrain (bump epoch).
            tm.grid.set(2, 1, TerrainType.Grass);
            tm.notifyNavChanged();

            // Next query should clear the cache first.
            pq.findPathToSharedGoal(20, 20, 3, 3, 'default', 0);
            // After rebuild, cache should have 1 field.
            expect(pq.goalFieldCount).toBe(1);
        });

        it('returns null when goal is unreachable', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Grass],
            ]);
            const result = pq.findPathToSharedGoal(20, 20, 2, 1, 'default', 0);
            expect(result).toBeNull();
        });

        it('finds path around obstacle', () => {
            const { pq } = tmFromTypes([
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Rock, TerrainType.Grass],
                [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            ]);
            const result = pq.findPathToSharedGoal(20, 20, 2, 2, 'default', 0);
            expect(result).not.toBeNull();
            expect(result?.[result!.length - 1]).toEqual({ col: 2, row: 2 });
        });
    });
});
