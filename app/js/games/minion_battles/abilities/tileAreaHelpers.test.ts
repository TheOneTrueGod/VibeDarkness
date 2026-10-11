import { describe, expect, it } from 'vitest';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { cellsAlongSegment } from './tileAreaHelpers';

/** World point at the centre of tile (col, row). */
function centre(col: number, row: number): { x: number; y: number } {
    return { x: (col + 0.5) * CELL_SIZE, y: (row + 0.5) * CELL_SIZE };
}

function keys(cells: Array<{ col: number; row: number }>): string[] {
    return cells.map((c) => `${c.col},${c.row}`);
}

describe('cellsAlongSegment', () => {
    it('width 0, cardinal: every tile along the line, in order', () => {
        const cells = cellsAlongSegment(centre(0, 0), centre(3, 0));
        expect(keys(cells)).toEqual(['0,0', '1,0', '2,0', '3,0']);
    });

    it('width 0, cardinal in the negative direction', () => {
        const cells = cellsAlongSegment(centre(3, 2), centre(1, 2));
        expect(keys(cells)).toEqual(['3,2', '2,2', '1,2']);
    });

    it('width 0, shallow diagonal never skips a tile and has no duplicates', () => {
        const cells = cellsAlongSegment({ x: 5, y: 5 }, { x: 125, y: 45 });
        const k = keys(cells);
        expect(new Set(k).size).toBe(k.length);
        expect(k[0]).toBe('0,0');
        expect(k[k.length - 1]).toBe('3,1');
        // Consecutive tiles are always edge-adjacent for a line that avoids exact corners.
        for (let i = 1; i < cells.length; i++) {
            const d = Math.abs(cells[i]!.col - cells[i - 1]!.col) + Math.abs(cells[i]!.row - cells[i - 1]!.row);
            expect(d).toBe(1);
        }
    });

    it('width 0, exact corner crossing includes both diagonal neighbours', () => {
        const cells = cellsAlongSegment(centre(0, 0), centre(1, 1));
        expect(new Set(keys(cells))).toEqual(new Set(['0,0', '1,0', '0,1', '1,1']));
        expect(cells).toHaveLength(4);
    });

    it('width 0, zero-length segment gives the single tile', () => {
        expect(keys(cellsAlongSegment(centre(2, 3), centre(2, 3)))).toEqual(['2,3']);
    });

    it('width 18 along a tile row stays in that row', () => {
        const cells = cellsAlongSegment(centre(0, 1), centre(3, 1), 18);
        expect(new Set(keys(cells))).toEqual(new Set(['0,1', '1,1', '2,1', '3,1']));
    });

    it('width 18 on a tile edge reaches both rows', () => {
        // y = 40 is the boundary between rows 0 and 1.
        const cells = cellsAlongSegment({ x: 20, y: 40 }, { x: 140, y: 40 }, 18);
        expect(new Set(keys(cells))).toEqual(
            new Set(['0,0', '1,0', '2,0', '3,0', '0,1', '1,1', '2,1', '3,1']),
        );
    });

    it('width 40 reaches the neighbouring rows', () => {
        const cells = cellsAlongSegment(centre(0, 1), centre(2, 1), 40);
        const k = new Set(keys(cells));
        for (let col = 0; col <= 2; col++) {
            expect(k.has(`${col},0`)).toBe(true);
            expect(k.has(`${col},1`)).toBe(true);
            expect(k.has(`${col},2`)).toBe(true);
        }
    });

    it('width > 0 is deterministic and has no duplicates', () => {
        const a = cellsAlongSegment({ x: 10, y: 10 }, { x: 150, y: 90 }, 18);
        const b = cellsAlongSegment({ x: 10, y: 10 }, { x: 150, y: 90 }, 18);
        expect(keys(a)).toEqual(keys(b));
        expect(new Set(keys(a)).size).toBe(a.length);
    });

    it('width > 0, zero-length segment covers the tiles within the radius', () => {
        const cells = cellsAlongSegment(centre(2, 2), centre(2, 2), 18);
        expect(keys(cells)).toEqual(['2,2']);
    });
});
