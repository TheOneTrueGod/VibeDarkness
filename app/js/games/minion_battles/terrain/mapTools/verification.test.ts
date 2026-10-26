import { describe, expect, it } from 'vitest';
import { terrainFromAscii } from './ascii';
import { edgeOpenings } from './edgeOpenings';
import { checkSeam } from './seamCheck';
import { findNarrowGaps, passageWidth } from './chokepoints';
import { lightCoverage } from './lightCoverage';

describe('edgeOpenings', () => {
    it('finds runs of passable cells on each edge', () => {
        const t = terrainFromAscii(['#..#', '#..#', '#...'].join('\n'));
        const north = edgeOpenings(t, ['north']);
        expect(north).toEqual([{ edge: 'north', cells: [{ col: 1, row: 0 }, { col: 2, row: 0 }] }]);
        expect(edgeOpenings(t, ['east'])).toEqual([{ edge: 'east', cells: [{ col: 3, row: 2 }] }]);
    });
});

describe('checkSeam', () => {
    it('passes when openings meet and reports where they do not', () => {
        const west = terrainFromAscii(['#.', '#.', '##'].join('\n'));
        const east = terrainFromAscii([',#', '##', '##'].join('\n'));
        const result = checkSeam(west, east, 'east');
        expect(result.ok).toBe(false);
        expect(result.mismatches.map((m) => m.index)).toEqual([1]);
        expect(result.typeChanges.map((m) => m.index)).toEqual([0]);
    });

    it('throws when edges differ in length', () => {
        expect(() => checkSeam(terrainFromAscii('..'), terrainFromAscii('.\n.'), 'east')).toThrow();
    });
});

describe('chokepoints', () => {
    const t = terrainFromAscii([
        '#.##',
        '#..#',
        '####',
    ].join('\n'));

    it('measures passage width along an axis', () => {
        expect(passageWidth(t, { col: 1, row: 1 }, 'horizontal')).toBe(2);
        expect(passageWidth(t, { col: 0, row: 0 }, 'horizontal')).toBe(0);
    });

    it('finds walled 1-wide gaps but not runs that reach the map edge', () => {
        const gaps = findNarrowGaps(t, 1);
        // (2,1) is walled above and below; (1,0)/(1,1) run north off the map, so vertical is open.
        expect(gaps).toContainEqual({ cell: { col: 2, row: 1 }, axis: 'vertical', width: 1 });
        expect(gaps).toContainEqual({ cell: { col: 1, row: 0 }, axis: 'horizontal', width: 1 });
        expect(gaps.some((g) => g.cell.col === 1 && g.axis === 'vertical')).toBe(false);
    });
});

describe('lightCoverage', () => {
    it('splits passable cells by distance to the lights', () => {
        const t = terrainFromAscii('......#');
        const { covered, uncovered } = lightCoverage(t, [{ col: 0, row: 0 }], 3);
        expect(covered.map((c) => c.col)).toEqual([0, 1, 2, 3]);
        expect(uncovered.map((c) => c.col)).toEqual([4, 5]);
    });
});
