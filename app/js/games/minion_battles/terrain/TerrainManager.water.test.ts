import { describe, expect, it, vi } from 'vitest';
import { TerrainManager } from './TerrainManager';
import { TerrainGrid, CELL_SIZE } from './TerrainGrid';
import { lowerWaterLevel, TerrainType, TERRAIN_PROPERTIES } from './TerrainType';
import { WATER_DESTRUCTIBLE_KIND, WATER_TILE_HEALTH } from './FloorTile';
import { TerrainLayerManager } from '../game/TerrainLayerManager';

function managerWith(type: TerrainType, layers = new TerrainLayerManager()): TerrainManager {
    const grid = TerrainGrid.createFilledTerrain(5, 5, CELL_SIZE, TerrainType.Grass);
    grid.set(2, 2, type);
    const manager = new TerrainManager(grid);
    manager.setTerrainLayers(layers);
    return manager;
}

function drain(manager: TerrainManager, times: number, fraction = 1 / 8): void {
    for (let i = 0; i < times; i++) manager.drainWater(2, 2, fraction);
}

describe('lowerWaterLevel', () => {
    it.each([
        [TerrainType.DeepWater, TerrainType.Water],
        [TerrainType.Water, TerrainType.ShallowWater],
        [TerrainType.ShallowWater, TerrainType.Dirt],
    ])('%s drains to %s', (start, result) => {
        expect(lowerWaterLevel(start)).toBe(result);
    });

    it.each([TerrainType.Dirt, TerrainType.Grass, TerrainType.Gravel, TerrainType.Rock, TerrainType.Impassable])(
        'is null for non-water %s',
        (type) => {
            expect(lowerWaterLevel(type)).toBeNull();
        },
    );
});

describe('TerrainManager.drainWater', () => {
    it('8 drains of 1/8 lower deep water to water, and only the 8th drops the level', () => {
        const manager = managerWith(TerrainType.DeepWater);
        const emitter = vi.fn();
        manager.setWaterDrainedEmitter(emitter);

        drain(manager, 7);
        expect(manager.getEffectiveTerrainType(2, 2)).toBe(TerrainType.DeepWater);
        expect(manager.getFloorTile(2, 2)?.destructible).toEqual({
            health: WATER_TILE_HEALTH / 8,
            maxHealth: WATER_TILE_HEALTH,
            kind: WATER_DESTRUCTIBLE_KIND,
        });
        expect(emitter).not.toHaveBeenCalled();

        const transition = manager.drainWater(2, 2, 1 / 8, 'unit-a');

        expect(manager.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Water);
        expect(transition).toMatchObject({
            col: 2,
            row: 2,
            previousTerrainType: TerrainType.DeepWater,
            terrainType: TerrainType.Water,
            levelDropped: true,
            sourceUnitId: 'unit-a',
        });
        expect(emitter).toHaveBeenCalledTimes(1);
        expect(emitter.mock.calls[0]?.[0]).toBe(transition);
    });

    it('a partial drain returns a transition without dropping a level', () => {
        const manager = managerWith(TerrainType.Water);
        const transition = manager.drainWater(2, 2, 0.25);
        expect(transition).toMatchObject({
            previousHealth: 1,
            health: 0.75,
            terrainType: TerrainType.Water,
            levelDropped: false,
        });
    });

    it('resets the water health after a level drop', () => {
        const manager = managerWith(TerrainType.DeepWater);
        const transition = manager.drainWater(2, 2, 1);
        expect(transition?.health).toBe(WATER_TILE_HEALTH);
        expect(manager.getFloorTile(2, 2)?.destructible?.health).toBe(WATER_TILE_HEALTH);

        drain(manager, 7);
        expect(manager.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Water);
        drain(manager, 1);
        expect(manager.getEffectiveTerrainType(2, 2)).toBe(TerrainType.ShallowWater);
    });

    it('drops at most one level per call, discarding the excess', () => {
        const manager = managerWith(TerrainType.DeepWater);
        manager.drainWater(2, 2, 5);
        expect(manager.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Water);
    });

    it('shallow water drains to dirt, which is no longer water, walkable and has no water health', () => {
        const manager = managerWith(TerrainType.ShallowWater);
        drain(manager, 8);
        expect(manager.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Dirt);
        expect(manager.getFloorTile(2, 2)?.destructible).toBeUndefined();
        expect(manager.drainWater(2, 2, 1 / 8)).toBeNull();
    });

    it('drains deep water all the way to dirt (3 levels x 8 drains)', () => {
        const manager = managerWith(TerrainType.DeepWater);
        drain(manager, 24);
        expect(manager.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Dirt);
    });

    it('survives float error from many small per-tick drains', () => {
        const manager = managerWith(TerrainType.Water);
        // 1/8 per second at 60 ticks/s for 8 s.
        drain(manager, 8 * 60, 1 / 8 / 60);
        expect(manager.getEffectiveTerrainType(2, 2)).toBe(TerrainType.ShallowWater);
    });

    it('is null for non-water, off-grid and non-positive fractions, and leaves no floor tile', () => {
        const manager = managerWith(TerrainType.Water);
        expect(manager.drainWater(0, 0, 1 / 8)).toBeNull();
        expect(manager.drainWater(-1, 2, 1 / 8)).toBeNull();
        expect(manager.drainWater(2, 2, 0)).toBeNull();
        expect(manager.drainWater(2, 2, -1)).toBeNull();
        expect(manager.getFloorTile(0, 0)).toBeNull();
        expect(manager.getFloorTile(2, 2)).toBeNull();
    });

    it('a level drop bumps navEpoch and pathfinding sees the new passability; partial drains do not', () => {
        const manager = managerWith(TerrainType.Water);
        const { x, y } = manager.grid.gridToWorld(2, 2);
        expect(manager.isPassable(x, y)).toBe(false);
        const epoch = manager.navEpoch;

        drain(manager, 7);
        expect(manager.navEpoch).toBe(epoch);

        drain(manager, 1);
        expect(manager.navEpoch).toBeGreaterThan(epoch);
        expect(manager.isPassable(x, y)).toBe(true);
        expect(manager.getSpeedMultiplier(x, y)).toBe(TERRAIN_PROPERTIES[TerrainType.ShallowWater].speedMultiplier);
        expect(manager.nav.isPassable('default', 2, 2)).toBe(true);
    });

    it('drains a water floor tile laid over other bedrock (effective terrain, not bedrock)', () => {
        const manager = managerWith(TerrainType.Grass);
        const layers = new TerrainLayerManager();
        manager.setTerrainLayers(layers);
        layers.setFloorTile(2, 2, { terrainType: TerrainType.ShallowWater });
        drain(manager, 8);
        expect(manager.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Dirt);
    });

    it('the floor tile serializes and restores mid-drain (checkpoint round-trip)', () => {
        const layers = new TerrainLayerManager();
        const manager = managerWith(TerrainType.DeepWater, layers);
        drain(manager, 8 + 3); // Water, with 5/8 left.

        const json = JSON.parse(JSON.stringify(layers.toFloorTilesJSON()));
        const restored = TerrainLayerManager.fromJSON([], json);
        const restoredManager = managerWith(TerrainType.DeepWater, restored);

        expect(restoredManager.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Water);
        expect(restoredManager.getFloorTile(2, 2)?.destructible).toEqual({
            health: 5 / 8,
            maxHealth: WATER_TILE_HEALTH,
            kind: WATER_DESTRUCTIBLE_KIND,
        });

        drain(restoredManager, 5);
        expect(restoredManager.getEffectiveTerrainType(2, 2)).toBe(TerrainType.ShallowWater);
    });

    it('stone on a part-drained tile raises the ground and the new level starts full', () => {
        const manager = managerWith(TerrainType.DeepWater);
        drain(manager, 4);
        manager.createRubble(2, 2);
        expect(manager.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Water);
        drain(manager, 7);
        expect(manager.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Water);
    });
});
