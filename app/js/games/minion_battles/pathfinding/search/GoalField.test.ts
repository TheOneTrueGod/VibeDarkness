/**
 * GoalField tests - distances, lazy/resumable expansion, order independence, chain extraction.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainType } from '../../terrain/TerrainType';
import type { NavGrid } from '../NavGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainLayerManager } from '../../game/TerrainLayerManager';
import { GoalField, ROUTE_TIE_EPSILON } from './GoalField';
import { aStar } from './aStar';
import { stepMoveCost } from './neighbours';

const W = 20;
const idx = (col: number, row: number) => row * W + col;

describe('GoalField', () => {
    let terrainGrid: TerrainGrid;
    let terrainManager: TerrainManager;
    let nav: NavGrid;

    beforeEach(() => {
        terrainGrid = new TerrainGrid(W, 20, CELL_SIZE, TerrainType.Grass);
        terrainManager = new TerrainManager(terrainGrid);
        terrainManager.setTerrainLayers(new TerrainLayerManager());
        nav = terrainManager.nav;
    });

    /** Two walls with gaps and a thick-grass patch, so routes bend and costs vary. */
    function buildObstacles(): void {
        for (let row = 0; row <= 13; row++) terrainGrid.set(7, row, TerrainType.Rock);
        for (let row = 6; row <= 19; row++) terrainGrid.set(13, row, TerrainType.Rock);
        for (let col = 9; col <= 11; col++) {
            for (let row = 8; row <= 11; row++) terrainGrid.set(col, row, TerrainType.ThickGrass);
        }
        terrainManager.clearPathCache();
        nav = terrainManager.nav;
    }

    /** Cost of walking `chain` starting from `start` (sum of the cost of each cell entered). */
    function chainCost(start: number, chain: number[]): number {
        let cost = 0;
        let prev = start;
        for (const cell of chain) {
            const diagonal = prev % W !== cell % W && Math.floor(prev / W) !== Math.floor(cell / W);
            cost += stepMoveCost(nav.stepCost('default', cell), diagonal);
            prev = cell;
        }
        return cost;
    }

    /** Every step is a legal 8-neighbour move that does not cut a corner. */
    function expectLegalChain(start: number, chain: number[]): void {
        let prev = start;
        for (const cell of chain) {
            const dc = (cell % W) - (prev % W);
            const dr = Math.floor(cell / W) - Math.floor(prev / W);
            expect(Math.max(Math.abs(dc), Math.abs(dr))).toBe(1);
            expect(nav.isPassableIdx('default', cell)).toBe(true);
            if (dc !== 0 && dr !== 0) {
                expect(nav.isPassableIdx('default', prev + dc)).toBe(true);
                expect(nav.isPassableIdx('default', prev + dr * W)).toBe(true);
            }
            prev = cell;
        }
    }

    const SAMPLE_CELLS: [number, number][] = [
        [0, 0], [3, 2], [5, 12], [6, 19], [1, 17], [8, 1], [9, 9], [10, 10], [11, 4], [12, 18],
        [8, 14], [14, 0], [15, 5], [16, 10], [19, 19], [18, 7], [14, 14], [17, 2], [2, 9], [4, 4],
        [9, 16], [11, 12], [19, 0], [6, 14], [12, 5],
    ];

    it('distance to the goal itself is zero and extractChain(goal) is empty', () => {
        const field = new GoalField(nav, 'default', idx(5, 5));
        expect(field.distance(idx(5, 5))).toBe(0);
        expect(field.extractChain(idx(5, 5), 0)).toEqual([]);
    });

    it('distances equal the cost of the A* route from the same cell', () => {
        buildObstacles();
        const goal = idx(17, 12);
        const field = new GoalField(nav, 'default', goal);
        for (const [col, row] of SAMPLE_CELLS) {
            const cell = idx(col, row);
            const chain = aStar(nav, 'default', cell, goal, 0);
            expect(chain, `aStar from (${col},${row})`).not.toBeNull();
            expect(field.distance(cell), `distance from (${col},${row})`).toBe(chainCost(cell, chain!));
        }
    });

    it('a lazily expanded field and a fully expanded field give identical chains', () => {
        buildObstacles();
        const goal = idx(17, 12);
        for (const [col, row] of SAMPLE_CELLS) {
            const cell = idx(col, row);
            const lazy = new GoalField(nav, 'default', goal);
            const full = new GoalField(nav, 'default', goal);
            for (let i = 0; i < W * 20; i++) full.distance(i);
            for (const side of [0, 1] as const) {
                expect(lazy.extractChain(cell, side)).toEqual(full.extractChain(cell, side));
            }
            expect(lazy.distance(cell)).toBe(full.distance(cell));
        }
    });

    it('query order does not change results (near-then-far equals far-then-near)', () => {
        buildObstacles();
        const goal = idx(17, 12);
        const near = idx(15, 12);
        const far = idx(1, 1);

        const a = new GoalField(nav, 'default', goal);
        const aNear = a.extractChain(near, 0);
        const aFar = a.extractChain(far, 0);

        const b = new GoalField(nav, 'default', goal);
        const bFar = b.extractChain(far, 0);
        const bNear = b.extractChain(near, 0);

        expect(aNear).not.toBeNull();
        expect(aFar).not.toBeNull();
        expect(aNear).toEqual(bNear);
        expect(aFar).toEqual(bFar);
        expect(a.distance(far)).toBe(b.distance(far));
    });

    it('expands only as far as it has to', () => {
        const field = new GoalField(nav, 'default', idx(10, 10));
        expect(field.ensureSettled(idx(11, 10))).toBe(true);
        expect(field.expandedCount).toBeGreaterThan(0);
        expect(field.expandedCount).toBeLessThan(30);
    });

    it('an unreachable cell is rejected without expanding anything', () => {
        // Seal the goal inside a ring of rock.
        for (const [c, r] of [[4, 4], [5, 4], [6, 4], [4, 5], [6, 5], [4, 6], [5, 6], [6, 6]]) {
            terrainGrid.set(c, r, TerrainType.Rock);
        }
        terrainManager.clearPathCache();
        nav = terrainManager.nav;

        const field = new GoalField(nav, 'default', idx(5, 5));
        expect(field.ensureSettled(idx(15, 15))).toBe(false);
        expect(field.distance(idx(15, 15))).toBe(-1);
        expect(field.extractChain(idx(15, 15), 0)).toBeNull();
        expect(field.expandedCount).toBe(0);
        // A rock cell is rejected too.
        expect(field.ensureSettled(idx(4, 4))).toBe(false);
    });

    it('extracted chains are legal, strictly approach the goal, and stay within the tie slack', () => {
        buildObstacles();
        const goal = idx(17, 12);
        const field = new GoalField(nav, 'default', goal);
        for (const [col, row] of SAMPLE_CELLS) {
            const start = idx(col, row);
            for (const side of [0, 1] as const) {
                const chain = field.extractChain(start, side);
                expect(chain, `chain from (${col},${row})`).not.toBeNull();
                expect(chain![chain!.length - 1]).toBe(goal);
                expectLegalChain(start, chain!);

                let prevDist = field.distance(start);
                for (const cell of chain!) {
                    expect(field.distance(cell)).toBeLessThan(prevDist);
                    prevDist = field.distance(cell);
                }
                const cost = chainCost(start, chain!);
                expect(cost).toBeGreaterThanOrEqual(field.distance(start));
                expect(cost).toBeLessThanOrEqual(field.distance(start) + ROUTE_TIE_EPSILON);
            }
        }
    });

    it('side 0 and side 1 pass a symmetric obstacle on opposite sides', () => {
        terrainGrid.set(9, 5, TerrainType.Rock);
        terrainManager.clearPathCache();
        nav = terrainManager.nav;

        const start = idx(1, 5);
        const field = new GoalField(nav, 'default', idx(18, 5));
        const offAxis = (chain: number[]) => chain.map((cell) => Math.floor(cell / W) - 5).filter((dr) => dr !== 0);

        const off0 = offAxis(field.extractChain(start, 0)!);
        const off1 = offAxis(field.extractChain(start, 1)!);
        expect(off0.length).toBeGreaterThan(0);
        expect(off1.length).toBeGreaterThan(0);
        expect(off0.every((dr) => Math.sign(dr) === Math.sign(off0[0]))).toBe(true);
        expect(off1.every((dr) => Math.sign(dr) === Math.sign(off1[0]))).toBe(true);
        expect(Math.sign(off0[0])).toBe(-Math.sign(off1[0]));
    });
});
