import { describe, it, expect } from 'vitest';
import type { TerrainType } from '../../../../terrain/TerrainType';
import { checkSeam, isPassable } from '../../../../terrain/mapTools';
import { MAP_SEGMENT_61_49_CASTLE_GATE } from '../61_49_castle_gate';
import { MAP_SEGMENT_61_48_CASTLE_COURTYARD } from '../61_48_castle_courtyard';
import { MAP_SEGMENT_60_50_CAVE_ROAD } from '../60_50_cave_road';
import { CASTLE_SEGMENTS } from './index';

const SIZE = 22;
const COL0 = 58;
const ROW0 = 43;
const COLS = 7;
const ROWS = 7;

const byAddress = new Map<string, TerrainType[][]>([
    ['61_49', MAP_SEGMENT_61_49_CASTLE_GATE],
    ['61_48', MAP_SEGMENT_61_48_CASTLE_COURTYARD],
]);
for (const s of CASTLE_SEGMENTS) byAddress.set(`${s.gridCol}_${s.gridRow}`, s.terrain);

/** Whole castle as one grid, segments placed by world-grid address. */
function stitchCastle(): TerrainType[][] {
    const grid: TerrainType[][] = [];
    for (let r = 0; r < ROWS; r++) {
        for (let y = 0; y < SIZE; y++) {
            const row: TerrainType[] = [];
            for (let c = 0; c < COLS; c++) row.push(...byAddress.get(`${COL0 + c}_${ROW0 + r}`)![y]);
            grid.push(row);
        }
    }
    return grid;
}

/** 4-connected flood fill over passable cells. */
function floodFrom(grid: TerrainType[][], col: number, row: number): boolean[][] {
    const seen = grid.map((r) => r.map(() => false));
    const stack: [number, number][] = [[col, row]];
    seen[row][col] = true;
    while (stack.length > 0) {
        const [c, r] = stack.pop()!;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = c + dc;
            const nr = r + dr;
            if (nr < 0 || nc < 0 || nr >= grid.length || nc >= grid[0].length) continue;
            if (seen[nr][nc] || !isPassable(grid[nr][nc])) continue;
            seen[nr][nc] = true;
            stack.push([nc, nr]);
        }
    }
    return seen;
}

describe('castle segments (58-64 x 43-49)', () => {
    it('fills the 7x7 block around the existing gate and courtyard with 22x22 segments', () => {
        expect(CASTLE_SEGMENTS).toHaveLength(COLS * ROWS - 2);
        expect(byAddress.size).toBe(COLS * ROWS);
        for (const s of CASTLE_SEGMENTS) {
            expect(s.id.startsWith(`${s.gridCol}_${s.gridRow}_`)).toBe(true);
            expect(s.description.length, `${s.id} description`).toBeGreaterThan(0);
            expect(s.terrain).toHaveLength(SIZE);
            for (const row of s.terrain) expect(row).toHaveLength(SIZE);
        }
    });

    it('lines up with every neighbour, including the existing gate, courtyard and 60_50', () => {
        for (const [address, terrain] of byAddress) {
            const [col, row] = address.split('_').map(Number);
            const east = byAddress.get(`${col + 1}_${row}`);
            const south = byAddress.get(`${col}_${row + 1}`);
            if (east) expect(checkSeam(terrain, east, 'east').mismatches, `${address} east`).toEqual([]);
            if (south) expect(checkSeam(terrain, south, 'south').mismatches, `${address} south`).toEqual([]);
        }
        const westGuardhouse = byAddress.get('60_49')!;
        expect(checkSeam(westGuardhouse, MAP_SEGMENT_60_50_CAVE_ROAD, 'south').mismatches).toEqual([]);
    });

    it('lets you walk from the gate approach to every open cell, POI and network node', () => {
        const grid = stitchCastle();
        const gateCol = (61 - COL0) * SIZE + 10;
        const gateRow = (49 - ROW0) * SIZE + 17;
        const reached = floodFrom(grid, gateCol, gateRow);

        const unreachable: string[] = [];
        grid.forEach((cells, row) =>
            cells.forEach((type, col) => {
                if (isPassable(type) && !reached[row][col]) unreachable.push(`${col},${row}`);
            }),
        );
        expect(unreachable).toEqual([]);

        for (const s of CASTLE_SEGMENTS) {
            const originCol = (s.gridCol - COL0) * SIZE;
            const originRow = (s.gridRow - ROW0) * SIZE;
            for (const poi of s.pointsOfInterest) {
                expect(reached[originRow + poi.row][originCol + poi.col], poi.id).toBe(true);
            }
            for (const node of s.network.nodes) {
                if (node.position.kind !== 'gridPoint') continue;
                expect(reached[originRow + node.position.row][originCol + node.position.col], node.id).toBe(true);
            }
        }
    });

    it('uses unique POI and node ids, and network edges only name known nodes', () => {
        const poiIds = CASTLE_SEGMENTS.flatMap((s) => s.pointsOfInterest.map((p) => p.id));
        expect(new Set(poiIds).size).toBe(poiIds.length);

        const nodeIds = new Set(CASTLE_SEGMENTS.flatMap((s) => s.network.nodes.map((n) => n.id)));
        nodeIds.add('61_48_keep_door');
        for (const s of CASTLE_SEGMENTS) {
            for (const [a, b] of s.network.edges) {
                expect(nodeIds.has(a), `${s.id}: ${a}`).toBe(true);
                expect(nodeIds.has(b), `${s.id}: ${b}`).toBe(true);
            }
        }
    });
});
