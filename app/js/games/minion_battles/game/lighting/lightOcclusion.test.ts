import { describe, expect, it } from 'vitest';
import { LightOcclusionCache } from './lightOcclusion';
import { LightingSystem } from './LightingSystem';
import type { GameEngine } from '../GameEngine';
import type { LightSource } from '../LightGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainType } from '../../terrain/TerrainType';
import { TerrainLayerManager } from '../TerrainLayerManager';

describe('LightOcclusionCache', () => {
    const W = 7;
    const H = 5;

    it('marks in-range tiles with a clear line, the wall itself, and nothing behind it', () => {
        const wall = new Set(['3,0', '3,1', '3,2', '3,3', '3,4']);
        const cache = new LightOcclusionCache(W, H, (c, r) => wall.has(`${c},${r}`));
        const mask = cache.getMask(1, 2, 3);
        const at = (c: number, r: number) => mask[r * W + c];
        expect(at(1, 2)).toBe(1); // source tile
        expect(at(2, 2)).toBe(1);
        expect(at(3, 2)).toBe(1); // wall face
        expect(at(4, 2)).toBe(0); // behind the wall
        expect(at(6, 2)).toBe(0); // out of range anyway
    });

    it('limits the mask to rounded-Euclidean range', () => {
        const cache = new LightOcclusionCache(W, H, () => false);
        const mask = cache.getMask(0, 0, 2);
        expect(mask[0 * W + 2]).toBe(1);
        expect(mask[0 * W + 3]).toBe(0);
        expect(mask[2 * W + 2]).toBe(0); // sqrt(8) rounds to 3
    });

    it('reuses masks until invalidated, then rebuilds from the current terrain', () => {
        let blocked = true;
        const cache = new LightOcclusionCache(W, H, (c, r) => blocked && c === 3 && r === 2);
        const before = cache.getMask(1, 2, 4);
        expect(before[2 * W + 4]).toBe(0);

        blocked = false;
        expect(cache.getMask(1, 2, 4)).toBe(before); // cached

        cache.invalidate();
        const after = cache.getMask(1, 2, 4);
        expect(after).not.toBe(before);
        expect(after[2 * W + 4]).toBe(1);
    });
});

describe('LightingSystem wall occlusion', () => {
    // 9 x 3 grass grid, rock column at col 4, torch at (2, 1), global light 0.
    const W = 9;
    const H = 3;
    const WALL_COL = 4;

    function setup() {
        const grid = TerrainGrid.createFilledTerrain(W, H, CELL_SIZE, TerrainType.Grass);
        for (let row = 0; row < H; row++) grid.set(WALL_COL, row, TerrainType.Rock);
        const terrainManager = new TerrainManager(grid);
        terrainManager.setTerrainLayers(new TerrainLayerManager());
        const sources: LightSource[] = [{ col: 2, row: 1, emission: 6, radius: 3 }];
        const engine = {
            terrainManager,
            globalLightLevel: 0,
            lightLevelEnabled: true,
            state: {
                lightLevelEnabled: true,
                globalLightLevel: 0,
                lightTileGrid: null,
                specialTileManager: { buildLightSourcesFromSpecialTiles: () => [] },
                lightSourceManager: { buildGridLightInputs: () => sources },
            },
        } as unknown as GameEngine;
        return { engine, terrainManager, lighting: new LightingSystem(engine) };
    }

    it('keeps light behind rock at global light and lights the rock face', () => {
        const { lighting } = setup();
        lighting.initLightGrid();
        expect(lighting.getLightAt(WALL_COL, 1)).toBe(6);
        expect(lighting.getLightAt(WALL_COL + 1, 1)).toBe(0);
        expect(lighting.getLightAt(WALL_COL + 2, 1)).toBe(0);
    });

    it('lets light through once the rock is destroyed (navEpoch bump)', () => {
        const { lighting, terrainManager } = setup();
        lighting.initLightGrid();
        expect(lighting.getLightAt(WALL_COL + 1, 1)).toBe(0);

        const epoch = terrainManager.navEpoch;
        for (let row = 0; row < H; row++) terrainManager.destroyRock(WALL_COL, row);
        expect(terrainManager.navEpoch).toBeGreaterThan(epoch);

        lighting.initLightGrid();
        expect(lighting.getLightAt(WALL_COL + 1, 1)).toBe(6);
        expect(lighting.getLightAt(WALL_COL + 2, 1)).toBeGreaterThan(0);
    });

    it('reuses one cache per terrain and recreates it for a new terrain manager', () => {
        const { lighting, engine } = setup();
        const first = lighting.getLightOcclusion();
        expect(first).toBeDefined();
        expect(lighting.getLightOcclusion()).toBe(first);

        const other = new TerrainManager(TerrainGrid.createFilledTerrain(W, H, CELL_SIZE, TerrainType.Grass));
        (engine as unknown as { terrainManager: TerrainManager }).terrainManager = other;
        expect(lighting.getLightOcclusion()).not.toBe(first);
    });
});
