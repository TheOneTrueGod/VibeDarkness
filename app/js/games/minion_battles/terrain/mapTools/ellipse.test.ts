import { describe, expect, it } from 'vitest';
import { ellipseCells } from './ellipse';
import { resolveZoneTiles } from '../zones';

describe('ellipseCells', () => {
    it('matches a circle zone over the same box', () => {
        const a = { col: 2, row: 1 };
        const b = { col: 9, row: 6 };
        expect(ellipseCells(a, b)).toEqual(resolveZoneTiles({ id: 'z', shape: 'circle', topLeft: a, bottomRight: b }));
    });

    it('is symmetric and excludes the box corners', () => {
        const cells = ellipseCells({ col: 0, row: 0 }, { col: 6, row: 4 });
        const keys = new Set(cells.map((c) => `${c.col},${c.row}`));
        expect(keys.has('0,0')).toBe(false);
        expect(keys.has('3,2')).toBe(true);
        for (const c of cells) expect(keys.has(`${6 - c.col},${4 - c.row}`)).toBe(true);
    });
});
