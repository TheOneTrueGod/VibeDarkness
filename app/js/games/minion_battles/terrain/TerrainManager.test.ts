import { describe, expect, it, vi } from 'vitest';
import { TerrainManager } from './TerrainManager';
import { TerrainGrid, CELL_SIZE } from './TerrainGrid';
import { TerrainType } from './TerrainType';
import { TerrainLayerManager } from '../game/TerrainLayerManager';

function makeManager(grid: TerrainGrid): TerrainManager {
    const manager = new TerrainManager(grid);
    manager.setTerrainLayers(new TerrainLayerManager());
    return manager;
}

describe('TerrainManager stone mutation hooks', () => {
    it('emits stone-damaged only on cracked/spent transitions', () => {
        const grid = TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Grass);
        grid.set(1, 1, TerrainType.Rock);
        const manager = makeManager(grid);
        const emitter = vi.fn();
        manager.setStoneDamagedEmitter(emitter);

        manager.damageRock(1, 1); // natural -> cracked
        expect(emitter).toHaveBeenCalledTimes(1);
        const crackedEvent = emitter.mock.calls[0]?.[0];
        expect(crackedEvent?.previousState).toBe('natural_stone');
        expect(crackedEvent?.state).toBe('cracked_rock');
        expect(typeof crackedEvent?.worldX).toBe('number');
        expect(typeof crackedEvent?.worldY).toBe('number');

        manager.damageRock(1, 1); // cracked -> cracked (no transition)
        expect(emitter).toHaveBeenCalledTimes(1);

        manager.damageRock(1, 1);
        manager.damageRock(1, 1);
        manager.damageRock(1, 1); // final hit: cracked -> spent
        expect(emitter).toHaveBeenCalledTimes(2);
        const spentEvent = emitter.mock.calls[1]?.[0];
        expect(spentEvent?.previousState).toBe('cracked_rock');
        expect(spentEvent?.state).toBe('spent_rubble');
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
        expect(transition?.previousState).toBe('created_rock');
        expect(emitter).toHaveBeenCalledTimes(1);
        const event = emitter.mock.calls[0]?.[0];
        expect(event?.state).toBe('spent_rubble');
    });
});
