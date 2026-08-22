import { describe, expect, it } from 'vitest';
import { TerrainType } from './TerrainType';
import {
    MARCHING_SQUARE_ALL,
    MARCHING_SQUARE_BL,
    MARCHING_SQUARE_BR,
    MARCHING_SQUARE_LEFT,
    MARCHING_SQUARE_NONE,
    MARCHING_SQUARE_TL,
    MARCHING_SQUARE_TR,
    marchingSquareCase,
} from './MarchingSquaresLayerRenderer';

const R = TerrainType.Rock;
const D = TerrainType.Dirt;
const G = TerrainType.Grass;

function gridLookup(cells: TerrainType[][]): {
    getTypeAt: (c: number, r: number) => TerrainType;
    isInBounds: (c: number, r: number) => boolean;
} {
    const height = cells.length;
    const width = cells[0]!.length;
    return {
        getTypeAt: (c, r) => {
            if (c < 0 || r < 0 || c >= width || r >= height) return TerrainType.Rock;
            return cells[r]![c]!;
        },
        isInBounds: (c, r) => c >= 0 && r >= 0 && c < width && r < height,
    };
}

function dirtCase(cells: TerrainType[][], col: number, row: number): number {
    const { getTypeAt, isInBounds } = gridLookup(cells);
    return marchingSquareCase(col, row, TerrainType.Dirt, getTypeAt, isInBounds);
}

describe('marchingSquareCase dirt bleed', () => {
    it('keeps a vertical half-cell blend on grass east of dirt when no rock is adjacent', () => {
        const cells = [
            [G, G, G],
            [G, D, G],
            [G, G, G],
        ];
        expect(dirtCase(cells, 1, 1)).toBe(MARCHING_SQUARE_ALL);
        expect(dirtCase(cells, 2, 1)).toBe(MARCHING_SQUARE_LEFT);
        expect(dirtCase(cells, 2, 0)).toBe(MARCHING_SQUARE_BL);
        expect(dirtCase(cells, 2, 2)).toBe(MARCHING_SQUARE_TL);
    });

    it('does not treat a rock face as adjacent on the grass/dirt edge', () => {
        // Cave mouth: dirt sandwiched by rock, grass to the east.
        const cells = [
            [R, G],
            [D, G],
            [R, G],
        ];
        expect(dirtCase(cells, 0, 1)).toBe(MARCHING_SQUARE_ALL);
        expect(dirtCase(cells, 1, 1)).toBe(MARCHING_SQUARE_NONE);
        // Dirt only shares vertices with the rock; those are ignored (no open-side dirt).
        expect(dirtCase(cells, 1, 0)).toBe(MARCHING_SQUARE_NONE);
        expect(dirtCase(cells, 1, 2)).toBe(MARCHING_SQUARE_NONE);
    });

    it('puts the dirt triangle on the open side of grass when a path meets a west wall', () => {
        const cells = [
            [R, G, G],
            [D, D, D],
            [R, D, D],
            [R, G, G],
        ];
        expect(dirtCase(cells, 1, 1)).toBe(MARCHING_SQUARE_ALL);
        // Horizontal flip of a rock-adjacent SW / NW triangle: SE and NE.
        expect(dirtCase(cells, 1, 0)).toBe(MARCHING_SQUARE_BR);
        expect(dirtCase(cells, 1, 3)).toBe(MARCHING_SQUARE_TR);
    });

    it('puts the dirt triangle on the open side of grass when a path meets an east wall', () => {
        const cells = [
            [G, G, R],
            [D, D, D],
            [D, D, R],
            [G, G, R],
        ];
        expect(dirtCase(cells, 1, 0)).toBe(MARCHING_SQUARE_BL);
        expect(dirtCase(cells, 1, 3)).toBe(MARCHING_SQUARE_TL);
    });

    it('ignores rock-corner dirt when the wall is north or south', () => {
        const northRock = [
            [R, R, R],
            [G, D, D],
            [G, D, G],
        ];
        expect(dirtCase(northRock, 0, 1)).toBe(MARCHING_SQUARE_BR);

        const southRock = [
            [G, D, G],
            [G, D, D],
            [R, R, R],
        ];
        expect(dirtCase(southRock, 0, 1)).toBe(MARCHING_SQUARE_TR);
    });
});
