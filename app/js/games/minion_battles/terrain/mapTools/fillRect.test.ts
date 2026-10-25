import { describe, expect, it } from 'vitest';
import { TerrainType } from '../TerrainType';
import { fillRect, rectCells } from './fillRect';
import { brushCells, paintCells } from './paintCells';

const G = TerrainType.Grass;
const R = TerrainType.Rock;

function grid(width: number, height: number, type = G): TerrainType[][] {
    return Array.from({ length: height }, () => Array.from({ length: width }, () => type));
}

describe('rectCells', () => {
    it('covers the rectangle inclusively, corners in either order', () => {
        expect(rectCells({ col: 2, row: 1 }, { col: 1, row: 2 })).toEqual([
            { col: 1, row: 1 }, { col: 2, row: 1 },
            { col: 1, row: 2 }, { col: 2, row: 2 },
        ]);
    });
});

describe('fillRect', () => {
    it('fills the rectangle and clips to the grid without mutating the input', () => {
        const before = grid(4, 3);
        const after = fillRect(before, { col: 2, row: 1 }, { col: 9, row: 9 }, R);
        expect(after).toEqual([
            [G, G, G, G],
            [G, G, R, R],
            [G, G, R, R],
        ]);
        expect(before).toEqual(grid(4, 3));
        expect(after[0]).toBe(before[0]);
    });
});

describe('paintCells', () => {
    it('returns the same array when nothing changes', () => {
        const terrain = grid(3, 3);
        expect(paintCells(terrain, [{ col: 1, row: 1 }], G)).toBe(terrain);
    });
});

describe('brushCells', () => {
    it('matches the editor brush footprint', () => {
        expect(brushCells({ col: 5, row: 5 }, 1)).toEqual([{ col: 5, row: 5 }]);
        expect(brushCells({ col: 5, row: 5 }, 2)).toHaveLength(4);
        expect(brushCells({ col: 5, row: 5 }, 3)[0]).toEqual({ col: 4, row: 4 });
    });
});
