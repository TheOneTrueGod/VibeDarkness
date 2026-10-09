import { describe, expect, it, vi } from 'vitest';
import { TerrainManager } from './TerrainManager';
import { TerrainGrid, CELL_SIZE } from './TerrainGrid';
import { TerrainType } from './TerrainType';
import { DAMAGE_TIER_NONE } from './FloorTile';
import { TerrainLayerManager } from '../game/TerrainLayerManager';
import { EARTH_CORE_STONE_HEALTH } from '../card_defs/05_earth_core/earthCoreConstants';

function makeManager(grid: TerrainGrid): TerrainManager {
    const manager = new TerrainManager(grid);
    manager.setTerrainLayers(new TerrainLayerManager());
    return manager;
}

describe('TerrainManager.isInBounds', () => {
    it('is true only for cells inside the grid', () => {
        const manager = makeManager(TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Grass));
        expect(manager.isInBounds(0, 0)).toBe(true);
        expect(manager.isInBounds(2, 2)).toBe(true);
        expect(manager.isInBounds(-1, 0)).toBe(false);
        expect(manager.isInBounds(0, -1)).toBe(false);
        expect(manager.isInBounds(3, 0)).toBe(false);
        expect(manager.isInBounds(0, 3)).toBe(false);
    });
});

describe('TerrainManager.isIntactRockAt', () => {
    it('is true for bedrock rock and false for grass', () => {
        const grid = TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Grass);
        grid.set(1, 1, TerrainType.Rock);
        const manager = makeManager(grid);
        expect(manager.isIntactRockAt(1, 1)).toBe(true);
        expect(manager.isIntactRockAt(0, 0)).toBe(false);
    });

    it('is false out of bounds even though grid.get reads Rock there', () => {
        const grid = TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Grass);
        const manager = makeManager(grid);
        expect(manager.isIntactRockAt(-1, 1)).toBe(false);
        expect(manager.isIntactRockAt(3, 1)).toBe(false);
    });

    it('is false once the rock has been destroyed into rubble', () => {
        const grid = TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Grass);
        grid.set(1, 1, TerrainType.Rock);
        const manager = makeManager(grid);
        manager.destroyRock(1, 1);
        expect(manager.isIntactRockAt(1, 1)).toBe(false);
    });
});

describe('TerrainManager.destroyRock', () => {
    it('turns bedrock rock into rubble and emits a destroying transition', () => {
        const grid = TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Grass);
        grid.set(1, 1, TerrainType.Rock);
        const manager = makeManager(grid);
        const emitter = vi.fn();
        manager.setStoneDamagedEmitter(emitter);

        const transition = manager.destroyRock(1, 1, 'unit-a');

        expect(transition).not.toBeNull();
        expect(manager.getEffectiveTerrainType(1, 1)).toBe(TerrainType.Rubble);
        expect(manager.isPassable(grid.gridToWorld(1, 1).x, grid.gridToWorld(1, 1).y)).toBe(true);
        expect(emitter).toHaveBeenCalledTimes(1);
        const event = emitter.mock.calls[0]?.[0];
        expect(event?.col).toBe(1);
        expect(event?.row).toBe(1);
        expect(event?.previousTerrainType).toBe(TerrainType.Rock);
        expect(event?.previousHealth).toBe(EARTH_CORE_STONE_HEALTH);
        expect(event?.health).toBe(0);
        expect(event?.terrainType).toBe(TerrainType.Rubble);
        expect(event?.tier).toBe(DAMAGE_TIER_NONE);
        expect(event?.sourceUnitId).toBe('unit-a');
    });

    it('turns player-made rock into rubble and emits a destroying transition', () => {
        const grid = TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Grass);
        const manager = makeManager(grid);
        manager.createOrMarkRock(2, 2);
        const emitter = vi.fn();
        manager.setStoneDamagedEmitter(emitter);

        const transition = manager.destroyRock(2, 2);

        expect(transition).not.toBeNull();
        expect(manager.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Rubble);
        expect(emitter).toHaveBeenCalledTimes(1);
        expect(emitter.mock.calls[0]?.[0]?.terrainType).toBe(TerrainType.Rubble);
    });

    it('is a no-op on tiles that are not intact rock', () => {
        const grid = TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Grass);
        const manager = makeManager(grid);
        const emitter = vi.fn();
        manager.setStoneDamagedEmitter(emitter);

        expect(manager.destroyRock(0, 0)).toBeNull();
        expect(manager.destroyRock(-1, 0)).toBeNull();
        expect(emitter).not.toHaveBeenCalled();
        expect(manager.getEffectiveTerrainType(0, 0)).toBe(TerrainType.Grass);
    });
});
