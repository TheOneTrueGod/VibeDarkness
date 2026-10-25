import { describe, expect, it } from 'vitest';
import { TerrainType } from '../TerrainType';
import { findPath } from './findPath';
import { fillRect } from './fillRect';

const G = TerrainType.Grass;
const R = TerrainType.Rock;

function grid(width: number, height: number): TerrainType[][] {
    return Array.from({ length: height }, () => Array.from({ length: width }, () => G));
}

describe('findPath', () => {
    it('goes around a wall through the gap', () => {
        // Vertical wall at col 3 with a gap at row 4.
        let terrain = fillRect(grid(7, 5), { col: 3, row: 0 }, { col: 3, row: 3 }, R);
        const path = findPath(terrain, { col: 0, row: 0 }, { col: 6, row: 0 });
        expect(path).not.toBeNull();
        expect(path!.cells[0]).toEqual({ col: 0, row: 0 });
        expect(path!.cells[path!.cells.length - 1]).toEqual({ col: 6, row: 0 });
        expect(path!.cells).toContainEqual({ col: 3, row: 4 });
        expect(path!.cells.every((c) => terrain[c.row][c.col] !== R)).toBe(true);

        terrain = fillRect(terrain, { col: 3, row: 4 }, { col: 3, row: 4 }, R);
        expect(findPath(terrain, { col: 0, row: 0 }, { col: 6, row: 0 })).toBeNull();
    });

    it('measures diagonal steps as √2', () => {
        const path = findPath(grid(4, 4), { col: 0, row: 0 }, { col: 3, row: 3 });
        expect(path!.length).toBeCloseTo(3 * Math.SQRT2);
    });

    it('returns null for blocked or out-of-bounds ends', () => {
        const terrain = fillRect(grid(3, 3), { col: 0, row: 0 }, { col: 0, row: 0 }, R);
        expect(findPath(terrain, { col: 0, row: 0 }, { col: 2, row: 2 })).toBeNull();
        expect(findPath(terrain, { col: 1, row: 1 }, { col: 5, row: 5 })).toBeNull();
        expect(findPath(terrain, { col: 1, row: 1 }, { col: 1, row: 1 })!.cells).toHaveLength(1);
    });
});
