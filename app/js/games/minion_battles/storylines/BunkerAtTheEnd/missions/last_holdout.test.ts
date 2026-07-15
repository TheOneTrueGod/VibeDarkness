import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { LAST_HOLDOUT } from './last_holdout';
import { TerrainManager } from '../../../terrain/TerrainManager';

describe('LastHoldoutMission initial swarm', () => {
    it('pre-places 10 swarmlings with no spawn-in animation', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 42 });
        const terrain = LAST_HOLDOUT.createTerrain();
        const terrainManager = new TerrainManager(terrain);

        LAST_HOLDOUT.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
            terrainManager,
        });

        const swarmlings = engine.units.filter((u) => u.characterId === 'swarmling');
        expect(swarmlings).toHaveLength(10);

        // 'initialGameSpawn' units get no spawnTimer, so they appear instantly (no animation).
        for (const unit of swarmlings) {
            expect(unit.spawnTimer).toBe(0);
        }

        engine.destroy();
    });
});
