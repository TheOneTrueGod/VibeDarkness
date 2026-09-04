/**
 * Swarmling Nest — finale of the "Find the herd of boars" quest.
 *
 * Arena: the 0_0 dirt circle, entered from the west road (the `outside_road` POI).
 * A swarm nest squats dead centre with a starting knot of wolves and swarmlings;
 * darklight crystals ring every Arena Ring point, and slimes / swarmlings boil out
 * of the ring for the first two seconds. Kill every enemy to win.
 */

import type { GameEngine } from '../../../game/GameEngine';
import { BaseMissionDef, type InitializeGameStateParams } from '../../BaseMissionDef';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import { DarknessLevel } from '../../../game/darknessLevels';
import type {
    BattleObjectiveDef,
    EnemySpawnDef,
    LevelEvent,
    PlayerSpawnPoint,
    SpawnWaveEntry,
    SpecialTilePlacement,
} from '../../types';
import type { PreMissionStoryDef, PostMissionStoryDef } from '../../storyTypes';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { ENEMY_DARK_WOLF, ENEMY_SWARMLING } from '../../../constants/enemyConstants';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { getTerrainForSegment } from '../../../terrain/segmentRegistry';
import { SWARM_NEST_CHARACTER_ID } from '../../../game/lanternite/swarmNestTick';
import { scatterPositionsInCircle } from '../../missionSpawnHelpers';
import { DARK_CRYSTAL_TILE_DEFAULTS } from '../MapSegments/50_50_crystal_cave';
import {
    MAP_SEGMENT_0_0_BOSS_ARENA,
    BOSS_ARENA_SEGMENT_ID,
    BOSS_ARENA_SIZE,
    BOSS_ARENA_CENTER,
    ARENA_RING_SPAWN_POINTS,
    ARENA_OUTSIDE_ROAD_SPAWN_POINTS,
} from '../MapSegments/0_0_boss_arena';

export const SWARMLING_NEST_MISSION_ID = 'swarmling_nest';

const COLS = BOSS_ARENA_SIZE;
const ROWS = BOSS_ARENA_SIZE;
const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

const _ = TerrainType.Grass;

function createTerrain(): TerrainGrid {
    const stitched = stitchTerrain(
        [[getTerrainForSegment(BOSS_ARENA_SEGMENT_ID, MAP_SEGMENT_0_0_BOSS_ARENA)]],
        _,
    );
    return TerrainGrid.createTerrainFromArray(COLS, ROWS, CELL_SIZE, stitched, _);
}

function gridToWorld(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

// --- Opening knot in the centre of the rocky circle --------------------------
export const CENTRE_WOLF_COUNT = 3;
export const CENTRE_SWARMLING_COUNT = 3;
/** Scatter radius (tiles) for the starting knot around the ring centre. */
export const CENTRE_SCATTER_RADIUS_TILES = 2.5;

// --- Ring reinforcement burst (first two seconds) ---------------------------
/** Slimes + swarmlings spawn on this cadence for {@link RING_BURST_WINDOW_SEC}. */
export const RING_BURST_INTERVAL_SEC = 0.25;
export const RING_BURST_WINDOW_SEC = 2;
export const RING_BURST_WAVE_COUNT = Math.round(RING_BURST_WINDOW_SEC / RING_BURST_INTERVAL_SEC);
/** Spawn radius (tiles) around the randomly chosen Arena Ring point. */
export const RING_BURST_SPAWN_RADIUS_TILES = 2;

// --- Swarm nest ------------------------------------------------------------
export const SWARM_NEST_MAX_SWARMLINGS = 8;
export const SWARM_NEST_SPAWN_INTERVAL_SEC = 3;
export const SWARM_NEST_SPAWN_COUNT = 2;

// --- Darklight crystals on the ring --------------------------------------
const ARENA_DARK_CRYSTAL_LIGHT_AMOUNT = 3;
const ARENA_DARK_CRYSTAL_LIGHT_RADIUS = 3;

const CENTRE_WORLD = gridToWorld(BOSS_ARENA_CENTER.col, BOSS_ARENA_CENTER.row);

/** One darklight crystal at each Arena Ring point. */
const DARK_CRYSTAL_TILES: SpecialTilePlacement[] = ARENA_RING_SPAWN_POINTS.map((pt) => ({
    ...DARK_CRYSTAL_TILE_DEFAULTS,
    col: pt.col,
    row: pt.row,
    emitsLight: {
        lightAmount: ARENA_DARK_CRYSTAL_LIGHT_AMOUNT,
        radius: ARENA_DARK_CRYSTAL_LIGHT_RADIUS,
        lightType: 'DarkLight',
    },
}));

/** Wolves + swarmlings scattered in the centre of the rocky circle (seeded RNG). */
function buildCentreKnot(engine: GameEngine): EnemySpawnDef[] {
    const target = { x: CENTRE_WORLD.x, y: CENTRE_WORLD.y, radius: CENTRE_SCATTER_RADIUS_TILES };
    const wolves = scatterPositionsInCircle(engine, target, CENTRE_WOLF_COUNT).map((position) => ({
        ...ENEMY_DARK_WOLF,
        position,
        unitAITreeId: 'hunt' as const,
    }));
    const swarmlings = scatterPositionsInCircle(engine, target, CENTRE_SWARMLING_COUNT).map(
        (position) => ({ ...ENEMY_SWARMLING, position, unitAITreeId: 'hunt' as const }),
    );
    return [...wolves, ...swarmlings];
}

/** Swarmling nest at the centre of the ring — periodically spits out swarmlings. */
function buildSwarmNest(): EnemySpawnDef {
    return {
        characterId: SWARM_NEST_CHARACTER_ID,
        name: 'Swarmling Nest',
        position: CENTRE_WORLD,
        teamId: 'enemy',
        abilities: [],
        aiSettings: { minRange: 0, maxRange: 0 },
        unitAITreeId: 'lanterniteNestIdle',
        swarmNest: {
            maxSwarmlings: SWARM_NEST_MAX_SWARMLINGS,
            spawnIntervalSec: SWARM_NEST_SPAWN_INTERVAL_SEC,
            spawnCount: SWARM_NEST_SPAWN_COUNT,
        },
    };
}

/** One burst wave: a slime + a swarmling at a random Arena Ring point, fired at `atSeconds`. */
function ringBurstWave(engine: GameEngine, atSeconds: number): LevelEvent {
    const ring =
        ARENA_RING_SPAWN_POINTS[
            engine.generateRandomInteger(0, ARENA_RING_SPAWN_POINTS.length - 1)
        ]!;
    const world = gridToWorld(ring.col, ring.row);
    const spawnTarget = { x: world.x, y: world.y, radius: RING_BURST_SPAWN_RADIUS_TILES };
    const spawns: SpawnWaveEntry[] = [
        {
            characterId: 'slime',
            spawnBehaviour: 'anywhere',
            spawnTarget,
            spawnCount: 1,
            unitAITreeId: 'hunt',
        },
        {
            characterId: 'swarmling',
            spawnBehaviour: 'anywhere',
            spawnTarget,
            spawnCount: 1,
            unitAITreeId: 'hunt',
        },
    ];
    return { type: 'spawnWave', trigger: { afterSeconds: atSeconds }, spawns };
}

function buildRingBurstWaves(engine: GameEngine): LevelEvent[] {
    const waves: LevelEvent[] = [];
    for (let i = 1; i <= RING_BURST_WAVE_COUNT; i++) {
        waves.push(ringBurstWave(engine, i * RING_BURST_INTERVAL_SEC));
    }
    return waves;
}

/** Victory the moment every enemy unit (nest included) is dead. */
const VICTORY_EVENT: LevelEvent = {
    type: 'victoryCheck',
    trigger: { afterRound: 0 },
    conditions: [{ type: 'eliminateAllEnemies' }],
    missionResult: 'victory',
};

const BATTLE_OBJECTIVES: BattleObjectiveDef[] = [
    {
        id: 'clear_arena',
        label: 'Destroy the swarmling nest and everything it spat out',
        toComplete: { type: 'eliminateAllEnemies' },
        showObjectiveMarker: {
            enable: true,
            target: { type: 'position', x: CENTRE_WORLD.x, y: CENTRE_WORLD.y },
            showOffscreen: true,
        },
    },
];

const PRE_MISSION_STORY: PreMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: "The boar tracks end at a dirt circle off the road. Something else got here first—the ground is boiling with swarmlings, and a nest sits dead centre.",
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
    ],
};

const POST_MISSION_STORY: PostMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: "The nest splits open and goes still. Whatever the boars were running from will not be running after them now.",
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
    ],
};

export class SwarmlingNestMission extends BaseMissionDef {
    segmentIds = [BOSS_ARENA_SEGMENT_ID];

    missionId = SWARMLING_NEST_MISSION_ID;
    mapPosition = undefined;
    missionType = 'battle' as const;
    description =
        'A swarmling nest has taken the dirt circle off the boar road. Clear every last one.';
    campaignId = 'world_of_darkness';
    name = 'Swarmling Nest';
    worldWidth = WORLD_WIDTH;
    worldHeight = WORLD_HEIGHT;
    /** Centre knot + nest are filled in {@link initializeGameState} (needs battle RNG). */
    enemies: EnemySpawnDef[] = [];
    levelEvents: LevelEvent[] = [VICTORY_EVENT];
    battleObjectives = BATTLE_OBJECTIVES;
    createTerrain = createTerrain;
    specialTiles = DARK_CRYSTAL_TILES;
    aiController = 'stateBased' as const;
    preMissionStory = PRE_MISSION_STORY;
    postMissionStory = POST_MISSION_STORY;
    lightLevelEnabled = true;
    globalLightLevel = DarknessLevel.FULL_DARKNESS;
    ninjutsuPools = { shadow: NINJUTSU_DISABLED };
    /** Party walks in from the west road, clustered on the dirt path (the `outside_road` POI). */
    playerSpawnPoints: PlayerSpawnPoint[] = ARENA_OUTSIDE_ROAD_SPAWN_POINTS.map((p) => ({ ...p }));

    override initializeGameState(engine: GameEngine, params: InitializeGameStateParams): void {
        this.enemies = [...buildCentreKnot(engine), buildSwarmNest()];
        this.levelEvents = [...buildRingBurstWaves(engine), VICTORY_EVENT];
        engine.setLevelEvents(this.levelEvents);
        super.initializeGameState(engine, params);
    }
}

export const SWARMLING_NEST = new SwarmlingNestMission();
