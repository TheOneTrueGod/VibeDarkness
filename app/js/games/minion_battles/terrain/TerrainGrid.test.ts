import { describe, it, expect } from 'vitest';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from './TerrainGrid';
import { TerrainType } from './TerrainType';

const R = TerrainType.Rock;
const G = TerrainType.Grass;
const T = TerrainType.ThickGrass;
const D = TerrainType.Dirt;
const I = TerrainType.Impassable;

describe('TerrainGrid', () => {
    describe('createFilledTerrain', () => {
        it('creates a grid filled with the default terrain', () => {
            const grid = TerrainGrid.createFilledTerrain(5, 4, CELL_SIZE, TerrainType.Grass);
            expect(grid.width).toBe(5);
            expect(grid.height).toBe(4);
            for (let r = 0; r < 4; r++) {
                for (let c = 0; c < 5; c++) {
                    expect(grid.get(c, r)).toBe(TerrainType.Grass);
                }
            }
        });

        it('creates a grid filled with Rock when specified', () => {
            const grid = TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Rock);
            expect(grid.width).toBe(3);
            expect(grid.height).toBe(3);
            for (let r = 0; r < 3; r++) {
                for (let c = 0; c < 3; c++) {
                    expect(grid.get(c, r)).toBe(TerrainType.Rock);
                }
            }
        });
    });

    describe('createTerrainFromArray', () => {
        it('builds terrain from a 2D array matching dimensions', () => {
            const data: TerrainType[][] = [
                [R, R, G],
                [R, G, G],
                [G, G, R],
            ];
            const grid = TerrainGrid.createTerrainFromArray(3, 3, CELL_SIZE, data);
            expect(grid.width).toBe(3);
            expect(grid.height).toBe(3);
            expect(grid.get(0, 0)).toBe(R);
            expect(grid.get(1, 0)).toBe(R);
            expect(grid.get(2, 0)).toBe(G);
            expect(grid.get(0, 1)).toBe(R);
            expect(grid.get(1, 1)).toBe(G);
            expect(grid.get(2, 2)).toBe(R);
        });

        it('pads missing cells with fill', () => {
            const data: TerrainType[][] = [[R, G], [G]]; // row 1 has only 1 cell
            const grid = TerrainGrid.createTerrainFromArray(3, 2, CELL_SIZE, data, TerrainType.Dirt);
            expect(grid.get(0, 0)).toBe(R);
            expect(grid.get(1, 0)).toBe(G);
            expect(grid.get(2, 0)).toBe(D);
            expect(grid.get(0, 1)).toBe(G);
            expect(grid.get(1, 1)).toBe(D);
            expect(grid.get(2, 1)).toBe(D);
        });

        it('uses only cols×rows when data is larger', () => {
            const data: TerrainType[][] = [
                [R, G, G, R],
                [G, R, G, G],
                [G, G, R, R],
            ];
            const grid = TerrainGrid.createTerrainFromArray(2, 2, CELL_SIZE, data);
            expect(grid.width).toBe(2);
            expect(grid.height).toBe(2);
            expect(grid.get(0, 0)).toBe(R);
            expect(grid.get(1, 0)).toBe(G);
            expect(grid.get(0, 1)).toBe(G);
            expect(grid.get(1, 1)).toBe(R);
        });
    });

    describe('Impassable terrain', () => {
        it('is not passable, matching the out-of-bounds fallback (Rock)', () => {
            const grid = TerrainGrid.createTerrainFromArray(2, 1, CELL_SIZE, [[I, G]]);
            expect(grid.isPassable(CELL_SIZE / 2, CELL_SIZE / 2)).toBe(false);
        });

        it('blocks line of sight the same as Rock', () => {
            const grid = TerrainGrid.createTerrainFromArray(3, 1, CELL_SIZE, [[G, I, G]]);
            const y = CELL_SIZE / 2;
            expect(grid.hasLineOfSight(CELL_SIZE * 0.5, y, CELL_SIZE * 2.5, y)).toBe(false);
        });
    });

});

describe('stitchTerrain', () => {
    it('stitches 2x2 quadrants into expected 4x4 grid', () => {
        const upperLeft = [
            [R, R],
            [R, G],
        ];
        const upperRight = [
            [R, R],
            [G, R],
        ];
        const bottomLeft = [
            [R, G],
            [R, R],
        ];
        const bottomRight = [
            [G, R],
            [R, R],
        ];
        const stitched = stitchTerrain(
            [
                [upperLeft, upperRight],
                [bottomLeft, bottomRight],
            ],
            G,
        );
        expect(stitched).toHaveLength(4);
        expect(stitched[0]).toEqual([R, R, R, R]);
        expect(stitched[1]).toEqual([R, G, G, R]);
        expect(stitched[2]).toEqual([R, G, G, R]);
        expect(stitched[3]).toEqual([R, R, R, R]);
    });

    it('stitches one row of three tiles (horizontal thirds)', () => {
        const left = [[G, R], [R, G]];
        const mid = [[T, T], [T, T]];
        const right = [[R, R], [R, R]];
        const stitched = stitchTerrain([[left, mid, right]], G);
        expect(stitched).toHaveLength(2);
        expect(stitched[0]).toEqual([G, R, T, T, R, R]);
        expect(stitched[1]).toEqual([R, G, T, T, R, R]);
    });

    it('pads missing rows in a tile with fill', () => {
        const tall = [[R], [R], [R]];
        const short = [[G], [G]];
        const stitched = stitchTerrain([[tall, short]], TerrainType.Dirt);
        expect(stitched).toHaveLength(3);
        expect(stitched[0]).toEqual([R, G]);
        expect(stitched[1]).toEqual([R, G]);
        expect(stitched[2]).toEqual([R, D]);
    });

    it('returns empty array for empty quadrant grid', () => {
        expect(stitchTerrain([], G)).toEqual([]);
        expect(stitchTerrain([[]], G)).toEqual([]);
    });

    it('contributes zero-width columns for a null tile with no sibling to infer size from', () => {
        const tile = [[R, G], [G, R]];
        const stitched = stitchTerrain([[tile, null]], G);
        expect(stitched).toHaveLength(2);
        expect(stitched[0]).toEqual([R, G]);
        expect(stitched[1]).toEqual([G, R]);
    });

    it('fills a missing (null) tile with Impassable, not fill, sized from sibling tiles', () => {
        const topRight = [[G, G], [G, G]];
        const bottomLeft = [[G, G], [G, G]];
        const bottomRight = [[G, G], [G, G]];
        const stitched = stitchTerrain(
            [
                [null, topRight],
                [bottomLeft, bottomRight],
            ],
            G,
        );
        expect(stitched).toHaveLength(4);
        expect(stitched[0]).toEqual([I, I, G, G]);
        expect(stitched[1]).toEqual([I, I, G, G]);
        expect(stitched[2]).toEqual([G, G, G, G]);
        expect(stitched[3]).toEqual([G, G, G, G]);
    });
});
