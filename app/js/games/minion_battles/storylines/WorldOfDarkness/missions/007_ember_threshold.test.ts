import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { EMBER_THRESHOLD } from './007_ember_threshold';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { getMissionSegmentZones, parseAndRegisterSegment } from '../../../terrain/segmentRegistry';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import { isTileInZone } from '../../../terrain/zones';

registerWorldOfDarknessSegments();

describe('EmberThresholdMission opening wolves', () => {
    it('spawns 3 dark wolves in the outside-cave-mouth zone at battle start', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 42 });
        const terrain = EMBER_THRESHOLD.createTerrain();
        const terrainManager = new TerrainManager(terrain);
        const zones = getMissionSegmentZones(EMBER_THRESHOLD.segmentIds);
        const caveMouthZone = zones.find((z) => z.id === 'outside of cave mouth');
        expect(caveMouthZone).toBeDefined();

        EMBER_THRESHOLD.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
            terrainManager,
            terrainSegmentZones: zones,
        });

        const wolves = engine.units.filter((u) => u.characterId === 'dark_wolf');
        expect(wolves).toHaveLength(3);

        const cellSize = terrain.cellSize;
        for (const wolf of wolves) {
            const col = Math.floor(wolf.x / cellSize);
            const row = Math.floor(wolf.y / cellSize);
            expect(isTileInZone(caveMouthZone!, col, row)).toBe(true);
        }

        engine.destroy();
    });

    it('spawns opening wolves when API terrain JSON overwrote registry zones', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 42 });
        const terrain = EMBER_THRESHOLD.createTerrain();
        const terrainManager = new TerrainManager(terrain);

        // Simulate fetchBattleAssets registering editor JSON without zones.
        parseAndRegisterSegment({
            id: '50_50_crystal_cave',
            gridCol: 50,
            gridRow: 50,
            width: 22,
            height: 22,
            terrain: Array.from({ length: 22 }, () => Array(22).fill(0)),
            pointsOfInterest: [],
        });

        EMBER_THRESHOLD.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
            terrainManager,
            terrainSegmentZones: getMissionSegmentZones(EMBER_THRESHOLD.segmentIds),
        });

        const wolves = engine.units.filter((u) => u.characterId === 'dark_wolf');
        expect(wolves).toHaveLength(3);
        engine.destroy();
    });
});
