import { describe, expect, it } from 'vitest';
import type { SegmentGridMapBackgroundDef } from '../../../../storylines/types';
import { TERRAIN_PROPERTIES, TerrainType } from '../../../../terrain/TerrainType';
import {
    SEGMENT_GRID_BACKGROUND_DEFAULT_OPACITY,
    buildSegmentGridBackground,
    type SegmentGridSource,
} from './segmentGridBackground';

function segment(gridCol: number, gridRow: number, fill: TerrainType, size = 4): SegmentGridSource {
    return {
        gridCol,
        gridRow,
        width: size,
        height: size,
        terrain: Array.from({ length: size }, () => new Array<number>(size).fill(fill)),
    };
}

const DEF: SegmentGridMapBackgroundDef = {
    kind: 'segmentGrid',
    col0: 10,
    row0: 20,
    cols: 2,
    rows: 1,
    tilePx: 40,
    originX: 100,
    originY: 200,
};

describe('buildSegmentGridBackground', () => {
    it('merges one-colour runs across a 2x1 block and reports the block bounds', () => {
        const bg = buildSegmentGridBackground(DEF, [segment(10, 20, TerrainType.Grass), segment(11, 20, TerrainType.Grass)], 4);
        // One rect per pixel row, spanning both tiles.
        expect(bg.rects).toHaveLength(4);
        for (const [i, rect] of bg.rects.entries()) {
            expect(rect).toEqual({ x: 100, y: 200 + i * 10, width: 80, height: 10, fill: TERRAIN_PROPERTIES[TerrainType.Grass].color });
        }
        expect(bg.bounds).toEqual({ x: 100, y: 200, width: 80, height: 40 });
        expect(bg.opacity).toBe(SEGMENT_GRID_BACKGROUND_DEFAULT_OPACITY);
    });

    it('splits runs where the terrain changes at a seam', () => {
        const bg = buildSegmentGridBackground(DEF, [segment(10, 20, TerrainType.Grass), segment(11, 20, TerrainType.Brick)], 4);
        expect(bg.rects).toHaveLength(8);
        const brick = bg.rects.filter((r) => r.fill === TERRAIN_PROPERTIES[TerrainType.Brick].color);
        expect(brick).toHaveLength(4);
        expect(brick.every((r) => r.x === 140 && r.width === 40)).toBe(true);
    });

    it('skips missing addresses and segments outside the block', () => {
        const bg = buildSegmentGridBackground(
            { ...DEF, opacity: 0.3 },
            [segment(11, 20, TerrainType.Rock), segment(12, 20, TerrainType.Water), segment(10, 21, TerrainType.Water)],
            4,
        );
        expect(bg.rects).toHaveLength(4);
        expect(bg.rects.every((r) => r.x === 140 && r.width === 40 && r.fill === TERRAIN_PROPERTIES[TerrainType.Rock].color)).toBe(true);
        expect(bg.bounds).toEqual({ x: 100, y: 200, width: 80, height: 40 });
        expect(bg.opacity).toBe(0.3);
    });

    it('draws nothing when no segment is in the block', () => {
        expect(buildSegmentGridBackground(DEF, [], 4).rects).toEqual([]);
    });

    it('keeps the first segment registered at an address', () => {
        const bg = buildSegmentGridBackground(
            { ...DEF, cols: 1 },
            [segment(10, 20, TerrainType.Dirt), segment(10, 20, TerrainType.Water)],
            4,
        );
        expect(bg.rects.every((r) => r.fill === TERRAIN_PROPERTIES[TerrainType.Dirt].color)).toBe(true);
    });
});

describe('chapter 3 castle background', () => {
    it('draws every registered segment in 58-64 x 43-50 and nothing at empty addresses', async () => {
        const { registerWorldOfDarknessSegments } = await import('../../../../storylines/WorldOfDarkness/registerSegments');
        const { listSegments } = await import('../../../../terrain/segmentRegistry');
        const { WOD_CH3_MAP_BACKGROUND: def } = await import('../../../../storylines/WorldOfDarkness/chapter3Map');
        registerWorldOfDarknessSegments();

        const bg = buildSegmentGridBackground(def, listSegments());
        const drawn = new Set<string>();
        for (const r of bg.rects) {
            // Runs can span tiles; mark every tile the rect touches.
            const row = def.row0 + Math.floor((r.y - def.originY) / def.tilePx);
            const first = Math.floor((r.x - def.originX) / def.tilePx);
            const last = Math.ceil((r.x + r.width - def.originX) / def.tilePx) - 1;
            for (let c = first; c <= last; c++) drawn.add(`${def.col0 + c}_${row}`);
        }
        const registered = new Set(
            listSegments()
                .filter((s) => s.gridCol >= 58 && s.gridCol <= 64 && s.gridRow >= 43 && s.gridRow <= 50)
                .map((s) => `${s.gridCol}_${s.gridRow}`),
        );
        expect(registered.has('59_50')).toBe(true);
        expect(registered.has('60_50')).toBe(true);
        expect(registered.has('61_50')).toBe(true);
        // The whole castle (7 x 7) plus the cave road.
        expect(registered.size).toBe(49 + 3);
        expect(drawn).toEqual(registered);
        expect(bg.bounds).toEqual({ x: 0, y: 0, width: 7 * 120, height: 8 * 120 });
    });
});
