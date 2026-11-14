import { describe, expect, it } from 'vitest';
import { TerrainType } from '../TerrainType';
import { terrainFromAscii, terrainToAscii } from './ascii';
import { segmentAddress, segmentBlockCell, sliceSegmentBlock, stitchSegmentBlock } from './segmentBlock';

const NW = terrainFromAscii(['#.', '..'].join('\n'));
const NE = terrainFromAscii([',,', ',#'].join('\n'));
const SW = terrainFromAscii(['~~', '::'].join('\n'));
const SE = terrainFromAscii(['%%', '%B'].join('\n'));

const byAddress = new Map([
    [segmentAddress(10, 20), NW],
    [segmentAddress(11, 20), NE],
    [segmentAddress(10, 21), SW],
    [segmentAddress(11, 21), SE],
]);

describe('stitchSegmentBlock', () => {
    it('places segments by grid address', () => {
        const canvas = stitchSegmentBlock(byAddress, 10, 20, 2, 2);
        expect(terrainToAscii(canvas)).toBe(['#.,,', '..,#', '~~%%', '::%B'].join('\n'));
    });

    it('stitches a sub-block from any origin', () => {
        expect(terrainToAscii(stitchSegmentBlock(byAddress, 11, 20, 1, 2))).toBe([',,', ',#', '%%', '%B'].join('\n'));
    });

    it('throws on a missing segment unless a fill is given', () => {
        expect(() => stitchSegmentBlock(byAddress, 10, 20, 3, 1)).toThrow(/12_20/);
        const filled = stitchSegmentBlock(byAddress, 10, 20, 3, 1, { fill: TerrainType.Impassable });
        expect(filled[0].slice(4)).toEqual([TerrainType.Impassable, TerrainType.Impassable]);
    });

    it('throws when a segment has the wrong size', () => {
        const odd = new Map([...byAddress, [segmentAddress(12, 20), terrainFromAscii('...')]]);
        expect(() => stitchSegmentBlock(odd, 10, 20, 3, 1)).toThrow(/not 2x2/);
    });
});

describe('sliceSegmentBlock', () => {
    it('round-trips a stitched block', () => {
        const canvas = stitchSegmentBlock(byAddress, 10, 20, 2, 2);
        const sliced = sliceSegmentBlock(canvas, 10, 20, 2, 2);
        expect([...sliced.keys()].sort()).toEqual([...byAddress.keys()].sort());
        for (const [address, grid] of byAddress) expect(sliced.get(address)).toEqual(grid);
    });

    it('returns copies, so painting a slice leaves the canvas alone', () => {
        const canvas = stitchSegmentBlock(byAddress, 10, 20, 2, 2);
        sliceSegmentBlock(canvas, 10, 20, 2, 2).get('10_20')![0][0] = TerrainType.Water;
        expect(canvas[0][0]).toBe(TerrainType.Rock);
    });

    it('carries canvas edits into the right segment', () => {
        const canvas = stitchSegmentBlock(byAddress, 10, 20, 2, 2);
        const cell = segmentBlockCell({ col0: 10, row0: 20 }, 2, 11, 21, { col: 1, row: 1 });
        expect(cell).toEqual({ col: 3, row: 3 });
        canvas[cell.row][cell.col] = TerrainType.Dirt;
        expect(sliceSegmentBlock(canvas, 10, 20, 2, 2).get('11_21')).toEqual(terrainFromAscii(['%%', '%.'].join('\n')));
    });

    it('throws when the canvas does not divide into the block', () => {
        expect(() => sliceSegmentBlock(terrainFromAscii(['...', '...'].join('\n')), 0, 0, 2, 1)).toThrow();
    });
});
