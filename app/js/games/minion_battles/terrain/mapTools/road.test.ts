import { describe, expect, it } from 'vitest';
import { TerrainType } from '../TerrainType';
import { lineCells, paintRoad, roadCells } from './road';
import type { GridCell } from './paintCells';

function isFourConnected(cells: GridCell[]): boolean {
    return cells.every((c, i) => i === 0 || Math.abs(c.col - cells[i - 1].col) + Math.abs(c.row - cells[i - 1].row) === 1);
}

describe('lineCells', () => {
    it('includes both ends and steps one axis at a time', () => {
        const cells = lineCells({ col: 0, row: 0 }, { col: 5, row: 3 });
        expect(cells[0]).toEqual({ col: 0, row: 0 });
        expect(cells[cells.length - 1]).toEqual({ col: 5, row: 3 });
        expect(cells).toHaveLength(5 + 3 + 1);
        expect(isFourConnected(cells)).toBe(true);
    });

    it('handles reversed, straight and zero-length lines', () => {
        expect(lineCells({ col: 3, row: 2 }, { col: 0, row: 2 })).toEqual([
            { col: 3, row: 2 }, { col: 2, row: 2 }, { col: 1, row: 2 }, { col: 0, row: 2 },
        ]);
        expect(lineCells({ col: 1, row: 1 }, { col: 1, row: 1 })).toEqual([{ col: 1, row: 1 }]);
    });
});

describe('roadCells', () => {
    it('a horizontal road of thickness 3 is 3 rows tall', () => {
        const cells = roadCells({ col: 2, row: 5 }, { col: 6, row: 5 }, 3);
        expect(new Set(cells.map((c) => c.row))).toEqual(new Set([4, 5, 6]));
        expect(cells).toHaveLength(3 * 7);
    });
});

describe('paintRoad', () => {
    it('paints a diagonal road corner to corner', () => {
        const G = TerrainType.Grass;
        const terrain = Array.from({ length: 4 }, () => [G, G, G, G]);
        const out = paintRoad(terrain, { col: 0, row: 0 }, { col: 3, row: 3 }, 1, TerrainType.Dirt);
        expect(out[0][0]).toBe(TerrainType.Dirt);
        expect(out[3][3]).toBe(TerrainType.Dirt);
        expect(out.flat().filter((t) => t === TerrainType.Dirt)).toHaveLength(7);
    });
});
