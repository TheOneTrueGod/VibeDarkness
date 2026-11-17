import { describe, expect, it } from 'vitest';
import { mirrorFourWays } from './placementSymmetry';

describe('mirrorFourWays', () => {
    it('mirrors a cell into all four quadrants around a cell corner', () => {
        const cells = mirrorFourWays([{ col: 12, row: 18, tag: 'a' }], { col: 21.5, row: 21.5 });
        expect(cells).toEqual([
            { col: 12, row: 18, tag: 'a' },
            { col: 31, row: 18, tag: 'a' },
            { col: 12, row: 25, tag: 'a' },
            { col: 31, row: 25, tag: 'a' },
        ]);
    });

    it('does not duplicate cells that sit on an axis', () => {
        const cells = mirrorFourWays([{ col: 5, row: 2 }, { col: 5, row: 5 }], { col: 5, row: 5 });
        expect(cells).toEqual([{ col: 5, row: 2 }, { col: 5, row: 5 }, { col: 5, row: 8 }]);
    });
});
