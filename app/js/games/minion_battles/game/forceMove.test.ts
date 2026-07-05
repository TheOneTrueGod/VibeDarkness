import { describe, expect, it } from 'vitest';
import { computeForcedDisplacement } from './forceMove';
import { TerrainGrid, CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainManager } from '../terrain/TerrainManager';
import { TerrainType } from '../terrain/TerrainType';
import { TerrainLayerManager } from './TerrainLayerManager';

function makeGrassManager(cols: number, rows: number): TerrainManager {
    const grid = TerrainGrid.createFilledTerrain(cols, rows, CELL_SIZE, TerrainType.Grass);
    const manager = new TerrainManager(grid);
    manager.setTerrainLayers(new TerrainLayerManager());
    return manager;
}

describe('computeForcedDisplacement', () => {
    it('returns maxDistance when path is fully passable despite hypot vs coordinate float mismatch', () => {
        const terrainManager = makeGrassManager(20, 20);
        const startX = 100;
        const startY = 100;
        const pushX = 8.000000000000007;
        const pushY = 0;
        const newX = startX + pushX;
        const newY = startY + pushY;
        const segmentLength = Math.hypot(pushX, pushY);

        const { distance } = computeForcedDisplacement(
            startX,
            startY,
            newX,
            newY,
            segmentLength,
            { terrainManager },
        );

        expect(distance).toBe(segmentLength);
    });
});
