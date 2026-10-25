import { describe, expect, it } from 'vitest';
import { bezierLineCells, bezierPoint, bezierRoadCells } from './bezierRoad';

describe('bezierPoint', () => {
    it('starts and ends on the end control points', () => {
        const pts = [{ col: 0, row: 0 }, { col: 5, row: 10 }, { col: 10, row: 0 }];
        expect(bezierPoint(pts, 0)).toEqual({ col: 0, row: 0 });
        expect(bezierPoint(pts, 1)).toEqual({ col: 10, row: 0 });
        expect(bezierPoint(pts, 0.5)).toEqual({ col: 5, row: 5 });
    });
});

describe('bezierLineCells', () => {
    it('is a 4-connected line between the end cells with no repeats', () => {
        const cells = bezierLineCells([{ col: 0, row: 0 }, { col: 8, row: 0 }, { col: 8, row: 8 }, { col: 16, row: 8 }]);
        expect(cells[0]).toEqual({ col: 0, row: 0 });
        expect(cells[cells.length - 1]).toEqual({ col: 16, row: 8 });
        for (let i = 1; i < cells.length; i++) {
            expect(Math.abs(cells[i].col - cells[i - 1].col) + Math.abs(cells[i].row - cells[i - 1].row)).toBe(1);
        }
        expect(new Set(cells.map((c) => `${c.col},${c.row}`)).size).toBe(cells.length);
    });

    it('with two points is the straight line', () => {
        expect(bezierLineCells([{ col: 0, row: 0 }, { col: 3, row: 0 }])).toHaveLength(4);
    });

    it('rejects fewer than two points', () => {
        expect(() => bezierLineCells([{ col: 0, row: 0 }])).toThrow();
    });
});

describe('bezierRoadCells', () => {
    it('is deterministic', () => {
        const pts = [{ col: 1, row: 1 }, { col: 10.5, row: 2 }, { col: 4, row: 12 }];
        expect(bezierRoadCells(pts, 2)).toEqual(bezierRoadCells(pts, 2));
    });
});
