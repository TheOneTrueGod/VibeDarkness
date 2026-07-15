import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { THORN_MARCH } from './008_thorn_march';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { registerWorldOfDarknessSegments } from '../registerSegments';

registerWorldOfDarknessSegments();

describe('ThornMarchMission initial ambush', () => {
    it('pre-places 3 wolves and 3 swarmlings with no spawn-in animation', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 42 });
        const terrain = THORN_MARCH.createTerrain();
        const terrainManager = new TerrainManager(terrain);

        THORN_MARCH.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
            terrainManager,
        });

        const wolves = engine.units.filter((u) => u.characterId === 'dark_wolf');
        const swarmlings = engine.units.filter((u) => u.characterId === 'swarmling');
        expect(wolves).toHaveLength(3);
        expect(swarmlings).toHaveLength(3);

        // 'initialGameSpawn' units get no spawnTimer, so they appear instantly (no animation).
        for (const unit of [...wolves, ...swarmlings]) {
            expect(unit.spawnTimer).toBe(0);
        }

        engine.destroy();
    });
});
