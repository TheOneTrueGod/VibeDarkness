import { describe, expect, it } from 'vitest';
import { TerrainType } from '../../../../../games/minion_battles/terrain/TerrainType';
import { decodeTerrainPaint, encodeTerrainPaint, formatTerrainLayoutForCopy } from './terrainStory';

describe('terrain Storybook paint URL value', () => {
    const rows = [
        [TerrainType.Grass, TerrainType.Rock],
        [TerrainType.ShallowWater, TerrainType.Gravel],
    ];

    it('round-trips a painted grid for its layout', () => {
        expect(decodeTerrainPaint(encodeTerrainPaint('floor', rows), 'floor')).toEqual(rows);
    });

    it('ignores paint saved for another layout', () => {
        expect(decodeTerrainPaint(encodeTerrainPaint('floor', rows), 'castle')).toBeNull();
    });

    it('rejects ragged or unknown cells', () => {
        expect(decodeTerrainPaint('floor~13.1', 'floor')).toBeNull();
        expect(decodeTerrainPaint('floor~1z.11', 'floor')).toBeNull();
    });
});

describe('terrain Storybook copied layout', () => {
    it('writes a letter grid with a legend of the letters used and the link', () => {
        const text = formatTerrainLayoutForCopy(
            'floor',
            [
                [TerrainType.Grass, TerrainType.Rock],
                [TerrainType.Dirt, TerrainType.Grass],
            ],
            true,
            'http://localhost:5173/campaign/ideas/storybook/terrain',
        );
        const lines = text.split('\n');
        expect(lines).toContain('gr');
        expect(lines).toContain('dg');
        expect(text).toContain('(edited)');
        expect(text).toMatch(/Legend: .*g = Grass/);
        expect(text).toMatch(/r = Rock/);
        expect(text).not.toMatch(/w = Water/);
        expect(text).toContain('Storybook: http://localhost:5173/campaign/ideas/storybook/terrain');
    });
});
