/**
 * spawnZoneId: spawnWave/continuousSpawn entries can resolve candidate tiles from a
 * registered zone instead of a spawnTarget circle.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../GameEngine';
import { resetGameObjectIdCounter } from '../GameObject';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainType } from '../../terrain/TerrainType';
import type { MapSegmentZone } from '../../terrain/segmentSchema';

const ZONE: MapSegmentZone = {
    id: 'test zone',
    shape: 'box',
    topLeft: { col: 2, row: 2 },
    bottomRight: { col: 4, row: 4 },
};

function setupEngine(): GameEngine {
    resetGameObjectIdCounter(1);
    const grid = new TerrainGrid(10, 10, CELL_SIZE, TerrainType.Grass);
    const tm = new TerrainManager(grid);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1, terrainManager: tm });
    engine.registerMapZones([ZONE]);
    return engine;
}

describe('LevelEventManager spawnZoneId', () => {
    it('spawnWave: spawns units only on tiles within the registered zone', () => {
        const engine = setupEngine();
        engine.registerLevelEvents([
            {
                type: 'spawnWave',
                trigger: { atRound: 1 },
                spawns: [
                    {
                        characterId: 'dark_wolf',
                        name: 'Wolf',
                        spawnBehaviour: 'anywhere',
                        spawnZoneId: 'test zone',
                        spawnCount: 3,
                        unitAITreeId: 'hunt',
                    },
                ],
            },
        ]);

        engine.state.levelEventManager.processLevelEvents();

        const wolves = engine.units.filter((u) => u.characterId === 'dark_wolf');
        expect(wolves).toHaveLength(3);
        for (const wolf of wolves) {
            const { col, row } = engine.terrainManager!.grid.worldToGrid(wolf.x, wolf.y);
            expect(col).toBeGreaterThanOrEqual(2);
            expect(col).toBeLessThanOrEqual(4);
            expect(row).toBeGreaterThanOrEqual(2);
            expect(row).toBeLessThanOrEqual(4);
        }
    });

    it('spawnWave: logs and skips the entry when the zone id is not registered', () => {
        const engine = setupEngine();
        engine.registerLevelEvents([
            {
                type: 'spawnWave',
                trigger: { atRound: 1 },
                spawns: [
                    {
                        characterId: 'dark_wolf',
                        name: 'Wolf',
                        spawnBehaviour: 'anywhere',
                        spawnZoneId: 'nonexistent zone',
                        spawnCount: 1,
                        unitAITreeId: 'hunt',
                    },
                ],
            },
        ]);

        engine.state.levelEventManager.processLevelEvents();

        expect(engine.units.filter((u) => u.characterId === 'dark_wolf')).toHaveLength(0);
    });

    it('continuousSpawn: spawns units only on tiles within the registered zone', () => {
        const engine = setupEngine();
        // continuousSpawn only fires once gameTime has advanced past intervalRounds * ROUND_DURATION(10s),
        // even for the first spawn — see LevelEventManager.processContinuousSpawnEvent.
        engine.gameTime = 10;
        engine.registerLevelEvents([
            {
                type: 'continuousSpawn',
                trigger: { intervalRounds: 1 },
                spawns: [
                    {
                        characterId: 'dark_wolf',
                        name: 'Wolf',
                        spawnBehaviour: 'anywhere',
                        spawnZoneId: 'test zone',
                        spawnCount: 2,
                        unitAITreeId: 'hunt',
                    },
                ],
            },
        ]);

        engine.state.levelEventManager.processLevelEvents();

        const wolves = engine.units.filter((u) => u.characterId === 'dark_wolf');
        expect(wolves).toHaveLength(2);
        for (const wolf of wolves) {
            const { col, row } = engine.terrainManager!.grid.worldToGrid(wolf.x, wolf.y);
            expect(col).toBeGreaterThanOrEqual(2);
            expect(col).toBeLessThanOrEqual(4);
            expect(row).toBeGreaterThanOrEqual(2);
            expect(row).toBeLessThanOrEqual(4);
        }
    });
});
