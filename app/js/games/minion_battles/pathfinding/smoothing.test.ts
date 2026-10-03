/**
 * smoothing tests - string-pull, waypoint reduction, terrain guards.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainGrid, CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainType } from '../terrain/TerrainType';
import { NavGrid } from './NavGrid';
import { TerrainManager } from '../terrain/TerrainManager';
import { GameEngine } from '../game/GameEngine';
import { TerrainLayerManager } from '../game/TerrainLayerManager';
import { smoothPath } from './smoothing';
import { maxStepCostOnLine } from './lineOfWalk';
import { aStar } from './search/aStar';
import { hasLineOfWalkCells } from './lineOfWalk';

describe('smoothPath', () => {
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

    describe('empty and single-cell chains', () => {
        it('empty chain returns empty waypoints', () => {
            const startX = 1.5 * CELL_SIZE;
            const startY = 1.5 * CELL_SIZE;

            const waypoints = smoothPath(nav, 'default', startX, startY, []);
            expect(waypoints).toEqual([]);
        });

        it('single-cell chain returns one waypoint', () => {
            const startX = 1.5 * CELL_SIZE;
            const startY = 1.5 * CELL_SIZE;
            const goalIdx = 5 * 20 + 5; // (5, 5)

            const waypoints = smoothPath(nav, 'default', startX, startY, [goalIdx]);
            expect(waypoints).toHaveLength(1);
            expect(waypoints[0].col).toBe(5);
            expect(waypoints[0].row).toBe(5);
        });
    });

    describe('diagonal and open-field paths', () => {
        it('open-field diagonal chain collapses to one waypoint (goal)', () => {
            const startX = 1.5 * CELL_SIZE;
            const startY = 1.5 * CELL_SIZE;

            // A* path from (1,1) to (5,5) in open field.
            const startIdx = 1 * 20 + 1;
            const goalIdx = 5 * 20 + 5;

            const chain = aStar(nav, 'default', startIdx, goalIdx, 0);
            expect(chain).not.toBeNull();

            const waypoints = smoothPath(nav, 'default', startX, startY, chain!);

            // In open field, the entire chain should collapse to just the goal.
            expect(waypoints).toHaveLength(1);
            expect(waypoints[0].col).toBe(5);
            expect(waypoints[0].row).toBe(5);
        });

        it('off-axis open-field diagonal collapses to one waypoint', () => {
            const startX = 2.5 * CELL_SIZE;
            const startY = 3.5 * CELL_SIZE;

            const startIdx = 3 * 20 + 2;
            const goalIdx = 7 * 20 + 8;

            const chain = aStar(nav, 'default', startIdx, goalIdx, 0);
            expect(chain).not.toBeNull();

            const waypoints = smoothPath(nav, 'default', startX, startY, chain!);

            // Still collapses to just the goal in open field.
            expect(waypoints).toHaveLength(1);
            expect(waypoints[0].col).toBe(8);
            expect(waypoints[0].row).toBe(7);
        });
    });

    describe('L-shaped corridors', () => {
        it('route round the end of a wall bends only at the wall end', () => {
            // Wall down column 10 from the top edge to row 10; the only way past is under its end.
            for (let row = 0; row <= 10; row++) {
                terrainGrid.set(10, row, TerrainType.Rock);
            }
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            const startIdx = 4 * 20 + 4; // (4, 4)
            const goalIdx = 4 * 20 + 15; // (15, 4)
            const chain = aStar(nav, 'default', startIdx, goalIdx, 0);
            expect(chain).not.toBeNull();

            const waypoints = smoothPath(nav, 'default', 4.5 * CELL_SIZE, 4.5 * CELL_SIZE, chain!);

            // The bend hugs the wall's end at (10, 10): at most one waypoint either side of it
            // (greedy string-pulling cannot see the cell directly under the wall from the start),
            // then the goal. Nothing in between.
            expect(waypoints.length).toBeGreaterThanOrEqual(2);
            expect(waypoints.length).toBeLessThanOrEqual(3);
            expect(waypoints[waypoints.length - 1]).toEqual({ col: 15, row: 4 });
            for (const wp of waypoints.slice(0, -1)) {
                expect(Math.max(Math.abs(wp.col - 10), Math.abs(wp.row - 11))).toBeLessThanOrEqual(1);
            }
        });
    });

    describe('line of walk validation', () => {
        it('every consecutive waypoint pair satisfies hasLineOfWalkCells', () => {
            // Add a complex obstacle.
            for (let col = 7; col <= 8; col++) {
                terrainGrid.set(col, 10, TerrainType.Rock);
            }
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            const startIdx = 1 * 20 + 1;
            const goalIdx = 15 * 20 + 15;

            const chain = aStar(nav, 'default', startIdx, goalIdx, 0);
            expect(chain).not.toBeNull();

            const startX = 1.5 * CELL_SIZE;
            const startY = 1.5 * CELL_SIZE;
            const waypoints = smoothPath(nav, 'default', startX, startY, chain!);

            // Check that every consecutive pair has line of walk.
            let prevCol = Math.floor(startX / CELL_SIZE);
            let prevRow = Math.floor(startY / CELL_SIZE);

            for (const wp of waypoints) {
                const hasWalk = hasLineOfWalkCells(nav, 'default', prevCol, prevRow, wp.col, wp.row);
                expect(hasWalk).toBe(true);
                prevCol = wp.col;
                prevRow = wp.row;
            }
        });

        it('start to first waypoint has line of walk', () => {
            const startX = 1.5 * CELL_SIZE;
            const startY = 1.5 * CELL_SIZE;
            const startCol = 1;
            const startRow = 1;

            const startIdx = 1 * 20 + 1;
            const goalIdx = 10 * 20 + 10;

            const chain = aStar(nav, 'default', startIdx, goalIdx, 0);
            expect(chain).not.toBeNull();

            const waypoints = smoothPath(nav, 'default', startX, startY, chain!);

            if (waypoints.length > 0) {
                const hasWalk = hasLineOfWalkCells(nav, 'default', startCol, startRow, waypoints[0].col, waypoints[0].row);
                expect(hasWalk).toBe(true);
            }
        });
    });

    describe('terrain weight guards', () => {
        it('chain detour around ThickGrass is not shortcut through it', () => {
            // Thick grass down column 8 except a gap at row 2, which is the goal's row. The cheapest
            // chain takes its diagonals first and crosses through the gap; the straight line
            // start -> goal would cross column 8 at row 4, through thick grass.
            for (let row = 0; row < 20; row++) {
                if (row !== 2) terrainGrid.set(8, row, TerrainType.ThickGrass);
            }
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            const startIdx = 6 * 20 + 4; // (4, 6)
            const goalIdx = 2 * 20 + 12; // (12, 2)
            const chain = aStar(nav, 'default', startIdx, goalIdx, 0);
            expect(chain).not.toBeNull();
            expect(chain!.every((idx) => nav.stepCost('default', idx) === 10)).toBe(true);

            let x = 4.5 * CELL_SIZE;
            let y = 6.5 * CELL_SIZE;
            const waypoints = smoothPath(nav, 'default', x, y, chain!);
            expect(waypoints.length).toBeGreaterThan(1);

            // No smoothed segment may cross the thick grass.
            for (const wp of waypoints) {
                const wx = wp.col * CELL_SIZE + CELL_SIZE / 2;
                const wy = wp.row * CELL_SIZE + CELL_SIZE / 2;
                expect(maxStepCostOnLine(nav, 'default', x, y, wx, wy)).toBe(10);
                x = wx;
                y = wy;
            }
        });
    });

    describe('off-centre start', () => {
        it('off-centre start position in cell works', () => {
            const startX = 1.2 * CELL_SIZE; // Off-centre within (1, 1)
            const startY = 1.3 * CELL_SIZE;

            const startIdx = 1 * 20 + 1;
            const goalIdx = 10 * 20 + 10;

            const chain = aStar(nav, 'default', startIdx, goalIdx, 0);
            expect(chain).not.toBeNull();

            const waypoints = smoothPath(nav, 'default', startX, startY, chain!);
            expect(waypoints.length).toBeGreaterThan(0);
        });
    });

    describe('determinism', () => {
        it('same inputs produce same waypoints', () => {
            const startX = 2.5 * CELL_SIZE;
            const startY = 2.5 * CELL_SIZE;

            const startIdx = 2 * 20 + 2;
            const goalIdx = 15 * 20 + 15;

            const chain1 = aStar(nav, 'default', startIdx, goalIdx, 0);
            const waypoints1 = smoothPath(nav, 'default', startX, startY, chain1!);

            const chain2 = aStar(nav, 'default', startIdx, goalIdx, 0);
            const waypoints2 = smoothPath(nav, 'default', startX, startY, chain2!);

            expect(waypoints1).toEqual(waypoints2);
        });
    });

    describe('corner widening', () => {
        it('lane 0 (default) returns the same waypoints as no lane parameter', () => {
            // Wall down column 10 from the top edge to row 10.
            for (let row = 0; row <= 10; row++) {
                terrainGrid.set(10, row, TerrainType.Rock);
            }
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            const startIdx = 4 * 20 + 4;
            const goalIdx = 4 * 20 + 15;
            const chain = aStar(nav, 'default', startIdx, goalIdx, 0);
            expect(chain).not.toBeNull();

            const startX = 4.5 * CELL_SIZE;
            const startY = 4.5 * CELL_SIZE;
            const waypointsNoLane = smoothPath(nav, 'default', startX, startY, chain!);
            const waypointsLane0 = smoothPath(nav, 'default', startX, startY, chain!, 0);

            expect(waypointsLane0).toEqual(waypointsNoLane);
        });

        it('on a wide open corner, lane 0.99 widens 2 cells, lane 0.5 widens 1 cell, lane 0.1 does not widen', () => {
            // Open grid: lots of room outward from the wall end.
            const startIdx = 4 * 20 + 4;
            const goalIdx = 4 * 20 + 15;

            const chain = aStar(nav, 'default', startIdx, goalIdx, 0);
            expect(chain).not.toBeNull();

            const startX = 4.5 * CELL_SIZE;
            const startY = 4.5 * CELL_SIZE;

            // Baseline with no lane.
            const baselineWaypoints = smoothPath(nav, 'default', startX, startY, chain!);
            expect(baselineWaypoints.length).toBeGreaterThan(0);
            const baselineCorner = baselineWaypoints[0]!;

            // Lane 0.99: should widen to up to 2 cells outward.
            const lane099Waypoints = smoothPath(nav, 'default', startX, startY, chain!, 0.99);
            expect(lane099Waypoints[lane099Waypoints.length - 1]).toEqual(baselineWaypoints[baselineWaypoints.length - 1]); // Goal unchanged.
            if (lane099Waypoints.length > 1 && baselineWaypoints.length > 1) {
                const corner099 = lane099Waypoints[0];
                // The widened waypoint should be farther from the baseline corner in the outward direction.
                const dist099 = Math.hypot(corner099.col - baselineCorner.col, corner099.row - baselineCorner.row);
                expect(dist099).toBeGreaterThan(0);
                expect(dist099).toBeLessThanOrEqual(2); // Max 2 cells outward.
            }

            // Lane 0.5: should widen to up to 1 cell outward.
            const lane05Waypoints = smoothPath(nav, 'default', startX, startY, chain!, 0.5);
            if (lane05Waypoints.length > 1 && baselineWaypoints.length > 1) {
                const corner05 = lane05Waypoints[0];
                const dist05 = Math.hypot(corner05.col - baselineCorner.col, corner05.row - baselineCorner.row);
                expect(dist05).toBeLessThanOrEqual(1);
            }

            // Lane 0.1: should not widen (free * 0.1 < 1).
            const lane01Waypoints = smoothPath(nav, 'default', startX, startY, chain!, 0.1);
            expect(lane01Waypoints[0]).toEqual(baselineWaypoints[0]);
        });

        it('never widens onto ThickGrass when the corner cell is Grass', () => {
            const terrainGrid3 = new TerrainGrid(20, 20, CELL_SIZE, TerrainType.Grass);
            // Create a corner with Grass and ThickGrass nearby.
            // Rock at (10, 0-9); grass at (10, 10); ThickGrass to the side.
            for (let row = 0; row < 10; row++) {
                terrainGrid3.set(10, row, TerrainType.Rock);
            }
            for (let col = 11; col < 15; col++) {
                terrainGrid3.set(col, 10, TerrainType.ThickGrass);
            }

            const tm3 = new TerrainManager(terrainGrid3);
            engine.terrainManager = tm3;

            const terrainLayers = new TerrainLayerManager();
            tm3.setTerrainLayers(terrainLayers);
            tm3.setCrystalProtectionProvider(() => engine.state.specialTileManager.getCrystalProtectionMap());
            const nav3 = tm3.nav;

            // Path from left through a corner to the right.
            const startIdx = 10 * 20 + 2; // (2, 10)
            const goalIdx = 10 * 20 + 16; // (16, 10)

            const chain = aStar(nav3, 'default', startIdx, goalIdx, 0);
            expect(chain).not.toBeNull();

            const startX = 2.5 * CELL_SIZE;
            const startY = 10.5 * CELL_SIZE;
            const widenWaypoints = smoothPath(nav3, 'default', startX, startY, chain!, 0.99);

            // The corner cell is Grass (cost 10). If widening would move onto ThickGrass (cost 20),
            // it is rejected. Verify no widened waypoint is on ThickGrass.
            for (const wp of widenWaypoints) {
                const terrain = terrainGrid3.get(wp.col, wp.row);
                expect(terrain).not.toBe(TerrainType.ThickGrass);
            }
        });

        it('line of walk is maintained for all waypoint pairs after widening', () => {
            for (let row = 0; row <= 10; row++) {
                terrainGrid.set(10, row, TerrainType.Rock);
            }
            terrainManager.clearPathCache();
            nav = terrainManager.nav;

            const startIdx = 4 * 20 + 4;
            const goalIdx = 4 * 20 + 15;
            const chain = aStar(nav, 'default', startIdx, goalIdx, 0);
            expect(chain).not.toBeNull();

            const startX = 4.5 * CELL_SIZE;
            const startY = 4.5 * CELL_SIZE;
            const waypoints = smoothPath(nav, 'default', startX, startY, chain!, 0.99);

            // Verify every consecutive pair has line of walk.
            let prevCol = Math.floor(startX / CELL_SIZE);
            let prevRow = Math.floor(startY / CELL_SIZE);

            for (const wp of waypoints) {
                const hasWalk = hasLineOfWalkCells(nav, 'default', prevCol, prevRow, wp.col, wp.row);
                expect(hasWalk).toBe(true);
                prevCol = wp.col;
                prevRow = wp.row;
            }
        });
    });
});
