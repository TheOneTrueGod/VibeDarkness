import { describe, expect, it } from 'vitest';
import { computeLightChannelGrid, computeLightGrid, type LightSource } from './LightGrid';
import { pickRenderLightType, emptyLightTypeIntensities } from './lighting/lightTypes';

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

describe('computeLightChannelGrid typed emission', () => {
    it('keeps DayLight flat within radius and puts falloff on FireLight', () => {
        const sources: LightSource[] = [
            { col: CENTER_COL, row: CENTER_ROW, emission: 5, radius: 1, lightType: 'DayLight' },
        ];
        const result = computeLightChannelGrid(0, GRID_W, GRID_H, sources);

        expect(result.channels.DayLight[CENTER_ROW]![CENTER_COL]).toBe(5);
        expect(result.channels.FireLight[CENTER_ROW]![CENTER_COL]).toBe(0);
        expect(result.visibility[CENTER_ROW]![CENTER_COL]).toBe(5);

        // Distance 2 from center: falloff = 2-1 = 1 → FireLight 4
        expect(result.channels.DayLight[CENTER_ROW]![CENTER_COL + 2]).toBe(0);
        expect(result.channels.FireLight[CENTER_ROW]![CENTER_COL + 2]).toBe(4);
        expect(result.visibility[CENTER_ROW]![CENTER_COL + 2]).toBe(4);
    });

    it('uses max across channels for visibility when types differ', () => {
        const sources: LightSource[] = [
            { col: CENTER_COL, row: CENTER_ROW, emission: 5, radius: 0, lightType: 'DayLight' },
            { col: CENTER_COL, row: CENTER_ROW, emission: 3, radius: 0, lightType: 'FireLight' },
        ];
        const result = computeLightChannelGrid(0, GRID_W, GRID_H, sources);
        expect(result.channels.DayLight[CENTER_ROW]![CENTER_COL]).toBe(5);
        expect(result.channels.FireLight[CENTER_ROW]![CENTER_COL]).toBe(3);
        expect(result.visibility[CENTER_ROW]![CENTER_COL]).toBe(5);
    });

    it('keeps void darkness untyped and subtracts from visibility', () => {
        const sources: LightSource[] = [
            { col: CENTER_COL, row: CENTER_ROW, emission: 5, radius: 0, lightType: 'LanternLight' },
            { col: CENTER_COL, row: CENTER_ROW, emission: -2, radius: 0, lightType: 'DarkLight' },
        ];
        const result = computeLightChannelGrid(0, GRID_W, GRID_H, sources);
        expect(result.channels.LanternLight[CENTER_ROW]![CENTER_COL]).toBe(5);
        expect(result.channels.DarkLight[CENTER_ROW]![CENTER_COL]).toBe(0);
        expect(result.voidDarkness[CENTER_ROW]![CENTER_COL]).toBe(-2);
        expect(result.visibility[CENTER_ROW]![CENTER_COL]).toBe(3);
    });
});

describe('pickRenderLightType', () => {
    it('prefers DayLight over Lantern and Fire', () => {
        const intensities = emptyLightTypeIntensities();
        intensities.DayLight = 2;
        intensities.LanternLight = 9;
        intensities.FireLight = 9;
        expect(pickRenderLightType(intensities)).toBe('DayLight');
    });

    it('picks higher intensity between LanternLight and DarkLight', () => {
        const intensities = emptyLightTypeIntensities();
        intensities.LanternLight = 3;
        intensities.DarkLight = 5;
        expect(pickRenderLightType(intensities)).toBe('DarkLight');
    });

    it('ties LanternLight over DarkLight at equal intensity', () => {
        const intensities = emptyLightTypeIntensities();
        intensities.LanternLight = 4;
        intensities.DarkLight = 4;
        expect(pickRenderLightType(intensities)).toBe('LanternLight');
    });

    it('returns null when all channels are dark', () => {
        expect(pickRenderLightType(emptyLightTypeIntensities())).toBeNull();
    });
});
