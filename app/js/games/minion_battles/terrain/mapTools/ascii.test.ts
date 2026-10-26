import { describe, expect, it } from 'vitest';
import { TerrainType } from '../TerrainType';
import { terrainFromAscii, terrainToAscii, terrainToTsRows } from './ascii';

const SKETCH = ['#..#', ',"",', '....'].join('\n');

describe('ascii', () => {
    it('round-trips terrain through text', () => {
        expect(terrainToAscii(terrainFromAscii(SKETCH))).toBe(SKETCH);
    });

    it('draws marks over terrain and numbers rows', () => {
        const out = terrainToAscii(terrainFromAscii(SKETCH), {
            marks: [{ char: '*', cells: [{ col: 1, row: 2 }, { col: 99, row: 0 }] }],
            rowNumbers: true,
        });
        expect(out.split('\n')[2]).toBe('2 .*..');
    });

    it('maps sketch-only characters through extra', () => {
        expect(terrainFromAscii('.C.', { C: TerrainType.Dirt })[0]).toEqual([
            TerrainType.Dirt, TerrainType.Dirt, TerrainType.Dirt,
        ]);
    });

    it('rejects unknown characters and ragged rows', () => {
        expect(() => terrainFromAscii('.x.')).toThrow(/unknown 'x'/);
        expect(() => terrainFromAscii('..\n.')).toThrow(/row 1/);
    });

    it('writes segment-file rows', () => {
        expect(terrainToTsRows(terrainFromAscii('#.,"'))).toBe('    [R, D, _, T],');
    });
});
