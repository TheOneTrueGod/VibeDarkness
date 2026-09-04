/**
 * Thornbinder Arena — first fight after Core Awakening.
 * Layout: 10_10 east-mouth cave west of the 0_0 dirt circle. Dark crystals mark seven
 * ring spawns (west skipped so the cave mouth stays clear).
 */

import type { GameEngine } from '../../../game/GameEngine';
import { BaseMissionDef, type InitializeGameStateParams } from '../../BaseMissionDef';
import { HOME_CAMPFIRE_MAX_HP } from '../../homeBase';
import type {
    BattleObjectiveDef,
    EnemySpawnDef,
    LevelEvent,
    MissionMapLayout,
    SpawnWaveEntry,
    SpecialTilePlacement,
} from '../../types';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { DarknessLevel } from '../../../game/darknessLevels';
import { ENEMY_DARK_WOLF, ENEMY_THORNBINDER } from '../../../constants/enemyConstants';
import { NINJUTSU_3_FLURRY_PER_ROUND } from '../../../game/ninjutsu/ninjutsuConfig';
import { DARK_CRYSTAL_TILE_DEFAULTS } from '../MapSegments/50_50_crystal_cave';
import {
    EAST_CAVE_CAMPFIRE,
    EAST_CAVE_SEGMENT_ID,
    EAST_CAVE_SIZE,
} from '../MapSegments/10_10_east_cave';
import {
    ARENA_RING_SPAWN_POINTS,
    BOSS_ARENA_SEGMENT_ID,
    BOSS_ARENA_SIZE,
    rightmostArenaRingSpawnPoints,
} from '../MapSegments/0_0_boss_arena';

export const THORNBINDER_ARENA_LAYOUT: MissionMapLayout = [
    [{ kind: 'spawn' }, { kind: 'segment', id: BOSS_ARENA_SEGMENT_ID }],
];

/** Arena sits east of the 10_10 home tile. */
export const ARENA_ORIGIN_COL = EAST_CAVE_SIZE;
export const ARENA_ORIGIN_ROW = 0;

const COLS = EAST_CAVE_SIZE + BOSS_ARENA_SIZE;
const ROWS = BOSS_ARENA_SIZE;
const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

export const OPENING_THORNBINDER_COUNT = 3;
export const OPENING_WOLF_COUNT = 3;
export const WAVE_THORNBINDER_COUNT = 1;
export const WAVE_WOLF_COUNT = 2;
export const WAVE_SPAWN_COUNT = WAVE_THORNBINDER_COUNT + WAVE_WOLF_COUNT;
export const THORNBINDER_ARENA_WAVE_COUNT = 3;
export const THORNBINDER_ARENA_FIRST_WAVE_ROUND = 2;
export const THORNBINDER_ARENA_WAVE_ROUNDS = Array.from(
    { length: THORNBINDER_ARENA_WAVE_COUNT },
    (_, i) => THORNBINDER_ARENA_FIRST_WAVE_ROUND + i,
);
export const THORNBINDER_ARENA_LAST_WAVE_ROUND =
    THORNBINDER_ARENA_FIRST_WAVE_ROUND + THORNBINDER_ARENA_WAVE_COUNT - 1;

export const ARENA_DARK_CRYSTAL_LIGHT_AMOUNT = 4;
export const ARENA_DARK_CRYSTAL_LIGHT_RADIUS = 3;
export const ARENA_CAMPFIRE_LIGHT_AMOUNT = 6;
export const ARENA_CAMPFIRE_LIGHT_RADIUS = 3;
/** Anywhere-spawn radius (tiles) around a crystal — units may land on the crystal cell or a neighbor. */
export const ARENA_WAVE_SPAWN_RADIUS_TILES = 1;

export function arenaLocalToGlobal(spot: { col: number; row: number }): { col: number; row: number } {
    return { col: spot.col + ARENA_ORIGIN_COL, row: spot.row + ARENA_ORIGIN_ROW };
}

export function arenaGridToWorld(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

function pickDistinct<T>(engine: GameEngine, items: readonly T[], count: number): T[] {
    const remaining = [...items];
    const picked: T[] = [];
    for (let i = 0; i < count; i++) {
        const idx = engine.generateRandomInteger(0, remaining.length - 1);
        picked.push(remaining.splice(idx, 1)[0]!);
    }
    return picked;
}

function spawnAtSpot(characterId: 'thornbinder' | 'dark_wolf', spot: { col: number; row: number }): SpawnWaveEntry {
    const global = arenaLocalToGlobal(spot);
    const world = arenaGridToWorld(global.col, global.row);
    const template = characterId === 'thornbinder' ? ENEMY_THORNBINDER : ENEMY_DARK_WOLF;
    return {
        characterId,
        name: template.name,
        spawnBehaviour: 'anywhere',
        spawnTarget: { x: world.x, y: world.y, radius: ARENA_WAVE_SPAWN_RADIUS_TILES },
        spawnCount: 1,
        unitAITreeId: template.unitAITreeId,
    };
}

function buildWaveEvents(engine: GameEngine): LevelEvent[] {
    return THORNBINDER_ARENA_WAVE_ROUNDS.map((atRound) => {
        const spots = pickDistinct(engine, ARENA_RING_SPAWN_POINTS, WAVE_SPAWN_COUNT);
        const spawns: SpawnWaveEntry[] = [
            spawnAtSpot('thornbinder', spots[0]!),
            ...spots.slice(WAVE_THORNBINDER_COUNT).map((spot) => spawnAtSpot('dark_wolf', spot)),
        ];
        return { type: 'spawnWave' as const, trigger: { atRound }, spawns };
    });
}

const VICTORY_EVENT: LevelEvent = {
    type: 'victoryCheck',
    trigger: { afterRound: THORNBINDER_ARENA_LAST_WAVE_ROUND },
    conditions: [{ type: 'eliminateAllEnemies' }],
};

const BATTLE_OBJECTIVES: BattleObjectiveDef[] = [
    {
        id: 'survive_waves',
        label: 'Survive the arena waves',
        toComplete: { type: 'atLeastRound', round: THORNBINDER_ARENA_LAST_WAVE_ROUND },
    },
    {
        id: 'clear_arena',
        label: 'Defeat the remaining creatures',
        revealedInitially: false,
        requiresCompletedId: 'survive_waves',
        toComplete: { type: 'eliminateAllEnemies' },
    },
];

function openingThornbinders(): EnemySpawnDef[] {
    return rightmostArenaRingSpawnPoints(OPENING_THORNBINDER_COUNT).map((spot) => {
        const global = arenaLocalToGlobal(spot);
        return {
            ...ENEMY_THORNBINDER,
            position: arenaGridToWorld(global.col, global.row),
        };
    });
}

function ringSpotKey(spot: { col: number; row: number }): string {
    return `${spot.col},${spot.row}`;
}

function openingWolves(engine: GameEngine): EnemySpawnDef[] {
    const taken = new Set(rightmostArenaRingSpawnPoints(OPENING_THORNBINDER_COUNT).map(ringSpotKey));
    const free = ARENA_RING_SPAWN_POINTS.filter((spot) => !taken.has(ringSpotKey(spot)));
    return pickDistinct(engine, free, OPENING_WOLF_COUNT).map((spot) => {
        const global = arenaLocalToGlobal(spot);
        return {
            ...ENEMY_DARK_WOLF,
            position: arenaGridToWorld(global.col, global.row),
        };
    });
}

const DARK_CRYSTAL_TILES: SpecialTilePlacement[] = ARENA_RING_SPAWN_POINTS.map((spot) => {
    const global = arenaLocalToGlobal(spot);
    return {
        ...DARK_CRYSTAL_TILE_DEFAULTS,
        col: global.col,
        row: global.row,
        emitsLight: {
            lightAmount: ARENA_DARK_CRYSTAL_LIGHT_AMOUNT,
            radius: ARENA_DARK_CRYSTAL_LIGHT_RADIUS,
            lightType: 'DarkLight',
        },
    };
});

const HOME_CAMPFIRE_TILE: SpecialTilePlacement = {
    defId: 'Campfire',
    col: EAST_CAVE_CAMPFIRE.col,
    row: EAST_CAVE_CAMPFIRE.row,
    hp: HOME_CAMPFIRE_MAX_HP,
    emitsLight: { lightAmount: ARENA_CAMPFIRE_LIGHT_AMOUNT, radius: ARENA_CAMPFIRE_LIGHT_RADIUS },
};

export class ThornbinderArenaMission extends BaseMissionDef {
    static readonly missionId = 'thornbinder_arena';
    static readonly nameStr = 'Thornbinder Arena';

    campaignId = 'world_of_darkness';
    missionId = ThornbinderArenaMission.missionId;
    name = ThornbinderArenaMission.nameStr;
    /** Chapter 2 grid — top row (Surface Quests bank holds the top-left slot). */
    mapPosition = { x: 320, y: 150 };
    missionType = 'battle' as const;
    description =
        'Thornbinders hold a dirt circle east of the cave. Dark crystals mark the ring — more will come.';

    mapLayout = THORNBINDER_ARENA_LAYOUT;
    spawnSegmentId = EAST_CAVE_SEGMENT_ID;
    segmentIds = [EAST_CAVE_SEGMENT_ID, BOSS_ARENA_SEGMENT_ID];

    worldWidth = WORLD_WIDTH;
    worldHeight = WORLD_HEIGHT;

    enemies: EnemySpawnDef[] = openingThornbinders();
    battleObjectives = BATTLE_OBJECTIVES;
    levelEvents: LevelEvent[] = [VICTORY_EVENT];
    specialTiles: SpecialTilePlacement[] = [...DARK_CRYSTAL_TILES, HOME_CAMPFIRE_TILE];

    lightLevelEnabled = true;
    globalLightLevel = DarknessLevel.FULL_DARKNESS;
    ninjutsuPools = { shadow: NINJUTSU_3_FLURRY_PER_ROUND };

    override initializeGameState(engine: GameEngine, params: InitializeGameStateParams): void {
        this.enemies = [...openingThornbinders(), ...openingWolves(engine)];
        this.levelEvents = [...buildWaveEvents(engine), VICTORY_EVENT];
        engine.setLevelEvents(this.levelEvents);
        super.initializeGameState(engine, params);
    }
}

export const THORNBINDER_ARENA = new ThornbinderArenaMission();
