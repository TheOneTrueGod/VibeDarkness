import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import {
    THORN_MARCH,
    THORN_MARCH_AMBUSH_SWARMLING_COUNT,
    THORN_MARCH_AMBUSH_WOLF_COUNT,
    THORN_MARCH_THORNBINDER_INTERVAL_ROUNDS,
} from './008_thorn_march';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { registerWorldOfDarknessSegments } from '../registerSegments';

registerWorldOfDarknessSegments();

describe('ThornMarchMission initial ambush', () => {
    it('pre-places a trimmed wolf/swarmling ambush with no spawn-in animation', () => {
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
        expect(THORN_MARCH_AMBUSH_WOLF_COUNT).toBe(2);
        expect(THORN_MARCH_AMBUSH_SWARMLING_COUNT).toBe(2);
        expect(wolves).toHaveLength(THORN_MARCH_AMBUSH_WOLF_COUNT);
        expect(swarmlings).toHaveLength(THORN_MARCH_AMBUSH_SWARMLING_COUNT);

        // 'initialGameSpawn' units get no spawnTimer, so they appear instantly (no animation).
        for (const unit of [...wolves, ...swarmlings]) {
            expect(unit.spawnTimer).toBe(0);
        }

        engine.destroy();
    });

    it('spawns Thornbinder reinforcements at most once during the 8-round hold', () => {
        const thornbinderEvents = THORN_MARCH.levelEvents.filter(
            (e) =>
                e.type === 'continuousSpawn' &&
                e.spawns.some((sp) => sp.characterId === 'thornbinder'),
        );
        expect(thornbinderEvents).toHaveLength(1);
        expect(THORN_MARCH_THORNBINDER_INTERVAL_ROUNDS).toBe(5);
    });
});
