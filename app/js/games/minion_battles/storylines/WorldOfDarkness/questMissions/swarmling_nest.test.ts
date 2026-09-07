import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { TerrainType } from '../../../terrain/TerrainType';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import { SWARM_NEST_CHARACTER_ID } from '../../../game/lanternite/swarmNestTick';
import {
    ARENA_DARK_CRYSTAL_LIGHT_AMOUNT,
    ARENA_DARK_CRYSTAL_LIGHT_RADIUS,
    CENTRE_SWARMLING_COUNT,
    CENTRE_WOLF_COUNT,
    RING_BURST_INTERVAL_SEC,
    RING_BURST_WAVE_COUNT,
    RING_BURST_WINDOW_SEC,
    ringBurstWaveTimeSec,
    SWARM_NEST_SPAWN_COUNT,
    SWARM_NEST_SPAWN_INTERVAL_SEC,
    SWARMLING_NEST,
    SWARMLING_NEST_MISSION_ID,
    SWARMLING_NEST_NAME,
    SWARMLING_NEST_OBJECTIVE_LABEL,
} from './swarmling_nest';
import {
    ARENA_RING_SPAWN_POINTS,
    ARENA_OUTSIDE_ROAD_SPAWN_POINTS,
    BOSS_ARENA_CENTER,
} from '../MapSegments/0_0_boss_arena';

registerWorldOfDarknessSegments();

function initMission(seed: number): { engine: GameEngine; cellSize: number } {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: seed });
    const terrain = SWARMLING_NEST.createTerrain();
    const terrainManager = new TerrainManager(terrain);
    SWARMLING_NEST.initializeGameState(engine, {
        playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: { p1: ['004'] },
        terrainManager,
    });
    return { engine, cellSize: terrain.cellSize };
}

describe('SwarmlingNestMission', () => {
    it('is registered under its mission id', () => {
        expect(SWARMLING_NEST.missionId).toBe(SWARMLING_NEST_MISSION_ID);
        expect(SWARMLING_NEST.name).toBe(SWARMLING_NEST_NAME);
        expect(SWARMLING_NEST.battleObjectives?.[0]?.label).toBe(SWARMLING_NEST_OBJECTIVE_LABEL);
        expect(SWARMLING_NEST_MISSION_ID).toBe('swarmling_nest');
    });

    it('spawns the player party on the west road around the outside_road point', () => {
        const { engine, cellSize } = initMission(42);
        const player = engine.units.find((u) => u.teamId === 'player');
        expect(player).toBeDefined();
        const col = Math.floor(player!.x / cellSize);
        const row = Math.floor(player!.y / cellSize);
        expect(
            ARENA_OUTSIDE_ROAD_SPAWN_POINTS.some((p) => p.col === col && p.row === row),
        ).toBe(true);
        engine.destroy();
    });

    it('opens with wolves + swarmlings knotted at the ring centre and a swarm nest', () => {
        const { engine } = initMission(42);
        const wolves = engine.units.filter((u) => u.characterId === 'dark_wolf');
        const swarmlings = engine.units.filter((u) => u.characterId === 'swarmling');
        expect(wolves).toHaveLength(CENTRE_WOLF_COUNT);
        expect(swarmlings).toHaveLength(CENTRE_SWARMLING_COUNT);

        const nest = engine.units.find((u) => u.characterId === SWARM_NEST_CHARACTER_ID);
        expect(nest).toBeDefined();
        expect(nest!.swarmState.nestConfig?.spawnCount).toBe(SWARM_NEST_SPAWN_COUNT);
        expect(nest!.swarmState.nestConfig?.spawnIntervalSec).toBe(SWARM_NEST_SPAWN_INTERVAL_SEC);
        engine.destroy();
    });

    it('puts a darklight crystal on every Arena Ring point', () => {
        const { engine } = initMission(42);
        for (const pt of ARENA_RING_SPAWN_POINTS) {
            const tile = engine.specialTiles.find((t) => t.col === pt.col && t.row === pt.row);
            expect(tile, `crystal at ${pt.col},${pt.row}`).toBeDefined();
            expect(tile!.defId).toBe('DarkCrystal');
            expect(tile!.emitsLight?.lightType).toBe('DarkLight');
            expect(tile!.emitsLight?.lightAmount).toBe(ARENA_DARK_CRYSTAL_LIGHT_AMOUNT);
            expect(tile!.emitsLight?.radius).toBe(ARENA_DARK_CRYSTAL_LIGHT_RADIUS);
        }
        engine.destroy();
    });

    it('schedules a ring burst across the first three rounds, each near a ring point', () => {
        const { engine, cellSize } = initMission(7);
        const waves = SWARMLING_NEST.levelEvents!.filter((e) => e.type === 'spawnWave');
        expect(waves).toHaveLength(RING_BURST_WAVE_COUNT);

        const times = waves.map((wave) => {
            if (wave.type !== 'spawnWave' || !('afterSeconds' in wave.trigger)) throw new Error('bad wave');
            return wave.trigger.afterSeconds;
        });
        expect(times).toEqual(
            Array.from({ length: RING_BURST_WAVE_COUNT }, (_, i) => ringBurstWaveTimeSec(i)),
        );
        expect(times[0]).toBeGreaterThan(0);
        expect(times[times.length - 1]).toBeLessThan(RING_BURST_WINDOW_SEC);
        expect(times[1]! - times[0]!).toBe(RING_BURST_INTERVAL_SEC);

        const ringWorld = ARENA_RING_SPAWN_POINTS.map((p) => ({
            x: p.col * cellSize + cellSize / 2,
            y: p.row * cellSize + cellSize / 2,
        }));
        for (const wave of waves) {
            if (wave.type !== 'spawnWave') throw new Error('bad wave');
            const characterIds = wave.spawns.map((s) => s.characterId).sort();
            expect(characterIds).toEqual(['slime', 'swarmling']);
            for (const spawn of wave.spawns) {
                expect(spawn.spawnBehaviour).toBe('anywhere');
                const onRing = ringWorld.some(
                    (r) => r.x === spawn.spawnTarget?.x && r.y === spawn.spawnTarget?.y,
                );
                expect(onRing).toBe(true);
            }
        }
        engine.destroy();
    });

    it('wins by eliminating every enemy', () => {
        const { engine } = initMission(42);
        const victory = SWARMLING_NEST.levelEvents!.find((e) => e.type === 'victoryCheck');
        expect(victory).toBeDefined();
        if (victory?.type !== 'victoryCheck') throw new Error('no victory check');
        expect(victory.conditions).toEqual([{ type: 'eliminateAllEnemies' }]);
        expect(victory.missionResult).toBe('victory');
        engine.destroy();
    });

    it('keeps the outside_road spawn tiles on the west dirt trail', () => {
        const terrain = SWARMLING_NEST.createTerrain();
        for (const p of ARENA_OUTSIDE_ROAD_SPAWN_POINTS) {
            expect(terrain.get(p.col, p.row), `dirt at ${p.col},${p.row}`).toBe(TerrainType.Dirt);
        }
        // Centre of the ring is where the nest sits.
        expect(BOSS_ARENA_CENTER).toEqual({ col: 11, row: 11 });
    });
});
