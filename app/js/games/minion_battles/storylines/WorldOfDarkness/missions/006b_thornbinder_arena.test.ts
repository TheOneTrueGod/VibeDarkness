import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { TerrainType } from '../../../terrain/TerrainType';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import {
    ARENA_CAMPFIRE_LIGHT_AMOUNT,
    ARENA_CAMPFIRE_LIGHT_RADIUS,
    ARENA_DARK_CRYSTAL_LIGHT_AMOUNT,
    ARENA_DARK_CRYSTAL_LIGHT_RADIUS,
    ARENA_ORIGIN_COL,
    ARENA_WAVE_SPAWN_RADIUS_TILES,
    arenaLocalToGlobal,
    OPENING_THORNBINDER_COUNT,
    OPENING_WOLF_COUNT,
    THORNBINDER_ARENA,
    THORNBINDER_ARENA_LAST_WAVE_ROUND,
    THORNBINDER_ARENA_WAVE_COUNT,
    THORNBINDER_ARENA_WAVE_ROUNDS,
    WAVE_SPAWN_COUNT,
    WAVE_THORNBINDER_COUNT,
    WAVE_WOLF_COUNT,
} from './006b_thornbinder_arena';
import {
    ARENA_RING_SPAWN_COUNT,
    ARENA_RING_SPAWN_POINTS,
    ARENA_RING_SPAWN_RADIUS,
    ARENA_WEST_PATH_COL_END,
    ARENA_WEST_PATH_COL_START,
    ARENA_WEST_PATH_ROW_END,
    ARENA_WEST_PATH_ROW_START,
    BOSS_ARENA_CENTER,
    BOSS_ARENA_DIRT_RADIUS,
    BOSS_ARENA_ROCKS,
    BOSS_ARENA_SEGMENT_ID,
    BOSS_ARENA_SIZE,
    rightmostArenaRingSpawnPoints,
} from '../MapSegments/0_0_boss_arena';
import {
    EAST_CAVE_CAMPFIRE,
    EAST_CAVE_SEGMENT_ID,
    EAST_WALL_OPENING_ROW,
    EAST_WALL_OPENING_SIZE,
} from '../MapSegments/10_10_east_cave';
import { HOME_CAMPFIRE_MAX_HP } from '../../homeBase';
import { DarknessLevel } from '../../../game/darknessLevels';
import type { LevelEventSpawnWave } from '../../types';

registerWorldOfDarknessSegments();

function initArena(seed: number): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: seed });
    const terrain = THORNBINDER_ARENA.createTerrain();
    const terrainManager = new TerrainManager(terrain);
    const composed = THORNBINDER_ARENA.composeMap();
    THORNBINDER_ARENA.initializeGameState(engine, {
        playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: { p1: ['004'] },
        terrainManager,
        terrainSegmentPOIs: composed?.pois,
        terrainSegmentZones: composed?.zones,
    });
    return engine;
}

describe('ThornbinderArenaMission', () => {
    it('places the 10_10 home west of the arena', () => {
        const composed = THORNBINDER_ARENA.composeMap();
        expect(composed?.spawnPlacement).toMatchObject({
            id: EAST_CAVE_SEGMENT_ID,
            originCol: 0,
            originRow: 0,
        });
        expect(composed?.placements.find((p) => p.id === BOSS_ARENA_SEGMENT_ID)).toMatchObject({
            originCol: ARENA_ORIGIN_COL,
            originRow: 0,
        });
        expect(composed?.cols).toBe(BOSS_ARENA_SIZE + ARENA_ORIGIN_COL);
        expect(THORNBINDER_ARENA.lightLevelEnabled).toBe(true);
        expect(THORNBINDER_ARENA.globalLightLevel).toBe(DarknessLevel.FULL_DARKNESS);

        const terrain = THORNBINDER_ARENA.createTerrain();
        const seamHomeCol = ARENA_ORIGIN_COL - 1;
        const seamArenaCol = ARENA_ORIGIN_COL;
        for (let r = EAST_WALL_OPENING_ROW; r < EAST_WALL_OPENING_ROW + EAST_WALL_OPENING_SIZE; r++) {
            expect(terrain.get(seamHomeCol, r)).toBe(TerrainType.Dirt);
            expect(terrain.get(seamArenaCol, r)).toBe(TerrainType.Dirt);
        }
        for (let c = ARENA_WEST_PATH_COL_START; c <= ARENA_WEST_PATH_COL_END; c++) {
            for (let r = ARENA_WEST_PATH_ROW_START; r <= ARENA_WEST_PATH_ROW_END; r++) {
                expect(terrain.get(ARENA_ORIGIN_COL + c, r)).toBe(TerrainType.Dirt);
            }
        }
    });

    it('places seven ring crystals on dirt, skipping due-west and rocks', () => {
        expect(ARENA_RING_SPAWN_POINTS).toHaveLength(ARENA_RING_SPAWN_COUNT);
        const dueWest = {
            col: BOSS_ARENA_CENTER.col - ARENA_RING_SPAWN_RADIUS,
            row: BOSS_ARENA_CENTER.row,
        };
        expect(ARENA_RING_SPAWN_POINTS).not.toContainEqual(dueWest);

        const terrain = THORNBINDER_ARENA.createTerrain();
        for (const spot of ARENA_RING_SPAWN_POINTS) {
            const global = arenaLocalToGlobal(spot);
            const dc = spot.col - BOSS_ARENA_CENTER.col;
            const dr = spot.row - BOSS_ARENA_CENTER.row;
            expect(dc * dc + dr * dr).toBeLessThanOrEqual(BOSS_ARENA_DIRT_RADIUS * BOSS_ARENA_DIRT_RADIUS);
            expect(terrain.get(global.col, global.row)).toBe(TerrainType.Dirt);
            expect(BOSS_ARENA_ROCKS).not.toContainEqual(spot);
        }
    });

    it('starts with three thornbinders on the rightmost ring spots and three wolves on other ring spots', () => {
        const engine = initArena(42);
        const binders = engine.units.filter((u) => u.characterId === 'thornbinder');
        expect(binders).toHaveLength(OPENING_THORNBINDER_COUNT);

        const expectedBinders = rightmostArenaRingSpawnPoints(OPENING_THORNBINDER_COUNT).map(arenaLocalToGlobal);
        const binderCells = binders.map((u) => ({
            col: Math.floor(u.x / CELL_SIZE),
            row: Math.floor(u.y / CELL_SIZE),
        }));
        expect(binderCells).toEqual(expect.arrayContaining(expectedBinders));
        expect(binderCells).toHaveLength(expectedBinders.length);

        const ringWorldKeys = new Set(
            ARENA_RING_SPAWN_POINTS.map((p) => {
                const global = arenaLocalToGlobal(p);
                return `${global.col},${global.row}`;
            }),
        );
        const binderKeys = new Set(binderCells.map((c) => `${c.col},${c.row}`));
        const wolves = engine.units.filter((u) => u.characterId === 'dark_wolf');
        expect(wolves).toHaveLength(OPENING_WOLF_COUNT);
        const wolfKeys = wolves.map((u) => {
            const col = Math.floor(u.x / CELL_SIZE);
            const row = Math.floor(u.y / CELL_SIZE);
            const key = `${col},${row}`;
            expect(ringWorldKeys.has(key)).toBe(true);
            expect(binderKeys.has(key)).toBe(false);
            return key;
        });
        expect(new Set(wolfKeys).size).toBe(OPENING_WOLF_COUNT);

        const crystals = engine.specialTiles.filter((t) => t.defId === 'DarkCrystal');
        expect(crystals).toHaveLength(ARENA_RING_SPAWN_COUNT);
        for (const spot of ARENA_RING_SPAWN_POINTS) {
            const global = arenaLocalToGlobal(spot);
            const crystal = crystals.find((t) => t.col === global.col && t.row === global.row);
            expect(crystal?.emitsLight).toMatchObject({
                lightAmount: ARENA_DARK_CRYSTAL_LIGHT_AMOUNT,
                radius: ARENA_DARK_CRYSTAL_LIGHT_RADIUS,
                lightType: 'DarkLight',
            });
        }

        const campfire = engine.specialTiles.find((t) => t.defId === 'Campfire');
        expect(campfire).toMatchObject({
            col: EAST_CAVE_CAMPFIRE.col,
            row: EAST_CAVE_CAMPFIRE.row,
            maxHp: HOME_CAMPFIRE_MAX_HP,
            emitsLight: {
                lightAmount: ARENA_CAMPFIRE_LIGHT_AMOUNT,
                radius: ARENA_CAMPFIRE_LIGHT_RADIUS,
            },
        });

        engine.destroy();
    });

    it('schedules three waves of one thornbinder and two wolves at distinct ring spots', () => {
        const engine = initArena(7);
        const waves = THORNBINDER_ARENA.levelEvents.filter(
            (evt): evt is LevelEventSpawnWave => evt.type === 'spawnWave',
        );
        expect(waves).toHaveLength(THORNBINDER_ARENA_WAVE_COUNT);
        expect(waves.map((w) => ('atRound' in w.trigger ? w.trigger.atRound : null))).toEqual(
            THORNBINDER_ARENA_WAVE_ROUNDS,
        );

        const ringWorldKeys = new Set(
            ARENA_RING_SPAWN_POINTS.map((p) => {
                const global = arenaLocalToGlobal(p);
                return `${global.col},${global.row}`;
            }),
        );
        for (const wave of waves) {
            expect(wave.spawns).toHaveLength(WAVE_SPAWN_COUNT);
            expect(wave.spawns.filter((s) => s.characterId === 'thornbinder')).toHaveLength(
                WAVE_THORNBINDER_COUNT,
            );
            expect(wave.spawns.filter((s) => s.characterId === 'dark_wolf')).toHaveLength(WAVE_WOLF_COUNT);

            const cells = wave.spawns.map((s) => {
                const target = s.spawnTarget!;
                expect(s.spawnBehaviour).toBe('anywhere');
                expect(target.radius).toBe(ARENA_WAVE_SPAWN_RADIUS_TILES);
                return `${Math.floor(target.x / CELL_SIZE)},${Math.floor(target.y / CELL_SIZE)}`;
            });
            expect(new Set(cells).size).toBe(WAVE_SPAWN_COUNT);
            for (const key of cells) {
                expect(ringWorldKeys.has(key)).toBe(true);
            }
        }

        const victory = THORNBINDER_ARENA.levelEvents.find((evt) => evt.type === 'victoryCheck');
        expect(victory).toMatchObject({
            trigger: { afterRound: THORNBINDER_ARENA_LAST_WAVE_ROUND },
            conditions: [{ type: 'eliminateAllEnemies' }],
        });

        engine.destroy();
    });
});
