import { describe, expect, it } from 'vitest';
import { mirrorCells, mirrorTerrain } from './mirror';
import { terrainFromAscii, terrainToAscii } from './ascii';

describe('mirrorCells', () => {
    it('adds the mirror images for each mode', () => {
        const cell = [{ col: 1, row: 0 }];
        expect(mirrorCells(cell, 5, 4, 'none')).toEqual([{ col: 1, row: 0 }]);
        expect(mirrorCells(cell, 5, 4, 'horizontal')).toEqual([{ col: 1, row: 0 }, { col: 3, row: 0 }]);
        expect(mirrorCells(cell, 5, 4, 'vertical')).toEqual([{ col: 1, row: 0 }, { col: 1, row: 3 }]);
        expect(mirrorCells(cell, 5, 4, 'both')).toHaveLength(4);
    });

    it('does not duplicate cells on the centre line', () => {
        expect(mirrorCells([{ col: 2, row: 0 }], 5, 4, 'horizontal')).toEqual([{ col: 2, row: 0 }]);
    });
});

describe('mirrorTerrain', () => {
    const src = terrainFromAscii([
        '#.,"',
        '..,,',
        ',,,,',
    ].join('\n'));

    it('copies the left half over the right', () => {
        expect(terrainToAscii(mirrorTerrain(src, 'horizontal'))).toBe(['#..#', '....', ',,,,'].join('\n'));
    });

    it('copies the top half over the bottom, keeping an odd centre row', () => {
        expect(terrainToAscii(mirrorTerrain(src, 'vertical'))).toBe(['#.,"', '..,,', '#.,"'].join('\n'));
    });

    it('copies the top-left quarter everywhere for both', () => {
        expect(terrainToAscii(mirrorTerrain(src, 'both'))).toBe(['#..#', '....', '#..#'].join('\n'));
    });

    it('leaves terrain alone for none', () => {
        expect(mirrorTerrain(src, 'none')).toBe(src);
    });
});
