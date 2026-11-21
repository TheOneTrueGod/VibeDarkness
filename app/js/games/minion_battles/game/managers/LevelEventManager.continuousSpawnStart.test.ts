import { describe, it, expect, vi } from 'vitest';
import { GameEngine } from '../GameEngine';
import { resetGameObjectIdCounter } from '../GameObject';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainType } from '../../terrain/TerrainType';
import { continuousSpawnStartGameTime } from './LevelEventManager';
import { darkShare } from '../lighting/darkShare';
import { lanterniteStateOf } from '../units/components/lanterniteComponent';

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
        expect(lanterniteStateOf(lanternite!).nestOwnerUnitId).toBe('nest_1');
        expect(lanterniteStateOf(lanternite!).patrolFarWorld).toEqual({ x: 123, y: 456 });
        expect(lanterniteStateOf(lanternite!).patrolLeg).toBe('toFar');
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

describe('LevelEventManager continuousSpawn darknessScaling', () => {
    /** 10x10 grid: the first `darkTiles` cells (row-major) are fully dark, the rest lit. */
    function darkenFirst(engine: GameEngine, darkTiles: number): void {
        engine.lightLevelEnabled = true;
        vi.spyOn(engine, 'getLightAt').mockImplementation((col, row) => (row * 10 + col < darkTiles ? 0 : 1));
    }

    function registerScaled(engine: GameEngine): void {
        engine.registerLevelEvents([
            {
                type: 'continuousSpawn',
                trigger: { intervalRounds: 1, startRound: 1 },
                darknessScaling: {
                    minShare: 0.15,
                    intervalRounds: { atMin: 2, atFull: 1 },
                    maxUnits: { base: 1, perShare: 2 },
                },
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

    function runAt(engine: GameEngine, time: number): void {
        engine.gameTime = time;
        engine.state.levelEventManager.processLevelEvents();
    }

    it('samples the share of passable tiles in full darkness', () => {
        const engine = setupEngine();
        darkenFirst(engine, 25);
        expect(darkShare(engine)).toBeCloseTo(0.25);
    });

    it('spawns nothing below the minimum share', () => {
        const engine = setupEngine();
        darkenFirst(engine, 14);
        registerScaled(engine);
        runAt(engine, 0);
        runAt(engine, 100);
        expect(wolfCount(engine)).toBe(0);
    });

    it('waits the long interval at the gate and the short one when fully dark', () => {
        const gate = setupEngine();
        darkenFirst(gate, 15);
        registerScaled(gate);
        runAt(gate, 0);
        expect(wolfCount(gate)).toBe(0); // 2 rounds at the gate: 20 s after the 10 s lead-in
        runAt(gate, 10);
        expect(wolfCount(gate)).toBe(1);
        gate.units.length = 0;
        runAt(gate, 20);
        expect(wolfCount(gate)).toBe(0);
        runAt(gate, 30);
        expect(wolfCount(gate)).toBe(1);

        const full = setupEngine();
        darkenFirst(full, 100);
        registerScaled(full);
        runAt(full, 0);
        full.units.length = 0;
        runAt(full, 10);
        expect(wolfCount(full)).toBe(1); // 1 round fully dark
    });

    it('caps living units at base + floor(perShare * share)', () => {
        const low = setupEngine();
        darkenFirst(low, 20); // cap 1 + floor(0.4) = 1
        registerScaled(low);
        for (let t = 0; t <= 100; t += 10) runAt(low, t);
        expect(wolfCount(low)).toBe(1);

        const full = setupEngine();
        darkenFirst(full, 100); // cap 1 + 2 = 3
        registerScaled(full);
        for (let t = 0; t <= 100; t += 10) runAt(full, t);
        expect(wolfCount(full)).toBe(3);
    });

    it('does not sample darkness between checks', () => {
        const engine = setupEngine();
        darkenFirst(engine, 100);
        registerScaled(engine);
        const spy = vi.mocked(engine.getLightAt);
        engine.gameTick = 3;
        runAt(engine, 0);
        expect(spy).not.toHaveBeenCalled();
    });
});
