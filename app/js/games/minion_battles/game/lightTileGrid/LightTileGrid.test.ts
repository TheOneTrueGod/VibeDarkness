import { describe, expect, it } from 'vitest';
import { LightTileGrid } from './LightTileGrid';
import { CRYSTAL_DAYLIGHT_AMOUNT, CRYSTAL_DAYLIGHT_RADIUS, CRYSTAL_TILE_DEFAULTS } from '../../storylines/WorldOfDarkness/MapSegments/50_50_crystal_cave';

describe('LightTileGrid multi-channel', () => {
    it('computes visibility from max channel plus void and global', () => {
        const g = LightTileGrid.create(4, 4);
        g.setChannel(1, 1, 'DayLight', 5);
        g.setChannel(1, 1, 'FireLight', 3);
        g.setVoid(1, 1, -1);
        expect(g.getVisibility(1, 1, 2)).toBe(6); // 2 + max(5,3) + (-1)
        expect(g.getDominantType(1, 1)).toBe('DayLight');
    });

    it('migrates legacy single-channel JSON into FireLight', () => {
        const legacy = {
            w: 4,
            h: 4,
            q: [new Array(22 * 22).fill(7)],
        };
        const g = LightTileGrid.fromJSON(legacy);
        expect(g.getChannel(0, 0, 'FireLight')).toBe(7);
        expect(g.getChannel(0, 0, 'DayLight')).toBe(0);
        expect(g.getVisibility(0, 0, 0)).toBe(7);
    });

    it('round-trips channels-v1 JSON', () => {
        const g = LightTileGrid.create(3, 3);
        g.setChannel(0, 1, 'LanternLight', 4);
        g.setVoid(0, 1, -1);
        const restored = LightTileGrid.fromJSON(g.toJSON());
        expect(restored.getChannel(0, 1, 'LanternLight')).toBe(4);
        expect(restored.getVoid(0, 1)).toBe(-1);
    });
});

describe('crystal DayLight defaults', () => {
    it('emits DayLight at strength 5 without protectRadius', () => {
        expect(CRYSTAL_TILE_DEFAULTS.emitsLight).toEqual({
            lightAmount: CRYSTAL_DAYLIGHT_AMOUNT,
            radius: CRYSTAL_DAYLIGHT_RADIUS,
            lightType: 'DayLight',
        });
        expect(CRYSTAL_TILE_DEFAULTS.protectRadius).toBeUndefined();
    });
});
