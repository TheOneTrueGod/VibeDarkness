import { describe, expect, it } from 'vitest';
import { computeLightChannelGrid, computeLightGrid, type LightSource } from './LightGrid';
import { pickRenderLightType, emptyLightTypeIntensities } from './lighting/lightTypes';
import { LightOcclusionCache } from './lighting/lightOcclusion';

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

describe('computeLightChannelGrid occlusion', () => {
    // 9 x 3 grid with a full-height wall column at col 4; source at (2, 1), global light 0.
    const W = 9;
    const H = 3;
    const WALL_COL = 4;
    const blocks = (col: number, row: number) => col === WALL_COL || col < 0 || row < 0 || col >= W || row >= H;
    const torch: LightSource = { col: 2, row: 1, emission: 6, radius: 3 };
    const voidSource: LightSource = { col: 2, row: 1, emission: -4, radius: 3 };

    it('leaves the far side of a wall line at global light', () => {
        const occlusion = new LightOcclusionCache(W, H, blocks);
        const lit = computeLightGrid(1, W, H, [torch], occlusion);
        for (let row = 0; row < H; row++) {
            for (let col = WALL_COL + 1; col < W; col++) expect(lit[row]![col]).toBe(1);
        }
        // Unoccluded, the same tiles are brighter.
        expect(computeLightGrid(1, W, H, [torch])[1]![6]).toBeGreaterThan(1);
    });

    it('still lights the wall tile itself', () => {
        const occlusion = new LightOcclusionCache(W, H, blocks);
        const lit = computeLightGrid(0, W, H, [torch], occlusion);
        expect(lit[1]![WALL_COL]).toBe(6);
        expect(lit[1]![3]).toBe(6);
    });

    it('occludes void darkness the same way', () => {
        const occlusion = new LightOcclusionCache(W, H, blocks);
        const result = computeLightChannelGrid(2, W, H, [voidSource], occlusion);
        expect(result.voidDarkness[1]![3]).toBe(-4);
        expect(result.voidDarkness[1]![WALL_COL]).toBe(-4);
        expect(result.voidDarkness[1]![6]).toBe(0);
        expect(result.visibility[1]![6]).toBe(2);
    });

    it('gives identical output to the unoccluded grid when nothing blocks', () => {
        const sources: LightSource[] = [torch, voidSource, { col: 7, row: 0, emission: 3, radius: 1, lightType: 'DayLight' }];
        const open = new LightOcclusionCache(W, H, () => false);
        expect(computeLightChannelGrid(0, W, H, sources, open)).toEqual(computeLightChannelGrid(0, W, H, sources));
    });
});
