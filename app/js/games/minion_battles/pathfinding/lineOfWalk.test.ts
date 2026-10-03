/**
 * lineOfWalk tests - grid traversal, corner rule, and line of sight checks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainGrid, CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainType } from '../terrain/TerrainType';
import { NavGrid } from './NavGrid';
import { TerrainManager } from '../terrain/TerrainManager';
import { GameEngine } from '../game/GameEngine';
import { TerrainLayerManager } from '../game/TerrainLayerManager';
import { hasLineOfWalk, hasLineOfWalkCells } from './lineOfWalk';

describe('lineOfWalk', () => {
    let engine: GameEngine;
    let terrainGrid: TerrainGrid;
    let terrainManager: TerrainManager;
    let nav: NavGrid;

    beforeEach(() => {
        engine = new GameEngine();
        terrainGrid = new TerrainGrid(10, 10, CELL_SIZE, TerrainType.Grass);
        terrainManager = new TerrainManager(terrainGrid);
        engine.terrainManager = terrainManager;

        const terrainLayers = new TerrainLayerManager();
        terrainManager.setTerrainLayers(terrainLayers);
        terrainManager.setCrystalProtectionProvider(() => engine.state.specialTileManager.getCrystalProtectionMap());

        nav = terrainManager.nav;
    });

    describe('clear lines', () => {
        it('axis-aligned horizontal line across open ground', () => {
            const x0 = 1.5 * CELL_SIZE;
            const y0 = 2.5 * CELL_SIZE;
            const x1 = 5.5 * CELL_SIZE;
            const y1 = 2.5 * CELL_SIZE;

            expect(hasLineOfWalk(nav, 'default', x0, y0, x1, y1)).toBe(true);
        });

        it('axis-aligned vertical line across open ground', () => {
            const x0 = 2.5 * CELL_SIZE;
            const y0 = 1.5 * CELL_SIZE;
            const x1 = 2.5 * CELL_SIZE;
            const y1 = 5.5 * CELL_SIZE;

            expect(hasLineOfWalk(nav, 'default', x0, y0, x1, y1)).toBe(true);
        });

        it('diagonal line across open ground', () => {
            const x0 = 1.5 * CELL_SIZE;
            const y0 = 1.5 * CELL_SIZE;
            const x1 = 5.5 * CELL_SIZE;
            const y1 = 5.5 * CELL_SIZE;

            expect(hasLineOfWalk(nav, 'default', x0, y0, x1, y1)).toBe(true);
        });

        it('off-axis line across open ground', () => {
            const x0 = 1.5 * CELL_SIZE;
            const y0 = 2.5 * CELL_SIZE;
            const x1 = 6.5 * CELL_SIZE;
            const y1 = 4.5 * CELL_SIZE;

            expect(hasLineOfWalk(nav, 'default', x0, y0, x1, y1)).toBe(true);
        });
    });

    describe('blocked lines', () => {
        it('blocked by a single rock on the line', () => {
            terrainGrid.set(3, 3, TerrainType.Rock);
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            const x0 = 1.5 * CELL_SIZE;
            const y0 = 3.5 * CELL_SIZE;
            const x1 = 5.5 * CELL_SIZE;
            const y1 = 3.5 * CELL_SIZE;

            expect(hasLineOfWalk(nav, 'default', x0, y0, x1, y1)).toBe(false);
        });

        it('blocked by a rock in the path', () => {
            terrainGrid.set(4, 4, TerrainType.Rock);
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            const x0 = 1.5 * CELL_SIZE;
            const y0 = 1.5 * CELL_SIZE;
            const x1 = 7.5 * CELL_SIZE;
            const y1 = 7.5 * CELL_SIZE;

            expect(hasLineOfWalk(nav, 'default', x0, y0, x1, y1)).toBe(false);
        });
    });

    describe('corner rule and diagonal squeezes', () => {
        it('line that only grazes a rock cell by a sliver is rejected', () => {
            // Place a rock and offset the line to clip just one corner.
            terrainGrid.set(5, 5, TerrainType.Rock);
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            // Start at (4.9, 4.9), end at (5.5, 5.5). Should pass through (5, 5).
            const x0 = 4.9 * CELL_SIZE;
            const y0 = 4.9 * CELL_SIZE;
            const x1 = 5.5 * CELL_SIZE;
            const y1 = 5.5 * CELL_SIZE;

            expect(hasLineOfWalk(nav, 'default', x0, y0, x1, y1)).toBe(false);
        });

        it('pure diagonal centre-to-centre between diagonally-adjacent rocks', () => {
            terrainGrid.set(4, 4, TerrainType.Rock);
            terrainGrid.set(6, 6, TerrainType.Rock);
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            // Centre of (5, 5) to centre of (7, 7) should not clip corners.
            // But centre of (4, 4) to centre of (6, 6) should clip the rocks.
            const x0 = (4 + 0.5) * CELL_SIZE;
            const y0 = (4 + 0.5) * CELL_SIZE;
            const x1 = (6 + 0.5) * CELL_SIZE;
            const y1 = (6 + 0.5) * CELL_SIZE;

            expect(hasLineOfWalk(nav, 'default', x0, y0, x1, y1)).toBe(false);
        });

        it('diagonal with only one orthogonal neighbour rock is rejected', () => {
            // Block one of the two diagonal neighbours.
            terrainGrid.set(4, 5, TerrainType.Rock); // Right orthogonal of (4, 4)
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            // Diagonal from (3.5, 3.5) to (5.5, 5.5) passes through (4, 4).
            // This requires both (5, 4) and (4, 5) to be passable (corner rule).
            // We blocked (4, 5), so it should fail.
            const x0 = (3 + 0.5) * CELL_SIZE;
            const y0 = (3 + 0.5) * CELL_SIZE;
            const x1 = (5 + 0.5) * CELL_SIZE;
            const y1 = (5 + 0.5) * CELL_SIZE;

            expect(hasLineOfWalk(nav, 'default', x0, y0, x1, y1)).toBe(false);
        });
    });

    describe('zero-length and boundary', () => {
        it('zero-length line returns passability of that cell', () => {
            const x = 3.5 * CELL_SIZE;
            const y = 3.5 * CELL_SIZE;

            expect(hasLineOfWalk(nav, 'default', x, y, x, y)).toBe(true);
        });

        it('zero-length line on impassable cell returns false', () => {
            terrainGrid.set(3, 3, TerrainType.Rock);
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            const x = 3.5 * CELL_SIZE;
            const y = 3.5 * CELL_SIZE;

            expect(hasLineOfWalk(nav, 'default', x, y, x, y)).toBe(false);
        });

        it('line that would leave the grid is rejected', () => {
            const x0 = 9.5 * CELL_SIZE;
            const y0 = 9.5 * CELL_SIZE;
            const x1 = (10 + 0.5) * CELL_SIZE; // Out of bounds
            const y1 = (10 + 0.5) * CELL_SIZE;

            expect(hasLineOfWalk(nav, 'default', x0, y0, x1, y1)).toBe(false);
        });
    });

    describe('symmetry', () => {
        it('hasLineOfWalk(a→b) === hasLineOfWalk(b→a)', () => {
            // Place some rocks and test symmetry.
            terrainGrid.set(3, 3, TerrainType.Rock);
            terrainGrid.set(5, 5, TerrainType.Rock);
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            const pairs = [
                { x0: 1 * CELL_SIZE, y0: 1 * CELL_SIZE, x1: 7 * CELL_SIZE, y1: 7 * CELL_SIZE },
                { x0: 2 * CELL_SIZE, y0: 3 * CELL_SIZE, x1: 6 * CELL_SIZE, y1: 3 * CELL_SIZE },
                { x0: 0.5 * CELL_SIZE, y0: 0.5 * CELL_SIZE, x1: 9.5 * CELL_SIZE, y1: 9.5 * CELL_SIZE },
            ];

            for (const pair of pairs) {
                const forward = hasLineOfWalk(nav, 'default', pair.x0, pair.y0, pair.x1, pair.y1);
                const backward = hasLineOfWalk(nav, 'default', pair.x1, pair.y1, pair.x0, pair.y0);
                expect(forward).toBe(backward);
            }
        });
    });

    describe('hasLineOfWalkCells', () => {
        it('centre-to-centre line across open ground', () => {
            expect(hasLineOfWalkCells(nav, 'default', 2, 2, 5, 5)).toBe(true);
        });

        it('centre-to-centre line blocked by rock', () => {
            terrainGrid.set(3, 3, TerrainType.Rock);
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            expect(hasLineOfWalkCells(nav, 'default', 2, 2, 5, 5)).toBe(false);
        });

        it('same cell returns true', () => {
            expect(hasLineOfWalkCells(nav, 'default', 3, 3, 3, 3)).toBe(true);
        });
    });
});
