import { describe, expect, it } from 'vitest';
import { computeForcedDisplacement } from './forceMove';
import { clampNudgeVectorToTerrain } from './units/unitNudge';
import { Unit } from './units/Unit';
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

    it('moves the full distance on open ground when it is not a multiple of the probe step', () => {
        const terrainManager = makeGrassManager(20, 20);
        // 7.8 px: one 4 px probe fits, the 3.8 px remainder must not be dropped.
        const want = 7.8;
        const { distance, dx } = computeForcedDisplacement(100, 100, 100 + want, 100, want, { terrainManager });
        expect(distance).toBeCloseTo(want);
        expect(dx).toBeCloseTo(want);
    });

    it('still stops at a wall inside the remainder past the last full probe step', () => {
        const terrainManager = makeGrassManager(20, 20);
        terrainManager.grid.set(3, 2, TerrainType.Rock);
        // Start 5 px left of the rock tile's edge (x = 120); a 7.8 px push would end 2.8 px inside it.
        const startX = 3 * CELL_SIZE - 5;
        const y = 2.5 * CELL_SIZE;
        const { distance } = computeForcedDisplacement(startX, y, startX + 7.8, y, 7.8, { terrainManager });
        expect(distance).toBeGreaterThan(4);
        expect(distance).toBeLessThanOrEqual(5 + 1e-6);
    });

    it('stops before rock when the first coarse step would land inside the wall', () => {
        const terrainManager = makeGrassManager(8, 4);
        terrainManager.grid.set(3, 2, TerrainType.Rock);

        const startX = CELL_SIZE * 2.9;
        const startY = CELL_SIZE * 2.5;
        const pushX = 8;
        const pushY = 0;
        const segmentLength = Math.hypot(pushX, pushY);

        const { distance, dx } = computeForcedDisplacement(
            startX,
            startY,
            startX + pushX,
            startY + pushY,
            segmentLength,
            { terrainManager },
        );

        expect(distance).toBeGreaterThan(0);
        expect(distance).toBeLessThan(segmentLength);
        expect(terrainManager.isPassable(startX + dx, startY)).toBe(true);
        expect(Math.floor((startX + dx) / CELL_SIZE)).toBeLessThan(3);
    });

    it('allows sub-step nudge segments on passable terrain', () => {
        const terrainManager = makeGrassManager(8, 4);
        const startX = 100;
        const startY = 100;
        const segmentLength = 0.7;

        const { distance } = computeForcedDisplacement(
            startX,
            startY,
            startX + segmentLength,
            startY,
            segmentLength,
            { terrainManager },
        );

        expect(distance).toBeCloseTo(segmentLength, 5);
    });

    it('allows a short nudge beside rock at gravity-locus test coordinates', () => {
        const terrainManager = makeGrassManager(12, 6);
        terrainManager.grid.set(5, 3, TerrainType.Rock);

        const enemy = new Unit({
            id: 'enemy',
            x: CELL_SIZE * 4.5,
            y: CELL_SIZE * 3.5,
            hp: 100,
            maxHp: 100,
            speed: 100,
            teamId: 'enemy',
            ownerId: 'ai',
            characterId: 'dark_wolf',
            name: 'enemy',
        });

        expect(terrainManager.isPassable(enemy.x, enemy.y)).toBe(true);

        const clamped = clampNudgeVectorToTerrain(
            enemy,
            { x: 14, y: 0 },
            terrainManager,
            terrainManager.grid,
        );
        expect(clamped.x).toBeGreaterThan(0);
    });

    it('gives zero displacement for a start inside a wall (dashes, lunges and nudges cannot start in rock)', () => {
        const terrainManager = makeGrassManager(12, 4);
        terrainManager.grid.set(3, 2, TerrainType.Rock);
        terrainManager.grid.set(4, 2, TerrainType.Rock);

        const startX = CELL_SIZE * 3.5;
        const startY = CELL_SIZE * 2.5;

        const { distance } = computeForcedDisplacement(
            startX,
            startY,
            startX + CELL_SIZE * 3,
            startY,
            CELL_SIZE * 3,
            { terrainManager },
        );

        expect(distance).toBe(0);
    });
});
