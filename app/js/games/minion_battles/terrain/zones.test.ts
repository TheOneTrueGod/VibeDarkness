import { describe, it, expect } from 'vitest';
import { resolveZoneTiles, isTileInZone, offsetZone } from './zones';
import type { MapSegmentZone } from './segmentSchema';

describe('resolveZoneTiles', () => {
    it('box: returns every tile in the inclusive rect', () => {
        const zone: MapSegmentZone = { id: 'z', shape: 'box', topLeft: { col: 7, row: 8 }, bottomRight: { col: 11, row: 12 } };
        const tiles = resolveZoneTiles(zone);
        expect(tiles).toHaveLength(25);
        expect(tiles).toContainEqual({ col: 7, row: 8 });
        expect(tiles).toContainEqual({ col: 11, row: 12 });
        expect(tiles).toContainEqual({ col: 9, row: 10 });
    });

    it('box: normalizes corners given in reverse order', () => {
        const forward: MapSegmentZone = { id: 'z', shape: 'box', topLeft: { col: 1, row: 1 }, bottomRight: { col: 5, row: 5 } };
        const reversed: MapSegmentZone = { id: 'z', shape: 'box', topLeft: { col: 5, row: 5 }, bottomRight: { col: 1, row: 1 } };
        expect(resolveZoneTiles(reversed)).toEqual(resolveZoneTiles(forward));
    });

    it('box: 1x1 degenerate box resolves to exactly its own tile', () => {
        const zone: MapSegmentZone = { id: 'z', shape: 'box', topLeft: { col: 4, row: 4 }, bottomRight: { col: 4, row: 4 } };
        expect(resolveZoneTiles(zone)).toEqual([{ col: 4, row: 4 }]);
    });

    it('circle: excludes the bounding box corners of a square zone', () => {
        const zone: MapSegmentZone = { id: 'z', shape: 'circle', topLeft: { col: 0, row: 0 }, bottomRight: { col: 4, row: 4 } };
        const tiles = resolveZoneTiles(zone);
        expect(tiles).toContainEqual({ col: 2, row: 2 });
        expect(tiles).not.toContainEqual({ col: 0, row: 0 });
        expect(tiles).not.toContainEqual({ col: 4, row: 0 });
        expect(tiles).not.toContainEqual({ col: 0, row: 4 });
        expect(tiles).not.toContainEqual({ col: 4, row: 4 });
        expect(tiles.length).toBeLessThan(25);
        expect(tiles.length).toBeGreaterThan(0);
    });

    it('circle: inscribed ellipse stretches to fit a non-square box', () => {
        const zone: MapSegmentZone = { id: 'z', shape: 'circle', topLeft: { col: 0, row: 0 }, bottomRight: { col: 6, row: 2 } };
        const tiles = resolveZoneTiles(zone);
        // Wide/short box: the horizontal extremes should be included (ellipse stretched along x),
        // but the far top/bottom corners should not.
        expect(tiles).toContainEqual({ col: 3, row: 1 });
        expect(tiles).not.toContainEqual({ col: 0, row: 0 });
        expect(tiles).not.toContainEqual({ col: 6, row: 2 });
    });

    it('circle: 1x1 degenerate box still resolves to its own tile', () => {
        const zone: MapSegmentZone = { id: 'z', shape: 'circle', topLeft: { col: 4, row: 4 }, bottomRight: { col: 4, row: 4 } };
        expect(resolveZoneTiles(zone)).toEqual([{ col: 4, row: 4 }]);
    });
});

describe('isTileInZone', () => {
    it('agrees with resolveZoneTiles for both shapes', () => {
        const box: MapSegmentZone = { id: 'z', shape: 'box', topLeft: { col: 0, row: 0 }, bottomRight: { col: 3, row: 3 } };
        const circle: MapSegmentZone = { id: 'z', shape: 'circle', topLeft: { col: 0, row: 0 }, bottomRight: { col: 4, row: 4 } };
        for (const zone of [box, circle]) {
            const tiles = new Set(resolveZoneTiles(zone).map((t) => `${t.col},${t.row}`));
            for (let row = -1; row <= 5; row++) {
                for (let col = -1; col <= 5; col++) {
                    expect(isTileInZone(zone, col, row)).toBe(tiles.has(`${col},${row}`));
                }
            }
        }
    });
});

describe('offsetZone', () => {
    it('shifts both corners by the given delta and preserves id/shape', () => {
        const zone: MapSegmentZone = { id: 'outside of cave mouth', shape: 'box', topLeft: { col: 7, row: 8 }, bottomRight: { col: 11, row: 12 } };
        const shifted = offsetZone(zone, 22, 0);
        expect(shifted).toEqual({
            id: 'outside of cave mouth',
            shape: 'box',
            topLeft: { col: 29, row: 8 },
            bottomRight: { col: 33, row: 12 },
        });
    });
});
