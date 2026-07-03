import { describe, expect, it } from 'vitest';
import { computeLightGrid, type LightSource } from './LightGrid';

const GRID_W = 5;
const GRID_H = 5;
const CENTER_COL = 2;
const CENTER_ROW = 2;

function tileLevel(
    sources: LightSource[],
    col = CENTER_COL,
    row = CENTER_ROW,
    globalLightLevel = 0,
): number {
    return computeLightGrid(globalLightLevel, GRID_W, GRID_H, sources)[row]![col]!;
}

describe('computeLightGrid base overlap', () => {
    it('stacks two base sources additively on the same tile', () => {
        const sources: LightSource[] = [
            { col: CENTER_COL, row: CENTER_ROW, emission: -1, radius: 0, overlapMethod: { method: 'base' } },
            { col: CENTER_COL, row: CENTER_ROW, emission: -1, radius: 0, overlapMethod: { method: 'base' } },
        ];
        expect(tileLevel(sources)).toBe(-2);
    });

    it('applies base before max/add dynamic sources', () => {
        const sources: LightSource[] = [
            { col: CENTER_COL, row: CENTER_ROW, emission: -1, radius: 0, overlapMethod: { method: 'base' } },
            { col: CENTER_COL, row: CENTER_ROW, emission: 5, radius: 0, overlapMethod: { method: 'max' } },
        ];
        expect(tileLevel(sources)).toBe(4);
    });

    it('excludes base sources from max/add combineLightGroup', () => {
        const sources: LightSource[] = [
            { col: CENTER_COL, row: CENTER_ROW, emission: -1, radius: 0, overlapMethod: { method: 'base' } },
            { col: CENTER_COL, row: CENTER_ROW, emission: 3, radius: 0, overlapMethod: { method: 'max' } },
            { col: CENTER_COL, row: CENTER_ROW, emission: 2, radius: 0, overlapMethod: { method: 'add' } },
        ];
        // base -1; max/add pool sums 3 + 2 (both in pool when max is included)
        expect(tileLevel(sources)).toBe(4);
    });
});
