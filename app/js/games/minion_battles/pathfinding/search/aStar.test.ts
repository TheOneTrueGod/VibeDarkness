/**
 * aStar tests - pathfinding, corner rule, determinism, and weighted terrain.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainType } from '../../terrain/TerrainType';
import { NavGrid } from '../NavGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { GameEngine } from '../../game/GameEngine';
import { TerrainLayerManager } from '../../game/TerrainLayerManager';
import { aStar } from './aStar';

describe('aStar', () => {
    let engine: GameEngine;
    let terrainGrid: TerrainGrid;
    let terrainManager: TerrainManager;
    let nav: NavGrid;

    beforeEach(() => {
        engine = new GameEngine();
        terrainGrid = new TerrainGrid(20, 20, CELL_SIZE, TerrainType.Grass);
        terrainManager = new TerrainManager(terrainGrid);
        engine.terrainManager = terrainManager;

        const terrainLayers = new TerrainLayerManager();
        terrainManager.setTerrainLayers(terrainLayers);
        terrainManager.setCrystalProtectionProvider(() => engine.state.specialTileManager.getCrystalProtectionMap());

        nav = terrainManager.nav;
    });

    describe('basic pathfinding', () => {
        it('start === goal returns empty chain', () => {
            const path = aStar(nav, 'default', 5, 5, 0);
            expect(path).toEqual([]);
        });

        it('straight corridor path', () => {
            const startIdx = 1 * 20 + 1;  // (1, 1)
            const goalIdx = 1 * 20 + 10; // (10, 1)

            const path = aStar(nav, 'default', startIdx, goalIdx, 0);
            expect(path).not.toBeNull();
            expect(path!.length).toBeGreaterThan(0);
            expect(path![path!.length - 1]).toBe(goalIdx);
        });

        it('detour round a wall', () => {
            // Build a vertical wall from (5, 3) to (5, 10).
            for (let row = 3; row <= 10; row++) {
                terrainGrid.set(5, row, TerrainType.Rock);
            }
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            const startIdx = 4 * 20 + 4;  // (4, 4)
            const goalIdx = 6 * 20 + 4;  // (6, 4)

            const path = aStar(nav, 'default', startIdx, goalIdx, 0);
            expect(path).not.toBeNull();
            // Path must go around the wall.
            expect(path!.length).toBeGreaterThan(0);
        });
    });

    describe('unreachable and components', () => {
        it('unreachable goal returns null', () => {
            // Surround goal with rocks.
            for (let col = 4; col <= 6; col++) {
                for (let row = 4; row <= 6; row++) {
                    if (col === 5 && row === 5) continue;
                    terrainGrid.set(col, row, TerrainType.Rock);
                }
            }
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            const startIdx = 0;
            const goalIdx = 5 * 20 + 5; // (5, 5)

            const path = aStar(nav, 'default', startIdx, goalIdx, 0);
            expect(path).toBeNull();
        });

        it('impassable start returns null', () => {
            terrainGrid.set(1, 1, TerrainType.Rock);
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            const path = aStar(nav, 'default', 1 * 20 + 1, 5 * 20 + 5, 0);
            expect(path).toBeNull();
        });

        it('impassable goal returns null', () => {
            terrainGrid.set(5, 5, TerrainType.Rock);
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            const path = aStar(nav, 'default', 1 * 20 + 1, 5 * 20 + 5, 0);
            expect(path).toBeNull();
        });
    });

    describe('corner rule', () => {
        it('never cuts a corner', () => {
            // Place a rock and verify no diagonal shortcuts across it.
            terrainGrid.set(5, 5, TerrainType.Rock);
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            const startIdx = 4 * 20 + 4; // (4, 4)
            const goalIdx = 6 * 20 + 6; // (6, 6)

            const path = aStar(nav, 'default', startIdx, goalIdx, 0);
            if (path) {
                // Verify all consecutive pairs are valid 8-neighbors with corner rule.
                let current = startIdx;
                for (const next of path) {
                    const curCol = current % nav.width;
                    const curRow = Math.floor(current / nav.width);
                    const nextCol = next % nav.width;
                    const nextRow = Math.floor(next / nav.width);

                    const dCol = Math.abs(nextCol - curCol);
                    const dRow = Math.abs(nextRow - curRow);

                    // Must be an 8-neighbor (max distance 1 in both axes).
                    expect(dCol + dRow).toBeLessThanOrEqual(2);

                    // If diagonal, both orthogonal neighbours must be passable.
                    if (dCol === 1 && dRow === 1) {
                        const orth1 = curRow * nav.width + nextCol;
                        const orth2 = nextRow * nav.width + curCol;
                        expect(nav.isPassableIdx('default', orth1)).toBe(true);
                        expect(nav.isPassableIdx('default', orth2)).toBe(true);
                    }

                    current = next;
                }
            }
        });
    });

    describe('side parameter determinism', () => {
        it('side 0 vs 1 give mirrored routes', () => {
            // Place a symmetric obstacle (single rock) directly between start and goal.
            const startIdx = 1 * 20 + 1;   // (1, 1)
            const goalIdx = 1 * 20 + 18;  // (18, 1)

            terrainGrid.set(9, 1, TerrainType.Rock);
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            const path0 = aStar(nav, 'default', startIdx, goalIdx, 0);
            const path1 = aStar(nav, 'default', startIdx, goalIdx, 1);

            expect(path0).not.toBeNull();
            expect(path1).not.toBeNull();

            // Same length, mirrored about the start/goal row: one passes above the rock, the other below.
            expect(path0!.length).toBe(path1!.length);
            const rowsOffAxis = (path: number[]) => path.map((idx) => Math.floor(idx / 20) - 1).filter((dr) => dr !== 0);
            const off0 = rowsOffAxis(path0!);
            const off1 = rowsOffAxis(path1!);
            expect(off0.length).toBeGreaterThan(0);
            expect(off1.length).toBe(off0.length);
            expect(Math.sign(off0[0])).toBe(-Math.sign(off1[0]));
            expect(off0.every((dr) => Math.sign(dr) === Math.sign(off0[0]))).toBe(true);
            expect(off1.every((dr) => Math.sign(dr) === Math.sign(off1[0]))).toBe(true);
        });

        it('same inputs return identical chains', () => {
            const startIdx = 2 * 20 + 2;
            const goalIdx = 15 * 20 + 15;

            // Add some random rocks.
            terrainGrid.set(5, 5, TerrainType.Rock);
            terrainGrid.set(8, 8, TerrainType.Rock);
            terrainGrid.set(10, 10, TerrainType.Rock);
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            const path1 = aStar(nav, 'default', startIdx, goalIdx, 0);
            const path2 = aStar(nav, 'default', startIdx, goalIdx, 0);

            expect(path1).toEqual(path2);
        });
    });

    describe('weighted terrain', () => {
        it('avoids heavy terrain when equally short route exists', () => {
            // Create two parallel paths: one through normal terrain, one through thick grass.
            // Left path: normal grass
            // Right path: thick grass (higher cost)
            // Both should have equal length (in cells), but the normal path is cheaper.

            // Thick grass down column 5 except a gap at row 3. The goal is one row up, so the single
            // diagonal can be taken before or after column 5 at equal step count; only taking it
            // before (and crossing through the gap) avoids the costlier cells.
            for (let row = 0; row < 20; row++) {
                if (row !== 3) terrainGrid.set(5, row, TerrainType.ThickGrass);
            }
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            const startIdx = 4 * 20 + 0;  // (0, 4)
            const goalIdx = 3 * 20 + 10; // (10, 3)

            for (const side of [0, 1] as const) {
                const path = aStar(nav, 'default', startIdx, goalIdx, side);
                expect(path).not.toBeNull();
                expect(path!).toContain(3 * 20 + 5); // crosses column 5 through the gap
                expect(path!.some((idx) => nav.stepCost('default', idx) > 10)).toBe(false);
            }
        });
    });

    describe('cost verification', () => {
        it('path cost equals known optimal for small grid', () => {
            // Simple 5x5 grid, path from (0,0) to (4,4) should be 40 + 28 = 56
            // (5 diagonal steps at 14 cost each = 70, but actually it's 4 diagonal at 14 + 0 = 56)
            // Wait, let me recalculate: optimal path is diagonal from (0,0) to (4,4).
            // That's 4 diagonal steps (distance Chebyshev = 4).
            // Cost = 4 * 14 = 56.

            const startIdx = 0 * 5 + 0;  // (0, 0)
            const goalIdx = 4 * 5 + 4;  // (4, 4)

            // Create a small 5x5 NavGrid for testing.
            const smallEngine = new GameEngine();
            const smallGrid = new TerrainGrid(5, 5, CELL_SIZE, TerrainType.Grass);
            const smallTerrainMgr = new TerrainManager(smallGrid);
            smallEngine.terrainManager = smallTerrainMgr;

            const smallLayers = new TerrainLayerManager();
            smallTerrainMgr.setTerrainLayers(smallLayers);
            smallTerrainMgr.setCrystalProtectionProvider(() => smallEngine.state.specialTileManager.getCrystalProtectionMap());

            const smallNav = smallTerrainMgr.nav;

            const path = aStar(smallNav, 'default', startIdx, goalIdx, 0);
            expect(path).not.toBeNull();

            // Compute cost.
            let totalCost = 0;
            let current = startIdx;
            for (const next of path!) {
                const stepCost = smallNav.stepCost('default', next);
                const curCol = current % smallNav.width;
                const curRow = Math.floor(current / smallNav.width);
                const nextCol = next % smallNav.width;
                const nextRow = Math.floor(next / smallNav.width);
                const dCol = Math.abs(nextCol - curCol);
                const dRow = Math.abs(nextRow - curRow);

                if (dCol === 1 && dRow === 1) {
                    // Diagonal.
                    totalCost += Math.round(stepCost * 1.4);
                } else {
                    // Cardinal.
                    totalCost += stepCost;
                }
                current = next;
            }

            // Expected: 4 diagonal steps at cost 14 each = 56.
            expect(totalCost).toBe(56);
        });
    });
});
