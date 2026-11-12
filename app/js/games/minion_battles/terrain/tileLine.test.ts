import { describe, expect, it } from 'vitest';
import { forEachTileOnLine, isTileLineClear, isTileLineClearPermissive, isTileRayClear } from './tileLine';

type Tile = [number, number];

function lineTiles(c0: number, r0: number, c1: number, r1: number): Tile[] {
    const out: Tile[] = [];
    forEachTileOnLine(c0, r0, c1, r1, (col, row) => {
        out.push([col, row]);
    });
    return out;
}

function wallsAt(...tiles: Tile[]): (col: number, row: number) => boolean {
    const set = new Set(tiles.map(([c, r]) => `${c},${r}`));
    return (col, row) => set.has(`${col},${row}`);
}

describe('forEachTileOnLine', () => {
    it('visits a straight line from start to end inclusive', () => {
        expect(lineTiles(0, 0, 3, 0)).toEqual([
            [0, 0],
            [1, 0],
            [2, 0],
            [3, 0],
        ]);
    });

    it('visits a single tile when start equals end', () => {
        expect(lineTiles(2, 5, 2, 5)).toEqual([[2, 5]]);
    });

    it('steps one tile per major-axis step on a shallow line', () => {
        const tiles = lineTiles(0, 0, 5, 2);
        expect(tiles).toHaveLength(6);
        expect(tiles[0]).toEqual([0, 0]);
        expect(tiles[5]).toEqual([5, 2]);
    });

    it('stops when the visitor returns false', () => {
        const seen: Tile[] = [];
        const finished = forEachTileOnLine(0, 0, 5, 0, (col, row) => {
            seen.push([col, row]);
            return col < 2;
        });
        expect(finished).toBe(false);
        expect(seen).toEqual([
            [0, 0],
            [1, 0],
            [2, 0],
        ]);
    });

    it('is symmetric: the reverse line visits the same tiles in reverse order', () => {
        const ends: [number, number, number, number][] = [
            [0, 0, 7, 3],
            [0, 0, 3, 7],
            [2, 9, 8, 1],
            [5, 5, -4, 2],
            [0, 0, 4, 2],
            [0, 0, 6, 1],
            [3, 3, 3, -6],
        ];
        for (const [c0, r0, c1, r1] of ends) {
            expect(lineTiles(c1, r1, c0, r0)).toEqual(lineTiles(c0, r0, c1, r1).reverse());
        }
    });
});

describe('isTileLineClear', () => {
    const none = () => false;

    it('is clear on open ground', () => {
        expect(isTileLineClear(0, 0, 6, 3, none)).toBe(true);
    });

    it('is blocked by a wall in the middle', () => {
        expect(isTileLineClear(0, 0, 4, 0, wallsAt([2, 0]))).toBe(false);
    });

    it('ignores walls on either endpoint', () => {
        expect(isTileLineClear(0, 0, 4, 0, wallsAt([4, 0]))).toBe(true);
        expect(isTileLineClear(0, 0, 4, 0, wallsAt([0, 0]))).toBe(true);
        expect(isTileLineClear(0, 0, 1, 0, wallsAt([0, 0], [1, 0]))).toBe(true);
    });

    it('passes a diagonal past the corner of a wall', () => {
        // Wall at (1, 0) touches the diagonal (0,0)→(3,3) only at a corner.
        const walls = wallsAt([1, 0], [0, 1]);
        expect(isTileLineClear(0, 0, 3, 3, walls)).toBe(true);
        // A wall on the diagonal itself still blocks.
        expect(isTileLineClear(0, 0, 3, 3, wallsAt([2, 2]))).toBe(false);
    });

    it('gives the same answer in both directions', () => {
        const walls = wallsAt([3, 1], [2, 4], [5, 2]);
        for (let c = 0; c < 8; c++) {
            for (let r = 0; r < 6; r++) {
                expect(isTileLineClear(c, r, 6, 5, walls)).toBe(isTileLineClear(6, 5, c, r, walls));
                expect(isTileLineClear(c, r, 0, 0, walls)).toBe(isTileLineClear(0, 0, c, r, walls));
            }
        }
    });
});

describe('isTileRayClear', () => {
    it('is blocked by a wall the segment crosses', () => {
        expect(isTileRayClear(0.5, 0.5, 4.5, 0.5, wallsAt([2, 0]))).toBe(false);
    });

    it('ignores the tiles holding its end points', () => {
        expect(isTileRayClear(0.5, 0.5, 4.5, 0.5, wallsAt([0, 0], [4, 0]))).toBe(true);
    });

    it('passes a wall it does not cross', () => {
        expect(isTileRayClear(0.5, 0.5, 4.5, 0.5, wallsAt([2, 1]))).toBe(true);
    });
});

describe('isTileLineClearPermissive', () => {
    it('sees past a pillar that only clips the centre-to-centre line', () => {
        // Centre line (0,0) → (4,2) steps through (1,1); a single pillar there blocks the strict line.
        const pillar = wallsAt([1, 1]);
        expect(isTileLineClear(0, 0, 4, 2, pillar)).toBe(false);
        expect(isTileLineClearPermissive(0, 0, 4, 2, pillar)).toBe(true);
    });

    it('is still blocked by a solid wall', () => {
        const column = wallsAt([2, -2], [2, -1], [2, 0], [2, 1], [2, 2], [2, 3], [2, 4]);
        expect(isTileLineClearPermissive(0, 0, 4, 1, column)).toBe(false);
    });

    it('agrees with the strict line whenever that line is clear', () => {
        expect(isTileLineClearPermissive(0, 0, 5, 3, wallsAt([9, 9]))).toBe(true);
    });

    it('gives the same answer from either end', () => {
        const walls = wallsAt([2, 1], [3, 3], [1, 4], [4, 2]);
        for (let c = 0; c <= 6; c++) {
            for (let r = 0; r <= 6; r++) {
                expect(isTileLineClearPermissive(c, r, 0, 0, walls)).toBe(isTileLineClearPermissive(0, 0, c, r, walls));
            }
        }
    });
});
