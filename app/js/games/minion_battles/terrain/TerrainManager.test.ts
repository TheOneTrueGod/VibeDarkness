import { describe, expect, it, vi } from 'vitest';
import { TerrainManager } from './TerrainManager';
import { TerrainGrid, CELL_SIZE } from './TerrainGrid';
import { TerrainType } from './TerrainType';
import { TerrainLayerManager } from '../game/TerrainLayerManager';
import { EARTH_CORE_STONE_DAMAGE_PER_INSTANCE } from '../card_defs/05_earth_core/earthCoreConstants';

function makeManager(grid: TerrainGrid): TerrainManager {
    const manager = new TerrainManager(grid);
    manager.setTerrainLayers(new TerrainLayerManager());
    return manager;
}

describe('TerrainManager stone mutation hooks', () => {
    it('emits stone-damaged on tier change and destroy', () => {
        const grid = TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Grass);
        grid.set(1, 1, TerrainType.Rock);
        const manager = makeManager(grid);
        const emitter = vi.fn();
        manager.setStoneDamagedEmitter(emitter);

        manager.damageRock(1, 1); // 30 -> 24, tier 0, no emit
        expect(emitter).toHaveBeenCalledTimes(0);

        manager.damageRock(1, 1); // 24 -> 18, tier 0 -> 1
        expect(emitter).toHaveBeenCalledTimes(1);
        const tierEvent = emitter.mock.calls[0]?.[0];
        expect(tierEvent?.previousHealth).toBe(24);
        expect(tierEvent?.health).toBe(18);
        expect(tierEvent?.terrainType).toBe(TerrainType.Rock);
        expect(typeof tierEvent?.worldX).toBe('number');

        while (manager.getFloorTile(1, 1)?.destructible && manager.getFloorTile(1, 1)!.destructible!.health > 0) {
            manager.damageRock(1, 1);
        }
        const destroyEvent = emitter.mock.calls[emitter.mock.calls.length - 1]?.[0];
        expect(destroyEvent?.terrainType).toBe(TerrainType.Rubble);
        expect(destroyEvent?.health).toBe(0);
    });

    it('makes rubble passable while bedrock rock remains underneath', () => {
        const grid = TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Grass);
        grid.set(1, 1, TerrainType.Rock);
        const manager = makeManager(grid);
        const world = grid.gridToWorld(1, 1);
        expect(manager.isPassable(world.x, world.y)).toBe(false);

        const hits = Math.ceil(30 / EARTH_CORE_STONE_DAMAGE_PER_INSTANCE);
        for (let i = 0; i < hits; i++) manager.damageRock(1, 1);
        expect(manager.getEffectiveTerrainType(1, 1)).toBe(TerrainType.Rubble);
        expect(manager.isPassable(world.x, world.y)).toBe(true);
        expect(grid.get(1, 1)).toBe(TerrainType.Rock);
    });

    it('uses effective terrain for projectile passability', () => {
        const grid = TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Grass);
        grid.set(1, 1, TerrainType.Rock);
        const manager = makeManager(grid);
        const world = grid.gridToWorld(1, 1);
        expect(manager.isProjectilePassable(world.x, world.y)).toBe(true);
        manager.createOrMarkRock(1, 1);
        expect(manager.isProjectilePassable(world.x, world.y)).toBe(true);
    });

    it('emits stone-damaged when consuming preferred rock in radius', () => {
        const grid = TerrainGrid.createFilledTerrain(5, 5, CELL_SIZE, TerrainType.Grass);
        grid.set(2, 2, TerrainType.Rock); // natural
        grid.set(1, 2, TerrainType.Rock); // created
        const manager = makeManager(grid);
        manager.createOrMarkRock(1, 2);

        const emitter = vi.fn();
        manager.setStoneDamagedEmitter(emitter);
        const transition = manager.consumeRockInRadius(2, 2, 2);

        expect(transition).not.toBeNull();
        expect(transition?.col).toBe(1);
        expect(transition?.row).toBe(2);
        expect(emitter).toHaveBeenCalledTimes(1);
        const event = emitter.mock.calls[0]?.[0];
        expect(event?.terrainType).toBe(TerrainType.Rubble);
    });

    it('lazy-copies bedrock on first damage to natural rock', () => {
        const grid = TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Grass);
        grid.set(1, 1, TerrainType.Rock);
        const manager = makeManager(grid);
        expect(manager.getFloorTile(1, 1)).toBeNull();
        manager.damageRock(1, 1);
        const floor = manager.getFloorTile(1, 1);
        expect(floor?.terrainType).toBe(TerrainType.Rock);
        expect(floor?.destructible?.health).toBe(30 - EARTH_CORE_STONE_DAMAGE_PER_INSTANCE);
    });
});
