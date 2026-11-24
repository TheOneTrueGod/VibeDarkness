import { describe, expect, it } from 'vitest';
import { GRAVEL_VARIANT_COUNT, GRAVEL_VARIANTS, gravelCellLook } from './gravelSpeckle';
import { TERRAIN_PROPERTIES, TerrainType } from './TerrainType';

describe('gravel speckle', () => {
    it('is the Gravel hard-edge pattern', () => {
        expect(TERRAIN_PROPERTIES[TerrainType.Gravel].hardEdgePattern).toBe('speckle');
    });

    it('looks the same for the same cell every time', () => {
        expect(gravelCellLook(12, 34)).toEqual(gravelCellLook(12, 34));
    });

    it('varies across the grid: every layout, both mirrors and both tints appear', () => {
        const looks = [];
        for (let col = 0; col < 24; col++) for (let row = 0; row < 24; row++) looks.push(gravelCellLook(col, row));
        expect(new Set(looks.map((l) => l.variant)).size).toBe(GRAVEL_VARIANT_COUNT);
        expect(new Set(looks.map((l) => `${l.variant}${l.flipX}${l.flipY}`)).size).toBeGreaterThan(GRAVEL_VARIANT_COUNT * 3);
        expect(looks.some((l) => l.tint > 0.2)).toBe(true);
        expect(looks.some((l) => l.tint < -0.2)).toBe(true);
    });

    it('rarely repeats the same layout and mirroring between neighbouring cells', () => {
        let same = 0;
        let pairs = 0;
        for (let col = 0; col < 40; col++) {
            for (let row = 0; row < 40; row++) {
                const a = gravelCellLook(col, row);
                const b = gravelCellLook(col + 1, row);
                pairs++;
                if (a.variant === b.variant && a.flipX === b.flipX && a.flipY === b.flipY) same++;
            }
        }
        expect(same / pairs).toBeLessThan(0.08);
    });

    it('keeps every chip inside its cell, with distinct layouts', () => {
        for (const chips of GRAVEL_VARIANTS) {
            for (const chip of chips) {
                expect(chip.x - chip.r).toBeGreaterThanOrEqual(0);
                expect(chip.x + chip.r).toBeLessThanOrEqual(1);
                expect(chip.y - chip.r).toBeGreaterThanOrEqual(0);
                expect(chip.y + chip.r).toBeLessThanOrEqual(1);
            }
        }
        expect(new Set(GRAVEL_VARIANTS.map((c) => JSON.stringify(c))).size).toBe(GRAVEL_VARIANT_COUNT);
    });
});
