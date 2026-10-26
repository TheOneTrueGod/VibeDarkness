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

describe('TerrainManager.createRubble', () => {
    it('lays rubble on open ground, bumps navEpoch and emits no stone-damaged event', () => {
        const grid = TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Grass);
        const manager = makeManager(grid);
        const emitter = vi.fn();
        manager.setStoneDamagedEmitter(emitter);
        const epoch = manager.navEpoch;

        expect(manager.createRubble(1, 1)).toBe(true);

        expect(manager.getEffectiveTerrainType(1, 1)).toBe(TerrainType.Rubble);
        expect(manager.isPassable(grid.gridToWorld(1, 1).x, grid.gridToWorld(1, 1).y)).toBe(true);
        expect(manager.navEpoch).toBeGreaterThan(epoch);
        expect(emitter).not.toHaveBeenCalled();
    });

    it('leaves rock, impassable, existing rubble and out-of-bounds tiles alone', () => {
        const grid = TerrainGrid.createFilledTerrain(4, 3, CELL_SIZE, TerrainType.Grass);
        grid.set(0, 0, TerrainType.Rock);
        grid.set(1, 0, TerrainType.Impassable);
        const manager = makeManager(grid);
        manager.createOrMarkRock(2, 0);
        manager.createRubble(3, 0);

        expect(manager.createRubble(0, 0)).toBe(false);
        expect(manager.createRubble(1, 0)).toBe(false);
        expect(manager.createRubble(2, 0)).toBe(false);
        expect(manager.createRubble(3, 0)).toBe(false);
        expect(manager.createRubble(-1, 0)).toBe(false);
        expect(manager.getEffectiveTerrainType(0, 0)).toBe(TerrainType.Rock);
        expect(manager.getEffectiveTerrainType(1, 0)).toBe(TerrainType.Impassable);
        expect(manager.getEffectiveTerrainType(2, 0)).toBe(TerrainType.Rock);
    });
});

describe('TerrainManager.createOrMarkRock rock rule', () => {
    function addBramble(layers: TerrainLayerManager, id: string, col: number, row: number): void {
        layers.add({
            id,
            layer: 'ground',
            effectType: 'bramble_slow',
            placedAtGameTime: 0,
            area: { type: 'cell', col, row },
            params: {},
        });
    }

    it('clears ground effects on the raised tile, keeps neighbours, and fires the emitter', () => {
        const grid = TerrainGrid.createFilledTerrain(4, 3, CELL_SIZE, TerrainType.Grass);
        const manager = new TerrainManager(grid);
        const layers = new TerrainLayerManager();
        manager.setTerrainLayers(layers);
        addBramble(layers, 'on-tile', 1, 1);
        addBramble(layers, 'neighbour', 2, 1);
        const emitter = vi.fn();
        manager.setTerrainEffectsClearedEmitter(emitter);

        manager.createOrMarkRock(1, 1);

        expect(layers.getGroundEffectAt(1, 1)).toBeNull();
        expect(layers.getGroundEffectAt(2, 1)?.id).toBe('neighbour');
        expect(emitter).toHaveBeenCalledTimes(1);
        const cleared = emitter.mock.calls[0]?.[0];
        expect(cleared).toHaveLength(1);
        expect(cleared[0]).toMatchObject({ id: 'on-tile', layer: 'ground', col: 1, row: 1 });
    });

    it('also clears when re-marking tile that is already rock', () => {
        const grid = TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Grass);
        grid.set(1, 1, TerrainType.Rock);
        const manager = new TerrainManager(grid);
        const layers = new TerrainLayerManager();
        manager.setTerrainLayers(layers);
        addBramble(layers, 'on-rock', 1, 1);

        manager.createOrMarkRock(1, 1);

        expect(layers.getGroundEffectAt(1, 1)).toBeNull();
    });

    it('does not fire the emitter when there is nothing to clear', () => {
        const grid = TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Grass);
        const manager = makeManager(grid);
        const emitter = vi.fn();
        manager.setTerrainEffectsClearedEmitter(emitter);

        manager.createOrMarkRock(1, 1);

        expect(emitter).not.toHaveBeenCalled();
    });
});

describe('TerrainManager rock and gravel on water (water levels)', () => {
    // Levels: deep 3, water 2, shallow 1; rock raises the ground 2 levels, gravel 1; level 0 is gravel.
    function managerWith(type: TerrainType): TerrainManager {
        const grid = TerrainGrid.createFilledTerrain(5, 5, CELL_SIZE, TerrainType.Grass);
        grid.set(2, 2, type);
        return makeManager(grid);
    }

    it.each([
        [TerrainType.DeepWater, TerrainType.ShallowWater],
        [TerrainType.Water, TerrainType.Rubble],
        [TerrainType.ShallowWater, TerrainType.Rubble],
    ])('rock on %s becomes %s, not rock', (start, result) => {
        const manager = managerWith(start);
        const epoch = manager.navEpoch;
        expect(manager.createOrMarkRock(2, 2)).toBeNull();
        expect(manager.getEffectiveTerrainType(2, 2)).toBe(result);
        expect(manager.navEpoch).toBeGreaterThan(epoch);
    });

    it.each([
        [TerrainType.DeepWater, TerrainType.Water],
        [TerrainType.Water, TerrainType.ShallowWater],
        [TerrainType.ShallowWater, TerrainType.Rubble],
    ])('gravel on %s becomes %s', (start, result) => {
        const manager = managerWith(start);
        expect(manager.createRubble(2, 2)).toBe(true);
        expect(manager.getEffectiveTerrainType(2, 2)).toBe(result);
    });

    it('stacks: two gravels fill water; rock on filled gravel raises normally', () => {
        const manager = managerWith(TerrainType.Water);
        manager.createRubble(2, 2);
        manager.createRubble(2, 2);
        expect(manager.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Rubble);
        expect(manager.createOrMarkRock(2, 2)?.terrainType).toBe(TerrainType.Rock);
    });

    it('gravel still never replaces rock', () => {
        const manager = managerWith(TerrainType.Rock);
        expect(manager.createRubble(2, 2)).toBe(false);
        expect(manager.getEffectiveTerrainType(2, 2)).toBe(TerrainType.Rock);
    });
});
