import { describe, it, expect } from 'vitest';
import { GameEngine } from '../GameEngine';
import { resetGameObjectIdCounter } from '../GameObject';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainType } from '../../terrain/TerrainType';
import { continuousSpawnStartGameTime } from './LevelEventManager';

function setupEngine(): GameEngine {
    resetGameObjectIdCounter(1);
    const grid = new TerrainGrid(10, 10, CELL_SIZE, TerrainType.Grass);
    const tm = new TerrainManager(grid);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1, terrainManager: tm });
    return engine;
}

function registerWolfEverywhere(engine: GameEngine, trigger: { intervalRounds: number; startRound?: number }) {
    engine.registerLevelEvents([
        {
            type: 'continuousSpawn',
            trigger,
            spawns: [
                {
                    characterId: 'dark_wolf',
                    name: 'Wolf',
                    spawnBehaviour: 'anywhere',
                    spawnCount: 1,
                    unitAITreeId: 'hunt',
                },
            ],
        },
    ]);
}

function wolfCount(engine: GameEngine): number {
    return engine.units.filter((u) => u.characterId === 'dark_wolf').length;
}

describe('continuousSpawnStartGameTime', () => {
    it('maps fractional start rounds to game-time offsets', () => {
        expect(continuousSpawnStartGameTime(0.5)).toBe(5);
        expect(continuousSpawnStartGameTime(1)).toBe(0);
        expect(continuousSpawnStartGameTime(1.5)).toBe(5);
    });
});

describe('LevelEventManager continuousSpawn lanternite ecology fields', () => {
    it('wires lanternPatrolFarWorld/lanterniteNestOwnerUnitId onto continuousSpawn-spawned lanternites (regression: previously only spawnWave/proximitySpawn wired these)', () => {
        const engine = setupEngine();
        engine.registerLevelEvents([
            {
                type: 'continuousSpawn',
                trigger: { intervalRounds: 1 },
                spawns: [
                    {
                        characterId: 'lanternite',
                        name: 'Lanternite',
                        spawnBehaviour: 'anywhere',
                        spawnCount: 1,
                        unitAITreeId: 'lanternitePatrol',
                        lanterniteNestOwnerUnitId: 'nest_1',
                        lanternPatrolFarWorld: { x: 123, y: 456 },
                        lanternPatrolLeg: 'toFar',
                    },
                ],
            },
        ]);

        engine.gameTime = 10;
        engine.state.levelEventManager.processLevelEvents();

        const lanternites = engine.units.filter((u) => u.characterId === 'lanternite');
        expect(lanternites).toHaveLength(1);
        const [lanternite] = lanternites;
        expect(lanternite!.lanterniteState.nestOwnerUnitId).toBe('nest_1');
        expect(lanternite!.lanterniteState.patrolFarWorld).toEqual({ x: 123, y: 456 });
        expect(lanternite!.lanterniteState.patrolLeg).toBe('toFar');
    });
});

describe('LevelEventManager continuousSpawn startRound', () => {
    it('fires the first spawn at startRound 0.5 (5s) for a 1.5-round interval', () => {
        const engine = setupEngine();
        registerWolfEverywhere(engine, { intervalRounds: 1.5, startRound: 0.5 });

        engine.gameTime = 4.9;
        engine.state.levelEventManager.processLevelEvents();
        expect(wolfCount(engine)).toBe(0);

        engine.gameTime = 5;
        engine.state.levelEventManager.processLevelEvents();
        expect(wolfCount(engine)).toBe(1);
    });

    it('fires the first slime-style spawn immediately when startRound is 1 and interval is 2', () => {
        const engine = setupEngine();
        registerWolfEverywhere(engine, { intervalRounds: 2, startRound: 1 });

        engine.gameTime = 0;
        engine.state.levelEventManager.processLevelEvents();
        expect(wolfCount(engine)).toBe(1);
    });

    it('keeps legacy timing when startRound is omitted (first spawn after one interval)', () => {
        const engine = setupEngine();
        registerWolfEverywhere(engine, { intervalRounds: 1 });

        engine.gameTime = 9.9;
        engine.state.levelEventManager.processLevelEvents();
        expect(wolfCount(engine)).toBe(0);

        engine.gameTime = 10;
        engine.state.levelEventManager.processLevelEvents();
        expect(wolfCount(engine)).toBe(1);
    });
});
