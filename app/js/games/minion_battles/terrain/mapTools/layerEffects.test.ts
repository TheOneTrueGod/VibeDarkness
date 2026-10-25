import { describe, expect, it } from 'vitest';
import { createLayerEffect } from './layerEffects';
import { rectCells } from './fillRect';
import { TerrainLayerManager } from '../../game/TerrainLayerManager';

describe('createLayerEffect', () => {
    it('builds a permanent ownerless effect that the layer manager reports on its cells', () => {
        const effect = createLayerEffect({
            id: 'map_brambles',
            layer: 'ground',
            effectType: 'bramble_slow',
            cells: [...rectCells({ col: 1, row: 1 }, { col: 2, row: 1 }), { col: 1, row: 1 }],
            params: { slowMult: 0.5 },
        });
        expect(effect.area).toEqual({ type: 'cells', cells: [{ col: 1, row: 1 }, { col: 2, row: 1 }] });
        expect(effect.expiresAtGameTime).toBeUndefined();
        expect(effect.ownerUnitId).toBeUndefined();

        const layers = new TerrainLayerManager();
        layers.add(effect);
        expect(layers.getGroundEffectAt(2, 1)?.id).toBe('map_brambles');
        expect(layers.getGroundEffectAt(3, 1)).toBeNull();
    });
});
